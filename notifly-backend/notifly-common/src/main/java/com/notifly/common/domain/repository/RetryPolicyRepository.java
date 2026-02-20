package com.notifly.common.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.notifly.common.domain.entity.RetryPolicy;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface RetryPolicyRepository extends JpaRepository<RetryPolicy, UUID> {
    Optional<RetryPolicy> findByTenantIdAndEventType(UUID tenantId, String eventType);
}
