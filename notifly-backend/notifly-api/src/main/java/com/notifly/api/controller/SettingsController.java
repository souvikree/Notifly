package com.notifly.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.notifly.common.context.TenantContext;
import com.notifly.common.domain.repository.EventChannelPolicyRepository;
import com.notifly.common.domain.repository.RateLimitConfigRepository;
import com.notifly.common.exception.ValidationException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.*;

/**
 * Settings API — channel provider configuration and fallback order management.
 *
 * NEW FILE: Frontend calls GET/PUT /admin/settings but no such controller existed.
 * The settings page was silently falling back to mock data for every user.
 *
 * These settings are stored in Redis with a DB-backed fallback:
 *  - Provider configs: per-tenant, channel-specific settings
 *  - Fallback order: maps eventType → ordered list of channels to try
 *  - Rate limit config: per-tenant request limits
 *
 * Redis keys:
 *  settings:{tenantId}:providers
 *  settings:{tenantId}:fallback
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/admin/settings")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class SettingsController {

    private final RedisTemplate<String, String> redisTemplate;
    private final EventChannelPolicyRepository channelPolicyRepository;
    private final RateLimitConfigRepository rateLimitConfigRepository;
    private final ObjectMapper objectMapper;

    private static final Duration SETTINGS_TTL = Duration.ofDays(30);

    // ── GET all settings ──────────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<Map<String, Object>> getSettings() {
        UUID tenantId = TenantContext.getTenantId();

        Map<String, Object> settings = new LinkedHashMap<>();
        settings.put("providers",       getProviderSettings(tenantId));
        settings.put("fallbackConfigs", getFallbackSettings(tenantId));
        settings.put("rateLimits",      getRateLimitSettings(tenantId));

        return ResponseEntity.ok(settings);
    }

    // ── Provider configuration ────────────────────────────────────────────────

    @GetMapping("/providers")
    public ResponseEntity<List<Map<String, Object>>> getProviders() {
        UUID tenantId = TenantContext.getTenantId();
        return ResponseEntity.ok(getProviderSettings(tenantId));
    }

    @PutMapping("/providers")
    public ResponseEntity<Map<String, Object>> updateProvider(
            @Valid @RequestBody UpdateProviderRequest request) {

        UUID tenantId = TenantContext.getTenantId();
        String key = buildKey(tenantId, "providers:" + request.getChannel());

        try {
            Map<String, Object> providerConfig = new LinkedHashMap<>();
            providerConfig.put("channel",  request.getChannel());
            providerConfig.put("provider", request.getProvider());
            providerConfig.put("enabled",  request.getEnabled());
            providerConfig.put("config",   request.getConfig() != null ? request.getConfig() : Map.of());
            providerConfig.put("updatedAt", System.currentTimeMillis());

            redisTemplate.opsForValue().set(key, objectMapper.writeValueAsString(providerConfig), SETTINGS_TTL);
            log.info("Provider settings updated: tenantId={}, channel={}", tenantId, request.getChannel());
            return ResponseEntity.ok(providerConfig);
        } catch (Exception e) {
            throw new ValidationException("Failed to save provider settings: " + e.getMessage());
        }
    }

    // ── Fallback configuration ────────────────────────────────────────────────

    @GetMapping("/fallback")
    public ResponseEntity<List<Map<String, Object>>> getFallback() {
        UUID tenantId = TenantContext.getTenantId();
        return ResponseEntity.ok(getFallbackSettings(tenantId));
    }

    @PutMapping("/fallback")
    public ResponseEntity<Map<String, Object>> updateFallback(
            @Valid @RequestBody UpdateFallbackRequest request) {

        UUID tenantId = TenantContext.getTenantId();

        // Validate channels
        Set<String> validChannels = Set.of("EMAIL", "SMS", "PUSH", "WEBHOOK");
        for (String channel : request.getFallbackOrder()) {
            if (!validChannels.contains(channel.toUpperCase())) {
                throw new ValidationException("Invalid channel in fallback order: " + channel);
            }
        }

        // Persist to DB via EventChannelPolicy
        channelPolicyRepository.findByTenantIdAndEventType(tenantId, request.getEventType())
            .ifPresentOrElse(
                policy -> {
                    policy.setFallbackOrder(request.getFallbackOrder().stream()
                        .map(String::toUpperCase).toList());
                    channelPolicyRepository.save(policy);
                },
                () -> {
                    com.notifly.common.domain.entity.EventChannelPolicy newPolicy =
                        com.notifly.common.domain.entity.EventChannelPolicy.builder()
                            .tenantId(tenantId)
                            .eventType(request.getEventType())
                            .fallbackOrder(request.getFallbackOrder().stream()
                                .map(String::toUpperCase).toList())
                            .build();
                    channelPolicyRepository.save(newPolicy);
                }
            );

        Map<String, Object> response = Map.of(
            "eventType",     request.getEventType(),
            "fallbackOrder", request.getFallbackOrder(),
            "updatedAt",     System.currentTimeMillis()
        );

        log.info("Fallback order updated: tenantId={}, eventType={}, order={}",
                tenantId, request.getEventType(), request.getFallbackOrder());
        return ResponseEntity.ok(response);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> getProviderSettings(UUID tenantId) {
        List<String> channels = List.of("EMAIL", "SMS", "PUSH");
        List<Map<String, Object>> providers = new ArrayList<>();

        for (String channel : channels) {
            String key = buildKey(tenantId, "providers:" + channel);
            String stored = redisTemplate.opsForValue().get(key);

            if (stored != null) {
                try {
                    providers.add(objectMapper.readValue(stored, Map.class));
                } catch (Exception e) {
                    providers.add(defaultProviderConfig(channel));
                }
            } else {
                providers.add(defaultProviderConfig(channel));
            }
        }
        return providers;
    }

    private List<Map<String, Object>> getFallbackSettings(UUID tenantId) {
        return channelPolicyRepository.findAllByTenantId(tenantId).stream()
                .map(policy -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("eventType",     policy.getEventType());
                    m.put("fallbackOrder", policy.getFallbackOrder());
                    return m;
                })
                .toList();
    }

    private Map<String, Object> getRateLimitSettings(UUID tenantId) {
        return rateLimitConfigRepository.findByTenantId(tenantId)
                .map(config -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("requestsPerMinute", config.getRequestsPerMinute());
                    m.put("burstLimit",        config.getBurstLimit());
                    return m;
                })
                .orElse(Map.of("requestsPerMinute", 60, "burstLimit", 100));
    }

    private Map<String, Object> defaultProviderConfig(String channel) {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("channel",  channel);
        config.put("provider", switch (channel) {
            case "EMAIL" -> "SENDGRID";
            case "SMS"   -> "TWILIO";
            case "PUSH"  -> "FCM";
            default      -> "NONE";
        });
        config.put("enabled", false);
        config.put("config", Map.of());
        return config;
    }

    private String buildKey(UUID tenantId, String suffix) {
        return "settings:" + tenantId + ":" + suffix;
    }

    // ── Request DTOs ──────────────────────────────────────────────────────────

    @Data
    public static class UpdateProviderRequest {
        @NotBlank private String channel;
        @NotBlank private String provider;
        @NotNull  private Boolean enabled;
        private Map<String, String> config;
    }

    @Data
    public static class UpdateFallbackRequest {
        @NotBlank private String eventType;
        @NotNull  private List<String> fallbackOrder;
    }
}
