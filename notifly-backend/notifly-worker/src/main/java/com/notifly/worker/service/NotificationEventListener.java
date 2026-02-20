package com.notifly.worker.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.notifly.common.config.KafkaTopics;
import com.notifly.common.dto.KafkaNotificationEvent;
import com.notifly.common.util.CorrelationIdUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Kafka listener implementing:
 * - Idempotent consumer pattern (check existing SUCCESS delivery)
 * - Manual Kafka commit (only after DB write succeeds)
 * - Retry topic routing with exponential backoff
 * - Channel fallback policy
 */
@Slf4j
@Service
public class NotificationEventListener {

    @Autowired
    private NotificationProcessorService processorService;

    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    // Retry attempt mapping
    private static final Map<Integer, String> RETRY_TOPIC_MAP = Map.of(
        0, KafkaTopics.NOTIFICATION_EVENTS,      // attempt 1 (immediate)
        1, KafkaTopics.NOTIFICATION_RETRY_1S,    // attempt 2 (1 second)
        2, KafkaTopics.NOTIFICATION_RETRY_5S,    // attempt 3 (5 seconds)
        3, KafkaTopics.NOTIFICATION_RETRY_30S,   // attempt 4 (30 seconds)
        4, KafkaTopics.NOTIFICATION_DLQ          // attempt 5 -> DLQ
    );

    /**
     * Main listener for notification.events topic (attempt 1)
     */
    @KafkaListener(
        topics = KafkaTopics.NOTIFICATION_EVENTS,
        groupId = "notifly-worker",
        containerFactory = "kafkaListenerContainerFactory",
        concurrency = "10"
    )
    public void handleNotificationEvent(
            @Payload String payload,
            @Header(value = KafkaHeaders.RECEIVED_TOPIC, required = false) String topic,
            Acknowledgment ack) {

        processNotificationMessage(payload, 0, ack);
    }

    /**
     * Listener for retry.1s topic (attempt 2)
     */
    @KafkaListener(
        topics = KafkaTopics.NOTIFICATION_RETRY_1S,
        groupId = "notifly-worker-1s",
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void handleRetry1s(@Payload String payload, Acknowledgment ack) {
        processNotificationMessage(payload, 1, ack);
    }

    /**
     * Listener for retry.5s topic (attempt 3)
     */
    @KafkaListener(
        topics = KafkaTopics.NOTIFICATION_RETRY_5S,
        groupId = "notifly-worker-5s",
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void handleRetry5s(@Payload String payload, Acknowledgment ack) {
        processNotificationMessage(payload, 2, ack);
    }

    /**
     * Listener for retry.30s topic (attempt 4)
     */
    @KafkaListener(
        topics = KafkaTopics.NOTIFICATION_RETRY_30S,
        groupId = "notifly-worker-30s",
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void handleRetry30s(@Payload String payload, Acknowledgment ack) {
        processNotificationMessage(payload, 3, ack);
    }

    /**
     * Listener for DLQ topic (final destination after max retries)
     */
    @KafkaListener(
        topics = KafkaTopics.NOTIFICATION_DLQ,
        groupId = "notifly-worker-dlq",
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void handleDLQ(@Payload String payload, Acknowledgment ack) {
        try {
            KafkaNotificationEvent event = objectMapper.readValue(payload, KafkaNotificationEvent.class);
            String correlationId = event.getCorrelationId();
            CorrelationIdUtil.setCorrelationId(correlationId);

            log.error("[{}] Message reached DLQ after max retries: request_id={}, channels={}", 
                correlationId, event.getRequestId(), String.join(",", event.getChannels()));

            // Persist to failed_notifications table
            processorService.recordFailedNotification(event);
            ack.acknowledge();

        } catch (Exception e) {
            log.error("Error processing DLQ message", e);
        } finally {
            CorrelationIdUtil.clear();
        }
    }

    /**
     * Core message processing logic
     */
    private void processNotificationMessage(String payload, int retryAttempt, Acknowledgment ack) {
        try {
            KafkaNotificationEvent event = objectMapper.readValue(payload, KafkaNotificationEvent.class);
            String correlationId = event.getCorrelationId();
            UUID tenantId = event.getTenantId();
            
            CorrelationIdUtil.setCorrelationId(correlationId);

            log.info("[{}] Processing notification: request_id={}, retry_attempt={}, channels={}", 
                correlationId, event.getRequestId(), retryAttempt, 
                String.join(",", event.getChannels()));

            // IDEMPOTENT CONSUMER: Check if already delivered successfully
            if (processorService.hasSuccessfulDelivery(tenantId, event.getRequestId(), event.getChannels())) {
                log.info("[{}] Skipping duplicate delivery for request: {}", 
                    correlationId, event.getRequestId());
                ack.acknowledge();
                return;
            }

            // Process notification through all channels
            boolean allChannelsSuccess = processorService.processNotification(event, retryAttempt);

            if (allChannelsSuccess) {
                log.info("[{}] Notification delivered successfully: {}", 
                    correlationId, event.getRequestId());
                ack.acknowledge();
            } else {
                // Attempt next retry
                int nextRetry = retryAttempt + 1;
                String nextTopic = RETRY_TOPIC_MAP.getOrDefault(nextRetry, KafkaTopics.NOTIFICATION_DLQ);

                log.warn("[{}] Notification failed. Routing to: {} (attempt {})", 
                    correlationId, nextTopic, nextRetry + 1);

                event.setRetryCount(nextRetry);
                kafkaTemplate.send(nextTopic, event.getRequestId().toString(), event);
                ack.acknowledge();
            }

        } catch (Exception e) {
            log.error("Error processing notification message, will retry", e);
            int nextRetry = retryAttempt + 1;
            String nextTopic = RETRY_TOPIC_MAP.getOrDefault(nextRetry, KafkaTopics.NOTIFICATION_DLQ);
            
            try {
                KafkaNotificationEvent event = objectMapper.readValue(payload, KafkaNotificationEvent.class);
                event.setRetryCount(nextRetry);
                kafkaTemplate.send(nextTopic, event.getRequestId().toString(), event);
                ack.acknowledge();
            } catch (Exception innerE) {
                log.error("Failed to republish to retry topic", innerE);
            }
        } finally {
            CorrelationIdUtil.clear();
        }
    }
}
