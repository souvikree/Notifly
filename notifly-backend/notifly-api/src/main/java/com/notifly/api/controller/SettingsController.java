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
 * SECURITY FIX (SEC-001):
 *   Provider credentials (API keys, auth tokens) are NO LONGER stored in Redis.
 *   Redis only holds non-sensitive settings: channel, provider name, enabled flag.
 *
 *   Why: Redis is an in-memory store often accessible within a network without
 *   per-key ACLs. Storing SendGrid API keys, Twilio auth tokens, or Firebase
 *   service account paths in plaintext Redis creates a high-value exfiltration target.
 *
 *   Where credentials should live instead:
 *     - Local dev:    .env file → SENDGRID_API_KEY, TWILIO_AUTH_TOKEN, etc.
 *     - Production:   AWS Secrets Manager / HashiCorp Vault / GCP Secret Manager
 *     - Docker:       docker-compose environment block or secrets
 *
 *   The `config` field in UpdateProviderRequest is accepted from the client but
 *   intentionally dropped before the Redis write. The GET response returns an
 *   empty config map with a note explaining credentials are env-managed.
 *
 * Redis keys (non-sensitive data only):
 *   settings:{tenantId}:providers:{CHANNEL}   → { channel, provider, enabled, updatedAt }
 *   settings:{tenantId}:fallback              → (DB-backed, no Redis)
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

    private static final Duration SETTINGS_TTL   = Duration.ofDays(30);
    private static final Set<String> VALID_CHANNELS = Set.of("EMAIL", "SMS", "PUSH");

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

    /**
     * Update non-sensitive provider settings.
     *
     * SEC-001 FIX: The `config` field (which may contain API keys, auth tokens,
     * service account paths) is accepted in the request but NEVER written to Redis.
     * Only channel name, provider name, and enabled flag are persisted.
     *
     * If credentials are sent, they are silently dropped and a note is included
     * in the response so the caller knows credentials must be set via env vars.
     */
    @PutMapping("/providers")
    public ResponseEntity<Map<String, Object>> updateProvider(
            @Valid @RequestBody UpdateProviderRequest request) {

        UUID tenantId = TenantContext.getTenantId();

        // Normalize and validate channel
        String channel = request.getChannel().toUpperCase();
        if (!VALID_CHANNELS.contains(channel)) {
            throw new ValidationException("Invalid channel: " + request.getChannel()
                    + ". Must be one of: " + VALID_CHANNELS);
        }

        // SEC-001 FIX: Build the storable object WITHOUT the config map.
        // Only non-sensitive fields are persisted to Redis.
        Map<String, Object> storable = new LinkedHashMap<>();
        storable.put("channel",   channel);
        storable.put("provider",  request.getProvider());
        storable.put("enabled",   request.getEnabled());
        storable.put("updatedAt", System.currentTimeMillis());
        // NOTE: request.getConfig() is intentionally NOT included here.

        String key = buildKey(tenantId, "providers:" + channel);
        try {
            redisTemplate.opsForValue().set(key, objectMapper.writeValueAsString(storable), SETTINGS_TTL);
        } catch (Exception e) {
            throw new ValidationException("Failed to save provider settings: " + e.getMessage());
        }

        log.info("Provider settings updated: tenantId={}, channel={}, provider={}, enabled={}",
                tenantId, channel, request.getProvider(), request.getEnabled());

        // Return the stored (non-sensitive) data plus a note about credentials.
        // The response config is always empty — credentials are never round-tripped.
        Map<String, Object> response = new LinkedHashMap<>(storable);
        response.put("config", Map.of());
        if (request.getConfig() != null && !request.getConfig().isEmpty()) {
            // Let the caller know their credentials were received but not stored
            response.put("credentialsNote",
                "Credentials were not stored. Set provider credentials via environment variables " +
                "(e.g. SENDGRID_API_KEY, TWILIO_AUTH_TOKEN). See deployment docs for details.");
            log.warn("SEC: Provider config credentials received for tenantId={}, channel={} — dropped, not stored in Redis",
                    tenantId, channel);
        }

        return ResponseEntity.ok(response);
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

        // Validate every channel in the fallback order
        for (String channel : request.getFallbackOrder()) {
            if (!VALID_CHANNELS.contains(channel.toUpperCase())) {
                throw new ValidationException("Invalid channel in fallback order: " + channel
                        + ". Must be one of: " + VALID_CHANNELS);
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
        List<Map<String, Object>> providers = new ArrayList<>();

        for (String channel : VALID_CHANNELS) {
            String key    = buildKey(tenantId, "providers:" + channel);
            String stored = redisTemplate.opsForValue().get(key);

            Map<String, Object> providerConfig;
            if (stored != null) {
                try {
                    providerConfig = objectMapper.readValue(stored, Map.class);
                } catch (Exception e) {
                    log.warn("Failed to deserialize provider config for channel={}: {}", channel, e.getMessage());
                    providerConfig = defaultProviderConfig(channel);
                }
            } else {
                providerConfig = defaultProviderConfig(channel);
            }

            // SEC-001: Always return empty config in GET responses.
            // Credentials are env-managed — never returned to the client.
            providerConfig.put("config", Map.of());
            providers.add(providerConfig);
        }

        // Return in a stable order: EMAIL, SMS, PUSH
        providers.sort(Comparator.comparing(m -> m.get("channel").toString()));
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
        config.put("config",  Map.of());
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

        /**
         * Accepted for API compatibility but intentionally NOT persisted.
         * Credentials must be set via environment variables.
         * Example keys: apiKey, authToken, serviceAccountPath, fromEmail, fromPhone.
         */
        private Map<String, String> config;
    }

    @Data
    public static class UpdateFallbackRequest {
        @NotBlank private String eventType;
        @NotNull  private List<String> fallbackOrder;
    }
}