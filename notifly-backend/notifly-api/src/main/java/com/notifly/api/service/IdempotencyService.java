package com.notifly.api.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.notifly.common.exception.IdempotencyException;
import com.notifly.common.domain.entity.NotificationRequest;
import com.notifly.common.domain.repository.NotificationRequestRepository;
import com.notifly.common.dto.NotificationRequestDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
public class IdempotencyService {

    private final NotificationRequestRepository notificationRequestRepository;
    private final ObjectMapper objectMapper;

    public IdempotencyService(NotificationRequestRepository notificationRequestRepository, ObjectMapper objectMapper) {
        this.notificationRequestRepository = notificationRequestRepository;
        this.objectMapper = objectMapper;
    }

    public Optional<NotificationRequest> checkIdempotency(UUID tenantId, String idempotencyKey, NotificationRequestDTO request) {
        // Check by idempotency key
        Optional<NotificationRequest> existing = notificationRequestRepository.findByTenantIdAndIdempotencyKey(tenantId, idempotencyKey);

        if (existing.isPresent()) {
            NotificationRequest existingRequest = existing.get();
            
            // Validate payload consistency
            String newPayloadHash = computePayloadHash(request);
            if (!newPayloadHash.equals(existingRequest.getPayloadHash())) {
                log.warn("Idempotency key reused with different payload for tenant {}", tenantId);
                throw new IdempotencyException(
                        "Idempotency key already used with different payload. Idempotency keys must be reused with identical payloads."
                );
            }
            
            log.debug("Idempotent request detected for tenant {} with key {}", tenantId, idempotencyKey);
            return Optional.of(existingRequest);
        }

        return Optional.empty();
    }

    public String computePayloadHash(NotificationRequestDTO request) {
        try {
            String payloadJson = objectMapper.writeValueAsString(request);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(payloadJson.getBytes());
            return Base64.getEncoder().encodeToString(hash);
        } catch (JsonProcessingException | NoSuchAlgorithmException e) {
            log.error("Failed to compute payload hash", e);
            throw new IdempotencyException("Failed to compute payload hash");
        }
    }
}
