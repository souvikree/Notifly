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

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRequestRepository requestRepository;
    private final NotificationOutboxRepository outboxRepository;
    private final NotificationLogRepository logRepository;
    private final IdempotencyService idempotencyService;
    private final ObjectMapper objectMapper;

    @Transactional
    public NotificationResponseDTO submitNotification(
            String tenantIdStr,
            NotificationRequestDTO request,
            String idempotencyKey,
            String correlationId) {

        UUID tenantId = UUID.fromString(tenantIdStr);
        CorrelationIdContext.setCorrelationId(correlationId);

        String recipientAddress = extractRecipientAddress(request);

        // Idempotency check
        if (idempotencyKey != null) {
            Optional<NotificationRequest> existing =
                requestRepository.findByTenantIdAndIdempotencyKey(tenantId, idempotencyKey);
            if (existing.isPresent()) {
                log.info("[{}] Idempotent request for key: {}", correlationId, idempotencyKey);
                return NotificationResponseDTO.builder()
                        // requestId in entity is UUID — convert to String for DTO
                        .requestId(existing.get().getRequestId().toString())
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

            // requestId is UUID in the entity — pass directly
            // userId and recipientAddress removed (don't exist in DB)
            NotificationRequest notifRequest = NotificationRequest.builder()
                    .tenantId(tenantId)
                    .requestId(requestId)           // UUID
                    .idempotencyKey(idempotencyKey)
                    .payloadHash(payloadHash)
                    .payload(payloadJson)
                    .eventType(request.getEventType())
                    .status("PENDING")
                    .build();

            requestRepository.save(notifRequest);
            log.debug("[{}] Notification request saved: {}", correlationId, requestId);

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

            NotificationOutbox outbox = NotificationOutbox.builder()
                    .tenantId(tenantId)
                    .aggregateId(requestId.toString())
                    .eventPayload(objectMapper.writeValueAsString(kafkaEvent))
                    .status(NotificationOutbox.OutboxStatus.PENDING)
                    .build();

            outboxRepository.save(outbox);
            log.debug("[{}] Outbox entry created for: {}", correlationId, requestId);

            return NotificationResponseDTO.builder()
                    .requestId(requestId.toString())    // DTO expects String
                    .status(NotificationStatus.ACCEPTED.name())
                    .message("Notification request accepted")
                    .correlationId(correlationId)
                    .build();

        } catch (DataIntegrityViolationException e) {
            log.info("[{}] Duplicate detected via DB constraint", correlationId);
            return NotificationResponseDTO.builder()
                    .requestId(request.getRequestId())  // already a String from DTO
                    .status(NotificationStatus.ACCEPTED.name())
                    .message("Request accepted (duplicate)")
                    .correlationId(correlationId)
                    .build();

        } catch (Exception e) {
            log.error("[{}] Failed to submit notification", correlationId, e);
            throw new RuntimeException("Failed to submit notification", e);
        }
    }

    public Map<String, Object> getNotificationStatus(String tenantIdStr, String requestId) {
        UUID tenantId = UUID.fromString(tenantIdStr);
        UUID requestUUID = UUID.fromString(requestId);

        // findByTenantIdAndRequestId now takes UUID for both args
        Optional<NotificationRequest> request =
            requestRepository.findByTenantIdAndRequestId(tenantId, requestUUID);

        if (request.isEmpty()) {
            return Map.of("requestId", requestId, "status", "NOT_FOUND");
        }

        var logs = logRepository.findByTenantIdAndRequestId(tenantId, requestUUID);

        return Map.of(
                "requestId", requestId,
                "status", logs.isEmpty() ? "PENDING"
                        : logs.stream().anyMatch(l -> "SENT".equals(l.getStatus())) ? "DELIVERED" : "FAILED",
                "deliveryLogs", logs,
                "createdAt", request.get().getCreatedAt());
    }

    private String extractRecipientAddress(NotificationRequestDTO request) {
        if (request.getRecipient() == null || request.getRecipient().isEmpty()) {
            throw new ValidationException("recipient map is required");
        }
        return request.getRecipient().getOrDefault("email",
                request.getRecipient().getOrDefault("phone",
                        request.getRecipient().getOrDefault("deviceToken", "")));
    }

    private String computeHash(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return Base64.getEncoder().encodeToString(digest.digest(input.getBytes()));
        } catch (Exception e) {
            return UUID.randomUUID().toString();
        }
    }
}