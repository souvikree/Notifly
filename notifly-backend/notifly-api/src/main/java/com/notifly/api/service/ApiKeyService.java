package com.notifly.api.service;

import com.notifly.common.domain.entity.ApiKey;
import com.notifly.common.domain.repository.ApiKeyRepository;
import com.notifly.common.exception.ValidationException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ApiKeyService {

    private static final String KEY_PREFIX = "nf_live_";
    private static final int PREFIX_SUFFIX_LENGTH = 8;
    private static final int RANDOM_PART_LENGTH = 32;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final ApiKeyRepository apiKeyRepository;
    private final PasswordEncoder passwordEncoder;

    public record CreatedApiKey(ApiKey apiKey, String rawKey) {}

    @Transactional
    public CreatedApiKey createApiKey(UUID tenantId, String displayName, ApiKey.ApiKeyRole role) {
        byte[] prefixBytes = new byte[6];
        byte[] randomBytes = new byte[24];
        SECURE_RANDOM.nextBytes(prefixBytes);
        SECURE_RANDOM.nextBytes(randomBytes);

        String prefixSuffix = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(prefixBytes).substring(0, PREFIX_SUFFIX_LENGTH);
        String randomPart = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(randomBytes).substring(0, RANDOM_PART_LENGTH);

        String rawKey   = KEY_PREFIX + prefixSuffix + randomPart;
        String keyPrefix = KEY_PREFIX + prefixSuffix;

        ApiKey apiKey = ApiKey.builder()
                .tenantId(tenantId)
                .keyHash(passwordEncoder.encode(rawKey))
                .keyPrefix(keyPrefix)
                .displayName(displayName)
                // role is String in the entity now — store the enum name as a string
                .role(role != null ? role.name() : ApiKey.ApiKeyRole.SERVICE.name())
                .build();

        apiKey = apiKeyRepository.save(apiKey);
        log.info("API key created: tenantId={}, displayName={}, role={}", tenantId, displayName, role);

        return new CreatedApiKey(apiKey, rawKey);
    }

    @Transactional
    public void revokeApiKey(UUID keyId, UUID tenantId) {
        ApiKey key = apiKeyRepository.findByIdAndTenantId(keyId, tenantId)
                .orElseThrow(() -> new ValidationException("API key not found: " + keyId));

        if (key.getRevokedAt() != null) {
            throw new ValidationException("API key is already revoked");
        }

        key.setRevokedAt(Instant.now());
        key.setRevoked(true);
        apiKeyRepository.save(key);
        log.info("API key revoked: keyId={}, tenantId={}", keyId, tenantId);
    }
}