package com.notifly.api.controller;

import com.notifly.api.service.NotificationService;
import com.notifly.api.service.RateLimiterService;
import com.notifly.common.dto.NotificationRequestDTO;
import com.notifly.common.dto.NotificationResponseDTO;
import com.notifly.common.exception.ValidationException;
import com.notifly.common.util.CorrelationIdUtil;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Notification submission endpoint.
 *
 * FIXED from original:
 *  - Removed @CrossOrigin(origins="*") — handled in SecurityConfig CORS
 *  - Service call now matches updated NotificationService signature
 *  - Rate limit call uses UUID tenantId correctly
 *  - tenantId is extracted from Authentication principal (set by JWT/ApiKey filters)
 *
 * BUG-007 FIX: getStatus() now validates requestId is a well-formed UUID before
 * calling the service. Previously UUID.fromString() inside the service threw
 * IllegalArgumentException which bubbled up as an unhandled 500 with a stack trace.
 * Now returns a clean 400 ValidationException instead.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;
    private final RateLimiterService rateLimiterService;

    /**
     * POST /api/v1/notifications
     * Accepts notification event, validates, persists, queues to Kafka.
     * Returns 202 ACCEPTED immediately (async processing).
     */
    @PostMapping
    public ResponseEntity<NotificationResponseDTO> submitNotification(
            @Valid @RequestBody NotificationRequestDTO request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            Authentication authentication) {

        String correlationId = CorrelationIdUtil.generateNewCorrelationId();
        // Principal = tenantId string, set by JwtAuthFilter or ApiKeyAuthFilter
        String tenantId = (String) authentication.getPrincipal();

        log.info("[{}] Notification request from tenant: {}", correlationId, tenantId);

        // Validate required fields
        if (request.getEventType() == null || request.getEventType().isBlank()) {
            throw new ValidationException("event_type is required");
        }
        if (request.getChannels() == null || request.getChannels().isEmpty()) {
            throw new ValidationException("channels array is required and must not be empty");
        }
        if (request.getRecipient() == null || request.getRecipient().isEmpty()) {
            throw new ValidationException("recipient object is required");
        }

        // Rate limit per tenant
        rateLimiterService.checkRateLimit(UUID.fromString(tenantId), getApiKeyId(authentication));

        NotificationResponseDTO response = notificationService.submitNotification(
                tenantId, request, idempotencyKey, correlationId);

        log.info("[{}] Notification {} accepted for tenant: {}",
                correlationId, response.getRequestId(), tenantId);

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }

    /**
     * GET /api/v1/notifications/{requestId}
     * Check status of a submitted notification.
     *
     * BUG-007 FIX: Validate requestId is a valid UUID before calling the service.
     * Without this, a non-UUID path segment (e.g. "not-a-uuid") causes
     * UUID.fromString() inside NotificationService to throw IllegalArgumentException,
     * which propagates as an unhandled 500 and leaks a stack trace to the caller.
     */
    @GetMapping("/{requestId}")
    public ResponseEntity<Map<String, Object>> getStatus(
            @PathVariable String requestId,
            Authentication authentication) {

        // Validate early — return 400 before touching the service layer
        try {
            UUID.fromString(requestId);
        } catch (IllegalArgumentException e) {
            throw new ValidationException("requestId must be a valid UUID (e.g. 123e4567-e89b-12d3-a456-426614174000)");
        }

        String tenantId = (String) authentication.getPrincipal();
        Map<String, Object> status = notificationService.getNotificationStatus(tenantId, requestId);
        return ResponseEntity.ok(status);
    }

    private String getApiKeyId(Authentication auth) {
        if (auth.getCredentials() instanceof com.notifly.common.domain.entity.ApiKey key) {
            return key.getId().toString();
        }
        return "jwt-user";
    }
}