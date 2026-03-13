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

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * CQ-003 FIX: Eliminated double JSON serialization.
 *
 * Previously:
 *   payloadJson = objectMapper.writeValueAsString(request);  // serialization #1
 *   payloadHash = idempotencyService.computePayloadHash(request); // serialization #2 internally
 *
 * Now:
 *   payloadJson = objectMapper.writeValueAsString(request);  // only once
 *   payloadHash = idempotencyService.computePayloadHashFromJson(payloadJson); // reuses the string
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

    @Transactional
    public NotificationResponseDTO submitNotification(
            String tenantIdStr,
            NotificationRequestDTO request,
            String idempotencyKey,
            String correlationId) {

        UUID tenantId = UUID.fromString(tenantIdStr);
        CorrelationIdContext.setCorrelationId(correlationId);

        String recipientAddress = extractRecipientAddress(request);

        if (idempotencyKey != null) {
            Optional<NotificationRequest> existing =
                idempotencyService.checkIdempotency(tenantId, idempotencyKey, request);
            if (existing.isPresent()) {
                log.info("[{}] Idempotent request for key: {}", correlationId, idempotencyKey);
                return NotificationResponseDTO.builder()
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

            // CQ-003 FIX: serialize once, pass the JSON string directly to the hash method.
            // The old computePayloadHash(request) re-serialized the DTO internally,
            // causing two ObjectMapper.writeValueAsString() calls per request.
            String payloadJson = objectMapper.writeValueAsString(request);
            String payloadHash = idempotencyService.computePayloadHashFromJson(payloadJson);

            NotificationRequest notifRequest = NotificationRequest.builder()
                    .tenantId(tenantId)
                    .requestId(requestId)
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
                    .requestId(requestId.toString())
                    .status(NotificationStatus.ACCEPTED.name())
                    .message("Notification request accepted")
                    .correlationId(correlationId)
                    .build();

        } catch (DataIntegrityViolationException e) {
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

    public Map<String, Object> getNotificationStatus(String tenantIdStr, String requestId) {
        UUID tenantId = UUID.fromString(tenantIdStr);
        UUID requestUUID = UUID.fromString(requestId);

        Optional<NotificationRequest> request =
            requestRepository.findByTenantIdAndRequestId(tenantId, requestUUID);

        if (request.isEmpty()) {
            return Map.of("requestId", requestId, "status", "NOT_FOUND");
        }

        var logs = logRepository.findByTenantIdAndRequestId(tenantId, requestUUID);

        return Map.of(
                "requestId",    requestId,
                "status",       logs.isEmpty() ? "PENDING"
                                : logs.stream().anyMatch(l -> "SENT".equals(l.getStatus())) ? "DELIVERED" : "FAILED",
                "deliveryLogs", logs,
                "createdAt",    request.get().getCreatedAt());
    }

    private String extractRecipientAddress(NotificationRequestDTO request) {
        if (request.getRecipient() == null || request.getRecipient().isEmpty()) {
            throw new ValidationException("recipient map is required");
        }
        return request.getRecipient().getOrDefault("email",
                request.getRecipient().getOrDefault("phone",
                        request.getRecipient().getOrDefault("deviceToken", "")));
    }
}