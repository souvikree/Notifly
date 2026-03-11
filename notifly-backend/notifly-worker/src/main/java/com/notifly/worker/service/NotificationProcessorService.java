package com.notifly.worker.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.redis.core.RedisTemplate;
import lombok.extern.slf4j.Slf4j;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.notifly.common.domain.entity.*;
import com.notifly.common.domain.repository.*;
import com.notifly.common.context.CorrelationIdContext;
import com.notifly.common.dto.KafkaNotificationEvent;
import com.notifly.worker.service.sender.ChannelSender;
import com.notifly.worker.service.sender.SendResult;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Processes notifications — channel selection, template rendering, sending, logging.
 *
 * FIXES from original:
 *  1. REMOVED republishForRetry() from this service.
 *     Original called it here AND in NotificationEventListener, causing DOUBLE retry routing.
 *     Retry routing is now exclusively the listener's responsibility.
 *     This class only processes and returns true (success) or false (failure).
 *
 *  2. FIXED: Event channels were completely ignored — always used policy fallback order.
 *     Now properly intersects event.getChannels() with policy fallback order.
 *     If caller says "channels: [SMS]", only SMS is tried. EMAIL is not a fallback unless requested.
 *
 *  3. FIXED: isAlreadyDelivered() checked retryAttempt=0 only.
 *     Any successful delivery at any retry attempt counts as delivered.
 *
 *  4. FIXED: Status was written as "SUCCESS" but AdminController queries for "SENT".
 *     Standardized on "SENT" to match what the dashboard queries expect.
 */
@Slf4j
@Service
public class NotificationProcessorService {

    private final NotificationLogRepository logRepository;
    private final FailedNotificationRepository failedRepository;
    private final EventChannelPolicyRepository channelPolicyRepository;
    private final NotificationTemplateRepository templateRepository;
    private final UserChannelPreferenceRepository preferencesRepository;
    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;
    private final Map<String, ChannelSender> channelSenders;

    private static final int MAX_ATTEMPTS = 5;
    // Template cache TTL in seconds
    private static final long TEMPLATE_CACHE_TTL_SECONDS = 300;

    public NotificationProcessorService(
            NotificationLogRepository logRepository,
            FailedNotificationRepository failedRepository,
            EventChannelPolicyRepository channelPolicyRepository,
            NotificationTemplateRepository templateRepository,
            UserChannelPreferenceRepository preferencesRepository,
            RedisTemplate<String, String> redisTemplate,
            ObjectMapper objectMapper,
            List<ChannelSender> senders) {

        this.logRepository = logRepository;
        this.failedRepository = failedRepository;
        this.channelPolicyRepository = channelPolicyRepository;
        this.templateRepository = templateRepository;
        this.preferencesRepository = preferencesRepository;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.channelSenders = new HashMap<>();
        senders.forEach(sender -> channelSenders.put(sender.getChannel(), sender));
    }

    /**
     * Check if this notification was already successfully delivered.
     *
     * FIXED: Original checked retryAttempt=0 only — missed successful retries.
     * Now checks for any SENT log entry regardless of retry attempt.
     */
    public boolean hasSuccessfulDelivery(UUID tenantId, UUID requestId, List<String> channels) {
        for (String channel : channels) {
            // FIXED: findFirstByTenantIdAndRequestIdAndChannelAndStatus — any attempt
            boolean delivered = logRepository
                .existsByTenantIdAndRequestIdAndChannelAndStatus(tenantId, requestId, channel, "SENT");
            if (delivered) {
                return true;
            }
        }
        return false;
    }

    /**
     * Process a notification event through its channels.
     *
     * FIXES:
     *  - No longer calls republishForRetry() internally (was double-routing retries)
     *  - Properly uses event.getChannels() intersected with policy fallback order
     *  - Returns true on first successful channel delivery
     *  - Returns false if all channels fail (caller handles retry routing)
     */
    @Transactional
    public boolean processNotification(KafkaNotificationEvent event, int retryAttempt) {
        String correlationId = CorrelationIdContext.getCorrelationId();

        log.info("[{}] Processing: requestId={}, channels={}, attempt={}",
                correlationId, event.getRequestId(),
                String.join(",", event.getChannels()), retryAttempt);

        // FIXED: Build ordered channel list that respects BOTH:
        //  - The channels the caller explicitly requested (event.getChannels())
        //  - The fallback priority order from the policy
        List<String> orderedChannels = resolveChannelOrder(event);

        if (orderedChannels.isEmpty()) {
            log.warn("[{}] No valid channels to attempt for requestId={}", correlationId, event.getRequestId());
            // FIXED: Persist failure — don't silently drop
            persistFailure(event, List.of(), "No valid channels configured", retryAttempt);
            return false;
        }

        String lastError = null;

        for (String channel : orderedChannels) {
            ChannelSender sender = channelSenders.get(channel);
            if (sender == null) {
                log.warn("[{}] No sender registered for channel: {}", correlationId, channel);
                continue;
            }

            try {
                // Fetch and render template (with Redis caching)
                String content = resolveContent(event, channel);
                String subject = resolveSubject(event, channel);
                String recipient = resolveRecipient(event, channel);

                SendResult result = sender.send(recipient, subject, content);

                if (result.isSuccess()) {
                    // FIXED: Write "SENT" not "SUCCESS" to match what AdminController queries
                    persistSuccess(event, channel, result, retryAttempt);
                    log.info("[{}] Sent via {}: requestId={}, latency={}ms",
                            correlationId, channel, event.getRequestId(), result.getLatencyMs());
                    return true; // Success — stop trying other channels
                }

                lastError = result.getErrorMessage();
                log.warn("[{}] Channel {} failed: {}", correlationId, channel, lastError);
                persistChannelFailure(event, channel, lastError, retryAttempt);

            } catch (Exception e) {
                lastError = e.getMessage();
                log.error("[{}] Exception on channel {}: {}", correlationId, channel, e.getMessage(), e);
                persistChannelFailure(event, channel, e.getMessage(), retryAttempt);
            }
        }

        // All channels failed
        log.error("[{}] All channels failed for requestId={}", correlationId, event.getRequestId());
        // FIXED: Don't call republishForRetry here — listener handles routing
        return false;
    }

