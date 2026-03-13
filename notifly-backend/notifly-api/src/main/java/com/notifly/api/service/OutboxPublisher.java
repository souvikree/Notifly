package com.notifly.api.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.notifly.common.domain.entity.NotificationOutbox;
import com.notifly.common.domain.entity.NotificationOutbox.OutboxStatus;
import com.notifly.common.domain.repository.NotificationOutboxRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Outbox pattern publisher — polls for PENDING events and publishes to Kafka.
 *
 * FIXES:
 *  1. Async callback transaction fix (BUG-002):
 *     whenComplete() runs on a Kafka sender thread AFTER publishPendingEvents()'s
 *     @Transactional has already committed. Any outboxRepository.save() inside the
 *     callback had no active transaction and would throw or silently fail.
 *
 *     Fix: self-inject OutboxPublisher via @Lazy to call updateOutboxStatus(), which
 *     opens its own REQUIRES_NEW transaction on the Kafka callback thread.
 *     This is safe because the callback thread is managed by Kafka's sender executor,
 *     not the scheduler thread, so there is no outer transaction to suspend.
 *
 *  2. Async Kafka send — scheduler thread never blocks.
 *  3. Recovery job for FAILED entries.
 *  4. PROCESSING status prevents duplicate sends in multi-instance deployments.
 */
@Slf4j
@Component
public class OutboxPublisher {

    private final NotificationOutboxRepository outboxRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;

    // Self-reference so the whenComplete callback can open its own transaction.
    // @Lazy breaks the circular Spring proxy dependency.
    @Autowired
    @Lazy
    private OutboxPublisher self;

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
     *
     * After marking each entry PROCESSING and firing the async Kafka send,
     * this method's transaction commits. Status updates (SENT / FAILED) are
     * handled by updateOutboxStatus(), which runs in its own transaction on
     * the Kafka callback thread.
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
            // Mark PROCESSING before sending — prevents another API instance from
            // picking up the same entry while the Kafka send is in flight.
            outboxEntry.setStatus(OutboxStatus.PROCESSING);
            outboxRepository.save(outboxEntry);

            UUID entryId = outboxEntry.getId();

            // FIXED BUG-002: capture the ID (not the entity) for use in the callback.
            // The entity is a JPA-managed object tied to the current transaction;
            // the callback runs after that transaction closes so the entity may be
            // detached. Using the ID and re-loading inside updateOutboxStatus() is safe.
            kafkaTemplate
                .send(kafkaTopic, outboxEntry.getAggregateId(), outboxEntry.getEventPayload())
                .whenComplete((result, ex) -> {
                    if (ex != null) {
                        log.error("OutboxPublisher: Kafka send failed for aggregateId={}, error={}",
                                outboxEntry.getAggregateId(), ex.getMessage());
                        // Opens its own REQUIRES_NEW transaction on this callback thread
                        self.updateOutboxStatus(entryId, OutboxStatus.FAILED, ex.getMessage());
                    } else {
                        log.debug("OutboxPublisher: Published aggregateId={}, offset={}",
                                outboxEntry.getAggregateId(),
                                result.getRecordMetadata().offset());
                        self.updateOutboxStatus(entryId, OutboxStatus.SENT, null);
                    }
                });
        }
    }

    /**
     * Persist the final SENT / FAILED status of an outbox entry.
     *
     * PROPAGATION.REQUIRES_NEW: always opens a fresh transaction regardless of
     * the caller's context. Called from the Kafka callback thread (no outer
     * transaction exists there), so REQUIRES_NEW is equivalent to REQUIRED here,
     * but it is explicit and protects against any future call-site changes.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void updateOutboxStatus(UUID outboxId, OutboxStatus status, String error) {
        outboxRepository.findById(outboxId).ifPresentOrElse(entry -> {
            entry.setStatus(status);
            if (error != null) {
                entry.setLastError(error);
            }
            entry.setRetryCount(entry.getRetryCount() == null ? 1 : entry.getRetryCount() + 1);
            if (status == OutboxStatus.SENT) {
                entry.setSentAt(Instant.now());
            }
            outboxRepository.save(entry);
            log.debug("OutboxPublisher: Status updated to {} for outboxId={}", status, outboxId);
        }, () -> log.warn("OutboxPublisher: Entry not found during status update — outboxId={}", outboxId));
    }

    /**
     * Recovery job: reset FAILED entries (below max retries) back to PENDING
     * so the main poll picks them up again.
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
            outboxEntry.setStatus(OutboxStatus.PENDING);
            outboxRepository.save(outboxEntry);
            log.info("OutboxPublisher: Reset failed entry to PENDING: aggregateId={}",
                    outboxEntry.getAggregateId());
        }
    }
}