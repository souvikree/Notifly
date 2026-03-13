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
        Optional<NotificationRequest> existing =
            notificationRequestRepository.findByTenantIdAndIdempotencyKey(tenantId, idempotencyKey);

        if (existing.isPresent()) {
            NotificationRequest existingRequest = existing.get();

            // Validate payload consistency — reused key must have identical payload
            String newPayloadHash = computePayloadHash(request);
            if (!newPayloadHash.equals(existingRequest.getPayloadHash())) {
                log.warn("Idempotency key reused with different payload for tenant {}", tenantId);
                throw new IdempotencyException(
                        "Idempotency key already used with different payload. " +
                        "Idempotency keys must be reused with identical payloads.");
            }

            log.debug("Idempotent request detected for tenant {} with key {}", tenantId, idempotencyKey);
            return Optional.of(existingRequest);
        }

        return Optional.empty();
    }

    /**
     * Hash by serializing the DTO to JSON first, then hashing.
     * NOTE: Prefer computePayloadHashFromJson() when the caller has already
     * serialized the DTO — avoids a redundant ObjectMapper call (CQ-003).
     */
    public String computePayloadHash(NotificationRequestDTO request) {
        try {
            String payloadJson = objectMapper.writeValueAsString(request);
            return computePayloadHashFromJson(payloadJson);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize request for hash computation", e);
            throw new IdempotencyException("Failed to compute payload hash");
        }
    }

    /**
     * CQ-003 FIX: Hash from an already-serialized JSON string.
     *
     * NotificationService serializes the DTO to JSON once (to store as payloadJson),
     * then calls this method to hash that same string — avoiding a second
     * ObjectMapper.writeValueAsString() call inside computePayloadHash().
     */
    public String computePayloadHashFromJson(String json) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(json.getBytes());
            return Base64.getEncoder().encodeToString(hash);
        } catch (NoSuchAlgorithmException e) {
            log.error("SHA-256 not available", e);
            throw new IdempotencyException("Failed to compute payload hash");
        }
    }
}