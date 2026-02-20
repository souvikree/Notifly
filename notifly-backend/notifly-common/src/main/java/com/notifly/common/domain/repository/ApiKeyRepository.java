package com.notifly.common.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.notifly.common.domain.entity.ApiKey;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ApiKeyRepository extends JpaRepository<ApiKey, UUID> {

    Optional<ApiKey> findByIdAndTenantId(UUID id, UUID tenantId);

    List<ApiKey> findAllByTenantIdAndRevokedAtIsNull(UUID tenantId);
    
    @Query("SELECT ak FROM ApiKey ak WHERE ak.tenantId = ?1 AND ak.keyPrefix = ?2 AND ak.revokedAt IS NULL")
    Optional<ApiKey> findValidByTenantIdAndKeyPrefix(UUID tenantId, String keyPrefix);

    @Query("SELECT ak FROM ApiKey ak WHERE ak.keyPrefix = ?1 AND ak.revokedAt IS NULL")
    Optional<ApiKey> findValidByKeyPrefix(String keyPrefix);
}
