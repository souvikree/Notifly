package com.notifly.common.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.notifly.common.domain.entity.RateLimitConfig;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface RateLimitConfigRepository extends JpaRepository<RateLimitConfig, UUID> {

    @Query("SELECT rc FROM RateLimitConfig rc WHERE rc.tenantId = ?1")
    Optional<RateLimitConfig> findByTenantId(UUID tenantId);
}
