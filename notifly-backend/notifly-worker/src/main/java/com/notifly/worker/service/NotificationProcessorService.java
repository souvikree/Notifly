package com.notifly.worker.service;

import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.redis.core.RedisTemplate;
import lombok.extern.slf4j.Slf4j;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.notifly.common.domain.entity.*;
import com.notifly.common.domain.repository.*;
import com.notifly.common.context.CorrelationIdContext;
import com.notifly.common.domain.entity.EventChannelPolicy;
import com.notifly.common.domain.entity.FailedNotification;
import com.notifly.common.domain.entity.NotificationLog;
import com.notifly.common.domain.repository.EventChannelPolicyRepository;
import com.notifly.common.domain.repository.FailedNotificationRepository;
import com.notifly.common.domain.repository.NotificationLogRepository;
import com.notifly.common.domain.repository.NotificationTemplateRepository;
import com.notifly.common.domain.repository.RetryPolicyRepository;
import com.notifly.common.domain.repository.UserChannelPreferenceRepository;
import com.notifly.common.dto.KafkaNotificationEvent;
import com.notifly.worker.service.sender.ChannelSender;
import com.notifly.worker.service.sender.SendResult;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;

/**
 * Processes notifications - implements retry, channel fallback, and DLQ routing
 */
@Slf4j
@Service
public class NotificationProcessorService {

    private final NotificationLogRepository logRepository;
    private final FailedNotificationRepository failedRepository;
    private final RetryPolicyRepository retryPolicyRepository;
    private final EventChannelPolicyRepository channelPolicyRepository;
    private final NotificationTemplateRepository templateRepository;
    private final UserChannelPreferenceRepository preferencesRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;
    private final Map<String, ChannelSender> channelSenders;

    private static final int MAX_ATTEMPTS = 5;
    private static final Map<Integer, String> RETRY_TOPICS = Map.ofEntries(
            Map.entry(1, "notification.events"),
            Map.entry(2, "notification.retry.1s"),
            Map.entry(3, "notification.retry.5s"),
            Map.entry(4, "notification.retry.30s"),
            Map.entry(5, "notification.dlq"));

    private static final Map<Integer, Long> RETRY_DELAYS = Map.ofEntries(
            Map.entry(1, 0L),
            Map.entry(2, 1000L),
            Map.entry(3, 5000L),
            Map.entry(4, 30000L));

    public NotificationProcessorService(
            NotificationLogRepository logRepository,
            FailedNotificationRepository failedRepository,
            RetryPolicyRepository retryPolicyRepository,
            EventChannelPolicyRepository channelPolicyRepository,
            NotificationTemplateRepository templateRepository,
            UserChannelPreferenceRepository preferencesRepository,
            KafkaTemplate<String, String> kafkaTemplate,
            RedisTemplate<String, String> redisTemplate,
            ObjectMapper objectMapper,
            List<ChannelSender> senders) {

        this.logRepository = logRepository;
        this.failedRepository = failedRepository;
        this.retryPolicyRepository = retryPolicyRepository;
        this.channelPolicyRepository = channelPolicyRepository;
        this.templateRepository = templateRepository;
        this.preferencesRepository = preferencesRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.channelSenders = new HashMap<>();
        senders.forEach(sender -> channelSenders.put(sender.getChannel(), sender));
    }

    public boolean isAlreadyDelivered(UUID tenantId, UUID requestId, String channel) {
        Optional<NotificationLog> existing = logRepository
                .findByTenantIdAndRequestIdAndChannelAndRetryAttempt(tenantId, requestId, channel, 0);
        return existing.isPresent() && "SUCCESS".equals(existing.get().getStatus());
    }

