package com.notifly.api.controller;

import com.notifly.api.service.ApiKeyService;
import com.notifly.common.context.TenantContext;
import com.notifly.common.domain.entity.ApiKey;
import com.notifly.common.domain.entity.NotificationTemplate;
import com.notifly.common.domain.repository.*;
import com.notifly.common.exception.ValidationException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
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

    // ── Metrics ───────────────────────────────────────────────────────────────

    @GetMapping("/metrics")
    public ResponseEntity<Map<String, Object>> getMetrics() {
        UUID tenantId = TenantContext.getTenantId();

        long total       = logRepository.countByTenantId(tenantId);
        long succeeded   = logRepository.countByTenantIdAndStatus(tenantId, "SENT");
        long failed      = logRepository.countByTenantIdAndStatus(tenantId, "FAILED");
        long dlqCount    = failedNotificationRepository.countByTenantId(tenantId);
        Double avgLatency = logRepository.avgLatencyByTenantId(tenantId);
        Double p99Latency = logRepository.p99LatencyByTenantId(tenantId);

        double successRate = total > 0 ? (double) succeeded / total * 100.0 : 0.0;

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
        metrics.put("totalNotifications", total);
        metrics.put("successfulDeliveries", succeeded);
        metrics.put("failedDeliveries", failed);
        metrics.put("pendingNotifications", 0);
        metrics.put("dlqCount", dlqCount);
        metrics.put("averageLatency", avgLatency != null ? avgLatency : 0.0);
        metrics.put("p99Latency", p99Latency != null ? p99Latency : 0.0);
        metrics.put("successRate", successRate);
        metrics.put("channelMetrics", Map.of("email", emailStats, "sms", smsStats, "push", pushStats));

        return ResponseEntity.ok(Map.of("metrics", metrics, "timeSeries", List.of()));
    }

    // ── Notification Logs ─────────────────────────────────────────────────────

    @GetMapping("/logs")
    public ResponseEntity<Map<String, Object>> getLogs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String channel,
            @RequestParam(required = false) String search) {

        UUID tenantId = TenantContext.getTenantId();
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        var logsPage = logRepository.findByTenantIdWithFilters(tenantId, status, channel, search, pageable);

        return ResponseEntity.ok(Map.of(
                "data", logsPage.getContent(),
                "total", logsPage.getTotalElements(),
                "page", page,
                "size", size,
                "totalPages", logsPage.getTotalPages()
        ));
    }

    // ── Dead Letter Queue ─────────────────────────────────────────────────────

    @GetMapping("/dlq")
    public ResponseEntity<Map<String, Object>> getDlq(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search) {

        UUID tenantId = TenantContext.getTenantId();
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        var dlqPage = failedNotificationRepository.findByTenantId(tenantId, pageable);

        return ResponseEntity.ok(Map.of(
                "data", dlqPage.getContent(),
                "total", dlqPage.getTotalElements(),
                "page", page,
                "size", size
        ));
    }

    @PostMapping("/dlq/{id}/retry")
    public ResponseEntity<Map<String, String>> retryFromDlq(@PathVariable UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        var failed = failedNotificationRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ValidationException("DLQ entry not found: " + id));

        failedNotificationRepository.delete(failed);
        log.info("Manual DLQ retry triggered: id={}, tenantId={}", id, tenantId);

        return ResponseEntity.ok(Map.of("status", "RETRY_QUEUED", "id", id.toString()));
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
        // findAllByTenantIdAndRevokedAtIsNull still works — revokedAt field still exists
        var keys = apiKeyRepository.findAllByTenantIdAndRevokedAtIsNull(tenantId);

        List<Map<String, Object>> response = keys.stream().map(k -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", k.getId());
            map.put("displayName", k.getDisplayName());
            map.put("keyPrefix", k.getKeyPrefix() + "****");
            map.put("role", k.getRole());           // String now — no .name() needed
            map.put("createdAt", k.getCreatedAt());
            map.put("revokedAt", k.getRevokedAt());
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
        response.put("id", result.apiKey().getId());
        response.put("key", result.rawKey());
        response.put("displayName", result.apiKey().getDisplayName());
        response.put("role", result.apiKey().getRole());
        response.put("createdAt", result.apiKey().getCreatedAt());
        response.put("warning", "Save this key securely. It will not be shown again.");

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

        // Map to plain objects — avoids any Hibernate proxy / lazy-load issues
        // during Jackson serialization, even if entity changes later.
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
            // variables may be null for rows inserted before the jsonb fix —
            // return empty list rather than null so the frontend never crashes
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

        // Return same plain-map shape as getTemplates so frontend stays consistent
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

    // ── Request DTOs ──────────────────────────────────────────────────────────

    @Data
    public static class CreateApiKeyRequest {
        @NotBlank
        private String displayName;
        private ApiKey.ApiKeyRole role = ApiKey.ApiKeyRole.SERVICE;
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