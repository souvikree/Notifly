package com.notifly.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.notifly.common.context.CorrelationIdContext;
import com.notifly.common.domain.entity.NotificationOutbox;
import com.notifly.common.domain.entity.NotificationRequest;
import com.notifly.common.domain.repository.NotificationLogRepository;
import com.notifly.common.domain.repository.NotificationOutboxRepository;
import com.notifly.common.domain.repository.NotificationRequestRepository;
import com.notifly.common.dto.KafkaNotificationEvent;
import com.notifly.common.dto.NotificationRequestDTO;
import com.notifly.common.dto.NotificationResponseDTO;
import com.notifly.common.enums.NotificationStatus;
import com.notifly.common.exception.ValidationException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Core notification submission service.
 *
 * FIXED from original:
 * - submitNotification() signature now matches NotificationController call
 * (takes tenantId string, request, idempotencyKey, correlationId)
 * - getNotificationStatus() now implemented
 * - recipientAddress extracted properly from recipient map
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRequestRepository requestRepository;
    private final NotificationOutboxRepository outboxRepository;
    private final NotificationLogRepository logRepository;
    private final IdempotencyService idempotencyService;
    private final ObjectMapper objectMapper;

    /**
     * Submit a notification request.
     * Validates → idempotency check → persist → outbox → return ACCEPTED.
     */
    @Transactional
    public NotificationResponseDTO submitNotification(
            String tenantIdStr,
            NotificationRequestDTO request,
            String idempotencyKey,
            String correlationId) {

        UUID tenantId = UUID.fromString(tenantIdStr);
        CorrelationIdContext.setCorrelationId(correlationId);

        // Extract recipient address from map
        String recipientAddress = extractRecipientAddress(request);

        // Check idempotency key
        if (idempotencyKey != null) {
            Optional<NotificationRequest> existing = requestRepository.findByTenantIdAndIdempotencyKey(tenantId,
                    idempotencyKey);
            if (existing.isPresent()) {
                log.info("[{}] Idempotent request for key: {}", correlationId, idempotencyKey);
                return NotificationResponseDTO.builder()
                        .requestId(existing.get().getRequestId())
                        .status(NotificationStatus.ACCEPTED.name())
                        .message("Request accepted (duplicate)")
                        .correlationId(correlationId)
                        .build();
            }
        }

        try {
            UUID requestId = request.getRequestId() != null
                    ? UUID.fromString(request.getRequestId())
                    : UUID.randomUUID();
            String payloadJson = objectMapper.writeValueAsString(request);
            String payloadHash = computeHash(payloadJson);

            // Persist notification_request
            NotificationRequest notifRequest = NotificationRequest.builder()
                    .tenantId(tenantId)
                    .requestId(requestId.toString())
                    .idempotencyKey(idempotencyKey)
                    .payloadHash(payloadHash)
                    .payload(payloadJson)
                    .eventType(request.getEventType())
                    .userId(request.getUserId())
                    .recipientAddress(recipientAddress)
                    .build();

            requestRepository.save(notifRequest);
            log.debug("[{}] Notification request saved: {}", correlationId, requestId);

            // Build Kafka event
            KafkaNotificationEvent kafkaEvent = KafkaNotificationEvent.builder()
                    .requestId(requestId)
                    .tenantId(tenantId)
                    .eventType(request.getEventType())
                    .userId(request.getUserId())
                    .recipient(recipientAddress)
                    .channels(request.getChannels())
                    .correlationId(correlationId)
                    .retryCount(0)
                    .createdAt(System.currentTimeMillis())
                    .build();

            // Transactional Outbox: write to DB atomically with request
            NotificationOutbox outbox = NotificationOutbox.builder()
                    .tenantId(tenantId)
                    .aggregateId(requestId.toString())
                    .eventPayload(objectMapper.writeValueAsString(kafkaEvent))
                    .status(NotificationOutbox.OutboxStatus.PENDING)
                    .build();

            outboxRepository.save(outbox);
            log.debug("[{}] Outbox entry created for: {}", correlationId, requestId);

            return NotificationResponseDTO.builder()
                    .requestId(requestId.toString())
                    .status(NotificationStatus.ACCEPTED.name())
                    .message("Notification request accepted")
                    .correlationId(correlationId)
                    .build();

        } catch (DataIntegrityViolationException e) {
            // Duplicate constraint hit - return existing
            log.info("[{}] Duplicate detected via DB constraint", correlationId);
            return NotificationResponseDTO.builder()
                    .requestId(request.getRequestId())
                    .status(NotificationStatus.ACCEPTED.name())
                    .message("Request accepted (duplicate)")
                    .correlationId(correlationId)
                    .build();

        } catch (Exception e) {
            log.error("[{}] Failed to submit notification", correlationId, e);
            throw new RuntimeException("Failed to submit notification", e);
        }
    }

    /**
     * Get notification status by requestId (scoped to tenant).
     */
    public Map<String, Object> getNotificationStatus(String tenantIdStr, String requestId) {
        UUID tenantId = UUID.fromString(tenantIdStr);

        Optional<NotificationRequest> request = requestRepository.findByTenantIdAndRequestId(tenantId, requestId);

        if (request.isEmpty()) {
            return Map.of(
                    "requestId", requestId,
                    "status", "NOT_FOUND");
        }

        var logs = logRepository.findByTenantIdAndRequestId(tenantId, UUID.fromString(requestId));

        return Map.of(
                "requestId", requestId,
                "status",
                logs.isEmpty() ? "PENDING"
                        : logs.stream().anyMatch(l -> "SUCCESS".equals(l.getStatus())) ? "DELIVERED" : "FAILED",
                "deliveryLogs", logs,
                "createdAt", request.get().getCreatedAt());
    }

    private String extractRecipientAddress(NotificationRequestDTO request) {
        if (request.getRecipient() == null || request.getRecipient().isEmpty()) {
            throw new ValidationException("recipient map is required");
        }
        // Priority: email → phone → deviceToken
        return request.getRecipient().getOrDefault("email",
                request.getRecipient().getOrDefault("phone",
                        request.getRecipient().getOrDefault("deviceToken", "")));
    }

    private String computeHash(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return Base64.getEncoder().encodeToString(digest.digest(input.getBytes()));
        } catch (Exception e) {
            return UUID.randomUUID().toString(); // Fallback
        }
    }
}