    /**
     * Persist a successful delivery to notification_logs.
     * FIXED: Uses status "SENT" (not "SUCCESS") to match AdminController queries.
     */
    private void persistSuccess(KafkaNotificationEvent event, String channel,
                                SendResult result, int attempt) {
        NotificationLog log = NotificationLog.builder()
                .tenantId(event.getTenantId())
                .requestId(event.getRequestId())
                .channel(channel)
                .status("SENT") 
                .retryAttempt(attempt)
                .providerLatencyMs(result.getLatencyMs())
                .createdAt(Instant.now())
                .build();
        logRepository.save(log);
    }

    /**
     * Persist a per-channel failure (not DLQ — still retrying).
     */
    private void persistChannelFailure(KafkaNotificationEvent event, String channel,
                                        String errorMessage, int attempt) {
        NotificationLog logEntry = NotificationLog.builder()
                .tenantId(event.getTenantId())
                .requestId(event.getRequestId())
                .channel(channel)
                .status("FAILED")
                .retryAttempt(attempt)
                .errorDetails(errorMessage)
                .createdAt(Instant.now())
                .build();
        logRepository.save(logEntry);
    }

    /**
     * Persist a top-level failure (no channels succeeded, no channels to try).
     */
    private void persistFailure(KafkaNotificationEvent event, List<String> channels,
                                 String error, int attempt) {
        NotificationLog logEntry = NotificationLog.builder()
                .tenantId(event.getTenantId())
                .requestId(event.getRequestId())
                .channel(channels.isEmpty() ? "NONE" : String.join(",", channels))
                .status("FAILED")
                .retryAttempt(attempt)
                .errorDetails(error)
                .createdAt(Instant.now())
                .build();
        logRepository.save(logEntry);
    }

    /**
     * Persist to failed_notifications after max retries exhausted (DLQ entry).
     */
    @Transactional
    public void recordFailedNotification(KafkaNotificationEvent event) {
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
    }

    /**
     * FIXED: Build the ordered list of channels to attempt.
     *
     * Logic:
     *  1. Get the policy's fallback order (defines priority)
     *  2. Filter to only channels the caller actually requested
     *  3. Append any requested channels not in the policy (at lower priority)
     *
     * This means: if caller sends channels=[SMS], only SMS is tried.
     * If caller sends channels=[EMAIL, SMS] and policy order is [SMS, EMAIL],
     * we try SMS first (policy priority), then EMAIL.
     */
    private List<String> resolveChannelOrder(KafkaNotificationEvent event) {
        List<String> requestedChannels = event.getChannels();
        if (requestedChannels == null || requestedChannels.isEmpty()) {
            log.warn("Event has no channels: requestId={}", event.getRequestId());
            return Collections.emptyList();
        }

        // Get policy fallback order for this event type
        EventChannelPolicy policy = channelPolicyRepository
                .findByTenantIdAndEventType(event.getTenantId(), event.getEventType())
                .orElse(null);

        if (policy == null || policy.getFallbackOrder() == null || policy.getFallbackOrder().isEmpty()) {
            // No policy — use requested channels as-is
            return new ArrayList<>(requestedChannels);
        }

        // Policy-ordered subset of requested channels
        List<String> ordered = policy.getFallbackOrder().stream()
                .filter(requestedChannels::contains)
                .collect(Collectors.toCollection(ArrayList::new));

        // Append any requested channels not covered by policy
        requestedChannels.stream()
                .filter(c -> !ordered.contains(c))
                .forEach(ordered::add);

        return ordered;
    }

    /**
     * Fetch template content from DB with Redis caching.
     */
    private String resolveContent(KafkaNotificationEvent event, String channel) {
        String cacheKey = "template:" + event.getTenantId() + ":" + event.getEventType() + ":" + channel;
        String cached = redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) return cached;

        return templateRepository
                .findFirstByTenantIdAndChannelAndIsActiveTrue(event.getTenantId(), channel)
                .map(t -> {
                    String content = renderTemplate(t.getContent(), event.getPayload());
                    redisTemplate.opsForValue().set(cacheKey, content,
                        java.time.Duration.ofSeconds(TEMPLATE_CACHE_TTL_SECONDS));
                    return content;
                })
                .orElse(event.getContent() != null ? event.getContent() : "");
    }

    private String resolveSubject(KafkaNotificationEvent event, String channel) {
        return templateRepository
                .findFirstByTenantIdAndChannelAndIsActiveTrue(event.getTenantId(), channel)
                .map(t -> t.getSubject() != null ? t.getSubject() : event.getSubject())
                .orElse(event.getSubject() != null ? event.getSubject() : "Notification");
    }

    private String resolveRecipient(KafkaNotificationEvent event, String channel) {
        // Could look up user preferences by userId for channel-specific addresses
        return event.getRecipient() != null ? event.getRecipient() : "";
    }

    /**
     * Simple Handlebars-style template renderer.
     * Replaces {{key}} with values from the payload map.
     */
    private String renderTemplate(String template, Map<String, Object> payload) {
        if (template == null || payload == null) return template;
        String result = template;
        for (Map.Entry<String, Object> entry : payload.entrySet()) {
            result = result.replace("{{" + entry.getKey() + "}}", String.valueOf(entry.getValue()));
        }
        return result;
    }
}
