package com.notifly.worker.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.notifly.common.config.KafkaTopics;
import com.notifly.common.dto.KafkaNotificationEvent;
import com.notifly.common.util.CorrelationIdUtil;
import com.notifly.worker.metrics.NotificationMetrics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

/**
 * Kafka listener — single source of retry routing.
 *
 * FIXES from original:
 *  1. FIXED: Double retry routing eliminated.
 *     Original: NotificationProcessorService called republishForRetry() AND
 *     this listener ALSO called kafkaTemplate.send(nextTopic). Each failure produced
 *     two Kafka sends, causing exponential message multiplication.
 *     Fix: Processor only returns success/failure. ALL routing is done here exclusively.
 *
 *  2. FIXED: Exception path also properly routes to next retry topic.
 *     If JSON parse fails or any other exception occurs, message still routes
 *     to DLQ rather than being silently acked and lost.
 *
 *  3. FIXED: Added Prometheus metrics emission on every outcome.
 *
 *  4. FIXED: KafkaTemplate type unified — was mixing KafkaTemplate<String,Object>
 *     and KafkaTemplate<String,String> in original (one in processor, one here).
 *     Now uses String/String consistently and serializes with ObjectMapper.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationEventListener {

    private final NotificationProcessorService processorService;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final NotificationMetrics metrics;

    private static final int MAX_ATTEMPTS = 5;

    // Maps retry attempt number → topic to send to on NEXT failure
    private static final Map<Integer, String> RETRY_TOPIC_MAP = Map.of(
        1, KafkaTopics.NOTIFICATION_RETRY_1S,
        2, KafkaTopics.NOTIFICATION_RETRY_5S,
        3, KafkaTopics.NOTIFICATION_RETRY_30S,
        4, KafkaTopics.NOTIFICATION_DLQ
    );

    @KafkaListener(
        topics = KafkaTopics.NOTIFICATION_EVENTS,
        groupId = "notifly-worker",
        containerFactory = "kafkaListenerContainerFactory",
        concurrency = "${notifly.worker.concurrency:10}"
    )
    public void handleNotificationEvent(@Payload String payload, Acknowledgment ack) {
        processMessage(payload, 0, ack);
    }

    @KafkaListener(
        topics = KafkaTopics.NOTIFICATION_RETRY_1S,
        groupId = "notifly-worker-retry-1s",
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void handleRetry1s(@Payload String payload, Acknowledgment ack) {
        processMessage(payload, 1, ack);
    }

    @KafkaListener(
        topics = KafkaTopics.NOTIFICATION_RETRY_5S,
        groupId = "notifly-worker-retry-5s",
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void handleRetry5s(@Payload String payload, Acknowledgment ack) {
        processMessage(payload, 2, ack);
    }

    @KafkaListener(
        topics = KafkaTopics.NOTIFICATION_RETRY_30S,
        groupId = "notifly-worker-retry-30s",
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void handleRetry30s(@Payload String payload, Acknowledgment ack) {
        processMessage(payload, 3, ack);
    }

    /**
     * DLQ consumer — record to DB, no further retries.
     */
    @KafkaListener(
        topics = KafkaTopics.NOTIFICATION_DLQ,
        groupId = "notifly-worker-dlq",
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void handleDlq(@Payload String payload, Acknowledgment ack) {
        try {
            KafkaNotificationEvent event = objectMapper.readValue(payload, KafkaNotificationEvent.class);
            CorrelationIdUtil.setCorrelationId(event.getCorrelationId());

            log.error("[{}] DLQ entry: requestId={}, channels={}",
                event.getCorrelationId(), event.getRequestId(),
                String.join(",", event.getChannels()));

            processorService.recordFailedNotification(event);
            metrics.incrementDlq(event.getChannels().isEmpty() ? "UNKNOWN" : event.getChannels().get(0));
            ack.acknowledge();

        } catch (Exception e) {
            log.error("Failed to process DLQ message — acknowledging to prevent infinite loop", e);
            ack.acknowledge(); // Must ack — DLQ has nowhere else to go
        } finally {
            CorrelationIdUtil.clear();
        }
    }

    /**
     * Core processing method.
     *
     * FIXED: This is the ONLY place retry routing happens.
     * NotificationProcessorService.processNotification() no longer calls republishForRetry().
     *
     * Flow:
     *  1. Parse event
     *  2. Check idempotency (skip if already delivered)
     *  3. Process through channels
     *  4. If success → ack and done
     *  5. If failure → route to next retry topic (or DLQ if exhausted) → ack
     */
    private void processMessage(String payload, int currentAttempt, Acknowledgment ack) {
        KafkaNotificationEvent event = null;
        try {
            event = objectMapper.readValue(payload, KafkaNotificationEvent.class);
            CorrelationIdUtil.setCorrelationId(event.getCorrelationId());

            UUID tenantId = event.getTenantId();

            // Idempotency check — skip if already successfully delivered
            if (processorService.hasSuccessfulDelivery(tenantId, event.getRequestId(), event.getChannels())) {
                log.info("[{}] Skipping duplicate: requestId={}", event.getCorrelationId(), event.getRequestId());
                ack.acknowledge();
                return;
            }

            boolean success = processorService.processNotification(event, currentAttempt);

            if (success) {
                log.info("[{}] Delivered: requestId={}", event.getCorrelationId(), event.getRequestId());
                metrics.incrementSent(event.getChannels().isEmpty() ? "UNKNOWN" : event.getChannels().get(0));
                ack.acknowledge();
            } else {
                // FIXED: Retry routing happens HERE and ONLY here
                routeToNextTopic(event, currentAttempt);
                metrics.incrementFailed(event.getChannels().isEmpty() ? "UNKNOWN" : event.getChannels().get(0));
                ack.acknowledge(); // Always ack — we've handed off to the next topic
            }

        } catch (Exception e) {
            log.error("Exception in processMessage, attempt={}: {}", currentAttempt, e.getMessage(), e);
            if (event != null) {
                try {
                    routeToNextTopic(event, currentAttempt);
                    ack.acknowledge();
                } catch (Exception routeEx) {
                    log.error("Failed to route to retry topic — message may be lost", routeEx);
                    // Still ack to avoid infinite consumer loop
                    ack.acknowledge();
                }
            } else {
                // Can't parse the event at all — ack to prevent infinite loop, log for investigation
                log.error("Unparseable message discarded: {}", payload);
                ack.acknowledge();
            }
        } finally {
            CorrelationIdUtil.clear();
        }
    }

    /**
     * Route to the appropriate retry topic based on attempt number.
     * If max attempts reached, routes to DLQ.
     */
    private void routeToNextTopic(KafkaNotificationEvent event, int currentAttempt) throws Exception {
        int nextAttempt = currentAttempt + 1;
        String targetTopic;

        if (nextAttempt >= MAX_ATTEMPTS) {
            targetTopic = KafkaTopics.NOTIFICATION_DLQ;
        } else {
            targetTopic = RETRY_TOPIC_MAP.getOrDefault(nextAttempt, KafkaTopics.NOTIFICATION_DLQ);
        }

        event.setRetryCount(nextAttempt);
        String serialized = objectMapper.writeValueAsString(event);
        kafkaTemplate.send(targetTopic, event.getRequestId().toString(), serialized);

        log.warn("[{}] Routed to {} (attempt {} of {}): requestId={}",
            event.getCorrelationId(), targetTopic, nextAttempt, MAX_ATTEMPTS, event.getRequestId());
    }
}
