package com.notifly.api.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.notifly.common.domain.entity.NotificationOutbox;
import com.notifly.common.domain.repository.NotificationOutboxRepository;

import java.util.List;

@Slf4j
@Component
public class OutboxPublisher {

    private final NotificationOutboxRepository outboxRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;

    @Value("${notifly.kafka.topic:notifications}")
    private String kafkaTopic;

    @Value("${notifly.outbox.batch-size:100}")
    private Integer batchSize;

    public OutboxPublisher(NotificationOutboxRepository outboxRepository,
                          KafkaTemplate<String, String> kafkaTemplate) {
        this.outboxRepository = outboxRepository;
        this.kafkaTemplate = kafkaTemplate;
    }

    @Scheduled(fixedDelayString = "${notifly.outbox.poll-interval:1000}")
    @Transactional
    public void publishPendingEvents() {
        log.debug("OutboxPublisher: Polling for pending events...");

        try {
            // Fetch pending events across all tenants
            List<NotificationOutbox> pendingEvents = outboxRepository.findPending(
                    NotificationOutbox.OutboxStatus.PENDING,
                    batchSize
            );

            if (pendingEvents.isEmpty()) {
                log.trace("OutboxPublisher: No pending events found");
                return;
            }

            log.info("OutboxPublisher: Found {} pending events to publish", pendingEvents.size());

            for (NotificationOutbox outboxEntry : pendingEvents) {
                try {
                    // Publish to Kafka
                    kafkaTemplate.send(kafkaTopic, outboxEntry.getAggregateId(), outboxEntry.getEventPayload())
                            .get(); // Wait for completion

                    // Mark as SENT
                    outboxEntry.setStatus(NotificationOutbox.OutboxStatus.SENT);
                    outboxRepository.save(outboxEntry);

                    log.debug("OutboxPublisher: Event published for aggregate ID: {}", outboxEntry.getAggregateId());
                } catch (Exception e) {
                    log.error("OutboxPublisher: Failed to publish event for aggregate ID: {}", 
                            outboxEntry.getAggregateId(), e);
                    outboxEntry.setStatus(NotificationOutbox.OutboxStatus.FAILED);
                    outboxRepository.save(outboxEntry);
                }
            }
        } catch (Exception e) {
            log.error("OutboxPublisher: Unexpected error during publishing", e);
        }
    }
}