    @Transactional
    public boolean processNotification(KafkaNotificationEvent event, int retryAttempt) {
        try {
            String correlationId = CorrelationIdContext.getCorrelationId();

            log.info(
                    "Processing notification: requestId={}, channels={}, attempt={}, correlationId={}",
                    event.getRequestId(),
                    String.join(",", event.getChannels()),
                    retryAttempt,
                    correlationId);

            // Fetch channel fallback policy
            EventChannelPolicy policy = channelPolicyRepository
                    .findByTenantIdAndEventType(event.getTenantId(), event.getEventType())
                    .orElse(EventChannelPolicy.builder()
                            .fallbackOrder(Arrays.asList("EMAIL", "SMS", "PUSH"))
                            .build());

            List<String> attemptedChannels = new ArrayList<>();
            SendResult result = null;

            // Try channels in fallback order
            for (String channel : policy.getFallbackOrder()) {

                attemptedChannels.add(channel);

                ChannelSender sender = channelSenders.get(channel);
                if (sender == null) {
                    log.warn("Channel sender not found: {}", channel);
                    continue;
                }

                try {
                    result = sender.send(
                            event.getRecipient(),
                            event.getSubject(),
                            event.getContent());

                    if (result.isSuccess()) {
                        logSuccess(event, channel, result, retryAttempt);

                        log.info(
                                "Notification sent successfully: requestId={}, channel={}, latency={}ms",
                                event.getRequestId(),
                                channel,
                                result.getLatencyMs());

                        return true; // ✅ SUCCESS
                    }

                } catch (Exception e) {
                    log.warn("Failed on channel {}: {}", channel, e.getMessage());
                }
            }

            // ❌ All channels failed
            logFailure(event, attemptedChannels, result, retryAttempt);

            if (retryAttempt < MAX_ATTEMPTS) {
                republishForRetry(event, retryAttempt + 1, correlationId);
            } else {
                moveToDeadLetterQueue(event);
            }

            return false; // ✅ IMPORTANT: Failure case

        } catch (Exception e) {
            log.error("Error processing notification", e);
            return false; // ✅ Prevent compile error + safe fallback
        }
    }

    private void logSuccess(KafkaNotificationEvent event, String channel, SendResult result, int attempt) {
        NotificationLog log = NotificationLog.builder()
                .tenantId(event.getTenantId())
                .requestId(event.getRequestId())
                .channel(channel)
                .status("SUCCESS")
                .retryAttempt(attempt)
                .providerLatencyMs(result.getLatencyMs())
                .createdAt(Instant.now())
                .build();

        logRepository.save(log);
    }

    private void logFailure(KafkaNotificationEvent event, List<String> channels, SendResult result, int attempt) {
        NotificationLog log = NotificationLog.builder()
                .tenantId(event.getTenantId())
                .requestId(event.getRequestId())
                .channel(String.join(",", channels))
                .status("FAILED")
                .retryAttempt(attempt)
                .errorDetails(result != null ? result.getErrorMessage() : "Unknown error")
                .createdAt(Instant.now())
                .build();

        logRepository.save(log);
    }

    private void republishForRetry(KafkaNotificationEvent event, int nextAttempt, String correlationId) {
        try {
            String topic = RETRY_TOPICS.get(nextAttempt);
            String message = objectMapper.writeValueAsString(event);

            var msg = MessageBuilder.withPayload(message)
                    .setHeader(KafkaHeaders.TOPIC, topic)
                    .setHeader("retryCount", String.valueOf(nextAttempt))
                    .setHeader("correlationId", correlationId)
                    .build();

            kafkaTemplate.send(msg);
            log.info("Republished for retry: requestId={}, attempt={}, topic={}",
                    event.getRequestId(), nextAttempt, topic);
        } catch (Exception e) {
            log.error("Failed to republish for retry", e);
        }
    }

    @Transactional
    public void moveToDeadLetterQueue(KafkaNotificationEvent event) {
        try {
            FailedNotification failed = FailedNotification.builder()
                    .tenantId(event.getTenantId())
                    .requestId(event.getRequestId())
                    .channel(String.join(",", event.getChannels()))
                    .recipient(event.getRecipient())
                    .retryAttempt(MAX_ATTEMPTS)
                    .errorCode("MAX_RETRIES_EXCEEDED")
                    .errorMessage("Failed after " + MAX_ATTEMPTS + " attempts")
                    .createdAt(Instant.now())
                    .build();

            failedRepository.save(failed);
            log.error("Notification moved to DLQ: requestId={}", event.getRequestId());
        } catch (Exception e) {
            log.error("Error moving to DLQ", e);
        }
    }

    @Transactional
    public void recordFailedNotification(KafkaNotificationEvent event) {

        FailedNotification failed = FailedNotification.builder()
                .tenantId(event.getTenantId())
                .requestId(event.getRequestId())
                .channel(String.join(",", event.getChannels()))
                .recipient(event.getRecipient())
                .retryAttempt(event.getRetryCount())
                .errorCode("DLQ")
                .errorMessage("Message reached dead letter topic")
                .createdAt(Instant.now())
                .build();

        failedRepository.save(failed);
    }

    public boolean hasSuccessfulDelivery(UUID tenantId, UUID requestId, List<String> channels) {
        for (String channel : channels) {
            Optional<NotificationLog> log = logRepository
                    .findByTenantIdAndRequestIdAndChannelAndRetryAttempt(
                            tenantId, requestId, channel, 0);

            if (log.isPresent() && "SUCCESS".equals(log.get().getStatus())) {
                return true;
            }
        }
        return false;
    }
}
