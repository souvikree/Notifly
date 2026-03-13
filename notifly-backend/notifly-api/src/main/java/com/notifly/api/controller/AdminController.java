package com.notifly.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.notifly.api.service.ApiKeyService;
import com.notifly.common.config.KafkaTopics;
import com.notifly.common.context.TenantContext;
import com.notifly.common.domain.entity.ApiKey;
import com.notifly.common.domain.entity.NotificationTemplate;
import com.notifly.common.domain.repository.*;
import com.notifly.common.dto.KafkaNotificationEvent;
import com.notifly.common.exception.ValidationException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

@Slf4j
@RestController
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class AdminController {

    private final NotificationLogRepository logRepository;
    private final FailedNotificationRepository failedNotificationRepository;
    private final NotificationTemplateRepository templateRepository;
    private final ApiKeyRepository apiKeyRepository;
    private final ApiKeyService apiKeyService;
    // ADDED: required for BUG-005 fix — re-publishing DLQ entries to Kafka
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    // ── Metrics ───────────────────────────────────────────────────────────────

    /**
     * BUG-003 FIX: timeSeries was always List.of() - chart was permanently blank.
     *              Now calls getDailyStats() and respects the period param.
     * BUG-004 FIX: failureRate was never added to the metrics map - always 0 on frontend.
     */
    @GetMapping("/metrics")
    public ResponseEntity<Map<String, Object>> getMetrics(
            @RequestParam(required = false, defaultValue = "7d") String period) {

        UUID tenantId = TenantContext.getTenantId();

        // BUG-003: map period string to days integer for getDailyStats()
        int days = switch (period) {
            case "24h" -> 1;
            case "30d" -> 30;
            case "90d" -> 90;
            default    -> 7;
        };

        long total        = logRepository.countByTenantId(tenantId);
        long succeeded    = logRepository.countByTenantIdAndStatus(tenantId, "SENT");
        long failed       = logRepository.countByTenantIdAndStatus(tenantId, "FAILED");
        long dlqCount     = failedNotificationRepository.countByTenantId(tenantId);
        Double avgLatency = logRepository.avgLatencyByTenantId(tenantId);
        Double p99Latency = logRepository.p99LatencyByTenantId(tenantId);

        double successRate = total > 0 ? (double) succeeded / total * 100.0 : 0.0;
        // BUG-004 FIX: failureRate was never put in the map
        double failureRate = total > 0 ? (double) failed  / total * 100.0 : 0.0;

        Map<String, Long> emailStats = Map.of(
                "sent",   logRepository.countByTenantIdAndChannelAndStatus(tenantId, "EMAIL", "SENT"),
                "failed", logRepository.countByTenantIdAndChannelAndStatus(tenantId, "EMAIL", "FAILED")
        );
        Map<String, Long> smsStats = Map.of(
                "sent",   logRepository.countByTenantIdAndChannelAndStatus(tenantId, "SMS", "SENT"),
                "failed", logRepository.countByTenantIdAndChannelAndStatus(tenantId, "SMS", "FAILED")
        );
        Map<String, Long> pushStats = Map.of(
                "sent",   logRepository.countByTenantIdAndChannelAndStatus(tenantId, "PUSH", "SENT"),
                "failed", logRepository.countByTenantIdAndChannelAndStatus(tenantId, "PUSH", "FAILED")
        );

        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("totalNotifications",   total);
        metrics.put("successfulDeliveries", succeeded);
        metrics.put("failedDeliveries",     failed);
        metrics.put("pendingNotifications", 0);
        metrics.put("dlqCount",             dlqCount);
        metrics.put("averageLatency",       avgLatency != null ? avgLatency : 0.0);
        metrics.put("p99Latency",           p99Latency != null ? p99Latency : 0.0);
        metrics.put("successRate",          successRate);
        metrics.put("failureRate",          failureRate);
        metrics.put("channelMetrics",       Map.of("email", emailStats, "sms", smsStats, "push", pushStats));

        // BUG-003 FIX: real time-series from DB instead of always-empty List.of()
        List<Map<String, Object>> timeSeries = logRepository.getDailyStats(tenantId, days)
                .stream()
                .map(row -> {
                    Map<String, Object> point = new LinkedHashMap<>();
                    point.put("date",    row[0].toString());
                    point.put("total",   ((Number) row[1]).longValue());
                    point.put("success", ((Number) row[2]).longValue());
                    point.put("failed",  ((Number) row[3]).longValue());
                    return point;
                })
                .toList();

        return ResponseEntity.ok(Map.of("metrics", metrics, "timeSeries", timeSeries));
    }

    // ── Notification Logs ─────────────────────────────────────────────────────

    @GetMapping("/logs")
    public ResponseEntity<Map<String, Object>> getLogs(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String channel,
            @RequestParam(required = false) String search) {

        UUID tenantId = TenantContext.getTenantId();
        var pageable  = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        var logsPage  = logRepository.findByTenantIdWithFilters(tenantId, status, channel, search, pageable);

        return ResponseEntity.ok(Map.of(
                "data",       logsPage.getContent(),
                "total",      logsPage.getTotalElements(),
                "page",       page,
                "size",       size,
                "totalPages", logsPage.getTotalPages()
        ));
    }

    // ── Log Retry — INT-002 ───────────────────────────────────────────────────

    /**
     * ADDED INT-002: Re-queue a notification from the logs page.
     *
     * Frontend calls POST /admin/logs/{id}/retry — this endpoint was completely
     * missing, returning 404 on every retry attempt from the Logs page.
     *
     * Looks up the log entry, rebuilds a KafkaNotificationEvent from it,
     * and re-publishes to notification.events with retryCount reset to 0.
     */
    @PostMapping("/logs/{id}/retry")
    public ResponseEntity<Map<String, String>> retryFromLogs(@PathVariable UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        var logEntry = logRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ValidationException("Log entry not found: " + id));

        try {
            List<String> channels = logEntry.getChannel() != null
                    ? Arrays.asList(logEntry.getChannel().split(","))
                    : List.of();

            KafkaNotificationEvent retryEvent = KafkaNotificationEvent.builder()
                    .requestId(logEntry.getRequestId())
                    .tenantId(logEntry.getTenantId())
                    .channels(channels)
                    .correlationId(UUID.randomUUID().toString())
                    .retryCount(0)
                    .createdAt(Instant.now().toEpochMilli())
                    .build();

            String serialized = objectMapper.writeValueAsString(retryEvent);
            kafkaTemplate.send(KafkaTopics.NOTIFICATION_EVENTS,
                    logEntry.getRequestId().toString(), serialized);

            log.info("Log retry queued: logId={}, requestId={}, tenantId={}",
                    id, logEntry.getRequestId(), tenantId);

        } catch (Exception e) {
            log.error("Failed to re-queue log entry id={}: {}", id, e.getMessage(), e);
            throw new ValidationException("Failed to re-queue notification: " + e.getMessage());
        }

        return ResponseEntity.ok(Map.of("status", "RETRY_QUEUED", "id", id.toString()));
    }

    // ── Dead Letter Queue ─────────────────────────────────────────────────────

    @GetMapping("/dlq")
    public ResponseEntity<Map<String, Object>> getDlq(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search) {

        UUID tenantId = TenantContext.getTenantId();
        var pageable  = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        var dlqPage   = failedNotificationRepository.findByTenantId(tenantId, pageable);

        return ResponseEntity.ok(Map.of(
                "data",  dlqPage.getContent(),
                "total", dlqPage.getTotalElements(),
                "page",  page,
                "size",  size
        ));
    }

    /**
     * FIXED BUG-005: DLQ manual retry now actually re-publishes to Kafka.
     *
     * Original just deleted the DB record and returned "RETRY_QUEUED" — nothing
     * was ever queued. The notification was silently dropped forever.
     *
     * Fix:
     *  1. Rebuild a KafkaNotificationEvent from the FailedNotification record
     *  2. Reset retryCount to 0 so it gets a full fresh set of retry attempts
     *  3. Publish to notification.events (the main entry topic)
     *  4. Record the manual retry attempt on the DB record
     *  5. Delete the DLQ entry only after successful publish
     */
    @PostMapping("/dlq/{id}/retry")
    public ResponseEntity<Map<String, String>> retryFromDlq(@PathVariable UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        var failed = failedNotificationRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ValidationException("DLQ entry not found: " + id));

        try {
            // Rebuild the Kafka event from what was persisted in failed_notifications.
            // channel is stored as comma-separated string (e.g. "EMAIL,SMS") — split it back.
            List<String> channels = failed.getChannel() != null
                    ? Arrays.asList(failed.getChannel().split(","))
                    : List.of();

            KafkaNotificationEvent retryEvent = KafkaNotificationEvent.builder()
                    .requestId(failed.getRequestId())
                    .tenantId(failed.getTenantId())
                    .recipient(failed.getRecipient())
                    .channels(channels)
                    .correlationId(UUID.randomUUID().toString()) // fresh correlation ID for tracing
                    .retryCount(0) // reset — give it a full fresh set of retry attempts
                    .createdAt(Instant.now().toEpochMilli())
                    .build();

            // Publish to main entry topic — worker will process and retry normally if needed
            String serialized = objectMapper.writeValueAsString(retryEvent);
            kafkaTemplate.send(KafkaTopics.NOTIFICATION_EVENTS,
                    failed.getRequestId().toString(), serialized);

            // Track the manual retry on the record before deleting it
            failed.setManualRetryAttempted(true);
            failed.setManualRetryCount(
                failed.getManualRetryCount() == null ? 1 : failed.getManualRetryCount() + 1
            );
            failedNotificationRepository.save(failed);

            // Delete AFTER successful publish — prevents data loss if Kafka is down
            failedNotificationRepository.delete(failed);

            log.info("Manual DLQ retry queued: id={}, requestId={}, tenantId={}",
                    id, failed.getRequestId(), tenantId);

        } catch (Exception e) {
            log.error("Failed to re-queue DLQ entry id={}: {}", id, e.getMessage(), e);
            throw new ValidationException("Failed to re-queue notification: " + e.getMessage());
        }

        return ResponseEntity.ok(Map.of("status", "RETRY_QUEUED", "id", id.toString()));
    }

    /**
     * ADDED INT-004: Batch retry DLQ entries matching optional filters.
     *
     * Frontend's retryByFilter() was Promise.resolve() — silently did nothing.
     * Users clicking "Retry by filter" thought they triggered a bulk retry
     * but zero notifications were ever re-queued.
     *
     * Accepts: { channel?, errorCode?, search? }
     * Re-publishes each matching entry to notification.events, then deletes it.
     * Capped at 100 entries per call to avoid unbounded Kafka bursts.
     * Returns count of successfully queued entries.
     */
    @PostMapping("/dlq/retry-batch")
    public ResponseEntity<Map<String, Object>> retryBatchFromDlq(
            @RequestBody BatchRetryRequest request) {

        UUID tenantId = TenantContext.getTenantId();
        int  cap      = 100; // safety cap — prevent unbounded Kafka bursts
        var  pageable = PageRequest.of(0, cap, Sort.by(Sort.Direction.ASC, "createdAt"));

        List<com.notifly.common.domain.entity.FailedNotification> entries =
                failedNotificationRepository.findByTenantIdWithFilters(
                        tenantId,
                        request.getChannel(),
                        request.getErrorCode(),
                        request.getSearch(),
                        pageable
                );

        int queued  = 0;
        int skipped = 0;

        for (var failed : entries) {
            try {
                List<String> channels = failed.getChannel() != null
                        ? Arrays.asList(failed.getChannel().split(","))
                        : List.of();

                KafkaNotificationEvent retryEvent = KafkaNotificationEvent.builder()
                        .requestId(failed.getRequestId())
                        .tenantId(failed.getTenantId())
                        .recipient(failed.getRecipient())
                        .channels(channels)
                        .correlationId(UUID.randomUUID().toString())
                        .retryCount(0)
                        .createdAt(Instant.now().toEpochMilli())
                        .build();

                String serialized = objectMapper.writeValueAsString(retryEvent);
                kafkaTemplate.send(KafkaTopics.NOTIFICATION_EVENTS,
                        failed.getRequestId().toString(), serialized);

                failed.setManualRetryAttempted(true);
                failed.setManualRetryCount(
                    failed.getManualRetryCount() == null ? 1 : failed.getManualRetryCount() + 1
                );
                failedNotificationRepository.save(failed);
                failedNotificationRepository.delete(failed);
                queued++;

            } catch (Exception e) {
                log.error("Batch retry: failed to re-queue requestId={}: {}",
                        failed.getRequestId(), e.getMessage());
                skipped++;
            }
        }

        log.info("Batch DLQ retry: tenantId={}, queued={}, skipped={}", tenantId, queued, skipped);

        return ResponseEntity.ok(Map.of(
            "status",  "BATCH_RETRY_COMPLETE",
            "queued",  queued,
            "skipped", skipped,
            "total",   entries.size()
        ));
    }

    @DeleteMapping("/dlq/{id}")
    public ResponseEntity<Void> markUnrecoverable(@PathVariable UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        failedNotificationRepository.deleteByIdAndTenantId(id, tenantId);
        return ResponseEntity.noContent().build();
    }

    // ── API Keys ──────────────────────────────────────────────────────────────

    @GetMapping("/api-keys")
    public ResponseEntity<List<Map<String, Object>>> getApiKeys() {
        UUID tenantId = TenantContext.getTenantId();
        var keys = apiKeyRepository.findAllByTenantIdAndRevokedAtIsNull(tenantId);

        List<Map<String, Object>> response = keys.stream().map(k -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id",          k.getId());
            map.put("displayName", k.getDisplayName());
            map.put("keyPrefix",   k.getKeyPrefix() + "****");
            map.put("role",        k.getRole());
            map.put("createdAt",   k.getCreatedAt());
            map.put("revokedAt",   k.getRevokedAt());
            return map;
        }).toList();

        return ResponseEntity.ok(response);
    }

    @PostMapping("/api-keys")
    public ResponseEntity<Map<String, Object>> createApiKey(@Valid @RequestBody CreateApiKeyRequest request) {
        UUID tenantId = TenantContext.getTenantId();

        ApiKeyService.CreatedApiKey result = apiKeyService.createApiKey(
                tenantId, request.getDisplayName(), request.getRole());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id",          result.apiKey().getId());
        response.put("key",         result.rawKey());
        response.put("displayName", result.apiKey().getDisplayName());
        response.put("role",        result.apiKey().getRole());
        response.put("createdAt",   result.apiKey().getCreatedAt());
        response.put("warning",     "Save this key securely. It will not be shown again.");

        return ResponseEntity.status(201).body(response);
    }

    @DeleteMapping("/api-keys/{id}")
    public ResponseEntity<Void> revokeApiKey(@PathVariable UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        apiKeyService.revokeApiKey(id, tenantId);
        return ResponseEntity.noContent().build();
    }

    // ── Templates ─────────────────────────────────────────────────────────────

    @GetMapping("/templates")
    public ResponseEntity<List<Map<String, Object>>> getTemplates(
            @RequestParam(required = false) String channel,
            @RequestParam(required = false) Boolean active) {

        UUID tenantId = TenantContext.getTenantId();
        List<NotificationTemplate> templates =
                templateRepository.findByTenantIdWithFilters(tenantId, channel, active);

        List<Map<String, Object>> response = templates.stream().map(t -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id",        t.getId());
            map.put("tenantId",  t.getTenantId());
            map.put("name",      t.getName());
            map.put("channel",   t.getChannel());
            map.put("subject",   t.getSubject());
            map.put("content",   t.getContent());
            map.put("version",   t.getVersion());
            map.put("isActive",  t.getIsActive());
            map.put("variables", t.getVariables() != null ? t.getVariables() : List.of());
            map.put("createdAt", t.getCreatedAt());
            map.put("updatedAt", t.getUpdatedAt());
            return map;
        }).toList();

        return ResponseEntity.ok(response);
    }

    @PostMapping("/templates")
    public ResponseEntity<Map<String, Object>> createTemplate(
            @Valid @RequestBody CreateTemplateRequest request) {

        UUID tenantId = TenantContext.getTenantId();

        int nextVersion = templateRepository
                .findMaxVersionByTenantIdAndName(tenantId, request.getName())
                .map(v -> v + 1).orElse(1);

        NotificationTemplate template = NotificationTemplate.builder()
                .tenantId(tenantId)
                .name(request.getName())
                .channel(request.getChannel().toUpperCase())
                .content(request.getContent())
                .subject(request.getSubject())
                .version(nextVersion)
                .isActive(false)
                .build();

        NotificationTemplate saved = templateRepository.save(template);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id",        saved.getId());
        response.put("tenantId",  saved.getTenantId());
        response.put("name",      saved.getName());
        response.put("channel",   saved.getChannel());
        response.put("subject",   saved.getSubject());
        response.put("content",   saved.getContent());
        response.put("version",   saved.getVersion());
        response.put("isActive",  saved.getIsActive());
        response.put("variables", saved.getVariables() != null ? saved.getVariables() : List.of());
        response.put("createdAt", saved.getCreatedAt());
        response.put("updatedAt", saved.getUpdatedAt());

        return ResponseEntity.status(201).body(response);
    }

    @PutMapping("/templates/{id}")
    public ResponseEntity<Map<String, Object>> updateTemplate(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateTemplateRequest request) {

        UUID tenantId = TenantContext.getTenantId();
        NotificationTemplate template = templateRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ValidationException("Template not found: " + id));

        if (request.getContent() != null) template.setContent(request.getContent());
        if (request.getSubject() != null) template.setSubject(request.getSubject());
        if (request.getActive()  != null) template.setIsActive(request.getActive());

        NotificationTemplate saved = templateRepository.save(template);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id",        saved.getId());
        response.put("tenantId",  saved.getTenantId());
        response.put("name",      saved.getName());
        response.put("channel",   saved.getChannel());
        response.put("subject",   saved.getSubject());
        response.put("content",   saved.getContent());
        response.put("version",   saved.getVersion());
        response.put("isActive",  saved.getIsActive());
        response.put("variables", saved.getVariables() != null ? saved.getVariables() : List.of());
        response.put("createdAt", saved.getCreatedAt());
        response.put("updatedAt", saved.getUpdatedAt());

        return ResponseEntity.ok(response);
    }

    // ── Template Version History ──────────────────────────────────────────────

    /**
     * CQ-005 FIX: getVersionHistory() was permanently stubbed on the frontend
     * (always returned Promise.resolve([])) because this endpoint did not exist.
     *
     * Returns all versions of a template grouped by name, ordered oldest to newest.
     * Tenancy is enforced: the template must belong to the calling tenant.
     */
    @GetMapping("/templates/{id}/versions")
    public ResponseEntity<List<Map<String, Object>>> getTemplateVersions(@PathVariable UUID id) {
        UUID tenantId = TenantContext.getTenantId();

        // Resolve the template name from the given ID (also validates tenant ownership)
        String templateName = templateRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ValidationException("Template not found: " + id))
                .getName();

        // Fetch all versions for this name — one row per version in the DB
        List<Map<String, Object>> versions = templateRepository
                .findAllByTenantIdAndName(tenantId, templateName)
                .stream()
                .map(t -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("version",   t.getVersion());
                    m.put("content",   t.getContent());
                    m.put("subject",   t.getSubject());
                    m.put("isActive",  t.getIsActive());
                    m.put("createdAt", t.getCreatedAt());
                    return m;
                })
                .toList();

        return ResponseEntity.ok(versions);
    }

    // ── Request DTOs ──────────────────────────────────────────────────────────

    @Data
    public static class BatchRetryRequest {
        private String channel;    // optional — null means all channels
        private String errorCode;  // optional — e.g. "MAX_RETRIES_EXCEEDED"
        private String search;     // optional — requestId substring
    }

    @Data
    public static class CreateApiKeyRequest {
        @NotBlank
        private String displayName;

        // FIXED CQ-005: Validate role is one of the allowed enum values.
        // Without this, "role": "SUPERADMIN" throws an unhandled Jackson 400
        // with a cryptic error leaking internal class names.
        // Now returns a clean 400 with an actionable message.
        @NotNull(message = "role must not be null")
        @Pattern(
            regexp = "ADMIN|SERVICE",
            message = "role must be one of: ADMIN, SERVICE"
        )
        private String roleValue = "SERVICE";

        // Convert validated string to enum — never throws because roleValue is pre-validated
        public ApiKey.ApiKeyRole getRole() {
            return ApiKey.ApiKeyRole.valueOf(roleValue);
        }

        public void setRole(String role) {
            this.roleValue = role != null ? role : "SERVICE";
        }
    }

    @Data
    public static class CreateTemplateRequest {
        @NotBlank private String name;
        @NotBlank private String channel;
        @NotBlank private String content;
        private String subject;
    }

    @Data
    public static class UpdateTemplateRequest {
        private String content;
        private String subject;
        private Boolean active;
    }
}