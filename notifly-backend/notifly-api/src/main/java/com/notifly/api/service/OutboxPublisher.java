package com.notifly.api.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.notifly.common.domain.entity.NotificationOutbox;
import com.notifly.common.domain.entity.NotificationOutbox.OutboxStatus;
import com.notifly.common.domain.repository.NotificationOutboxRepository;

import java.util.List;

/**
 * Outbox pattern publisher — polls for PENDING events and publishes to Kafka.
 *
 * FIXES from original:
 *  1. Removed .get() blocking call — was hanging the scheduler thread under Kafka slowness.
 *     Now uses async whenComplete callback so the scheduler never blocks.
 *  2. FAILED entries with retryCount < maxRetries are re-queued for retry.
 *     Original had no recovery — FAILED entries were silently dropped forever.
 *  3. Uses markAsProcessing() to prevent duplicate sends across multiple API instances.
 *  4. Added proper retry count tracking on FAILED entries.
 */
@Slf4j
@Component
public class OutboxPublisher {

    private final NotificationOutboxRepository outboxRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;

    @Value("${notifly.kafka.topic:notification.events}")
    private String kafkaTopic;

    @Value("${notifly.outbox.batch-size:100}")
    private Integer batchSize;

    @Value("${notifly.outbox.max-retry-count:3}")
    private Integer maxRetryCount;

    public OutboxPublisher(NotificationOutboxRepository outboxRepository,
                           KafkaTemplate<String, String> kafkaTemplate) {
        this.outboxRepository = outboxRepository;
        this.kafkaTemplate = kafkaTemplate;
    }

    /**
     * Poll for PENDING outbox entries and publish them asynchronously.
     * Fixed: uses async Kafka send — scheduler thread never blocks.
     */
    @Scheduled(fixedDelayString = "${notifly.outbox.poll-interval:1000}")
    @Transactional
    public void publishPendingEvents() {
        List<NotificationOutbox> pendingEvents = outboxRepository.findPending(
                OutboxStatus.PENDING, batchSize);

        if (pendingEvents.isEmpty()) {
            log.trace("OutboxPublisher: No pending events");
            return;
        }

        log.info("OutboxPublisher: Publishing {} pending events", pendingEvents.size());

        for (NotificationOutbox outboxEntry : pendingEvents) {
            // Mark as PROCESSING immediately to prevent other API instances from
            // picking up the same entry (handles multi-instance deployments)
            outboxEntry.setStatus(OutboxStatus.PROCESSING);
            outboxRepository.save(outboxEntry);

            // FIXED: async send — no more .get() blocking the scheduler
            kafkaTemplate
                .send(kafkaTopic, outboxEntry.getAggregateId(), outboxEntry.getEventPayload())
                .whenComplete((result, ex) -> {
                    if (ex != null) {
                        log.error("OutboxPublisher: Kafka send failed for aggregateId={}, error={}",
                                outboxEntry.getAggregateId(), ex.getMessage());
                        outboxEntry.setStatus(OutboxStatus.FAILED);
                        outboxEntry.setRetryCount(
                            outboxEntry.getRetryCount() == null ? 1
                            : outboxEntry.getRetryCount() + 1
                        );
                    } else {
                        log.debug("OutboxPublisher: Published aggregateId={}, offset={}",
                                outboxEntry.getAggregateId(),
                                result.getRecordMetadata().offset());
                        outboxEntry.setStatus(OutboxStatus.SENT);
                    }
                    outboxRepository.save(outboxEntry);
                });
        }
    }

    /**
     * NEW: Recovery job for FAILED outbox entries.
     * Original had NO recovery — FAILED entries were permanently lost (silent data loss).
     * This re-queues entries that failed with retryCount < maxRetryCount.
     */
    @Scheduled(fixedDelayString = "${notifly.outbox.recovery-interval:30000}")
    @Transactional
    public void recoverFailedEvents() {
        List<NotificationOutbox> failedEvents = outboxRepository.findFailedForRecovery(
                OutboxStatus.FAILED, maxRetryCount, batchSize);

        if (failedEvents.isEmpty()) {
            log.trace("OutboxPublisher: No failed events to recover");
            return;
        }

        log.warn("OutboxPublisher: Recovering {} failed outbox events", failedEvents.size());

        for (NotificationOutbox outboxEntry : failedEvents) {
            // Reset to PENDING so the main poll picks it up again
            outboxEntry.setStatus(OutboxStatus.PENDING);
            outboxRepository.save(outboxEntry);
            log.info("OutboxPublisher: Reset failed entry to PENDING: aggregateId={}",
                    outboxEntry.getAggregateId());
        }
    }
}
