package com.notifly.common.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.notifly.common.domain.entity.EventChannelPolicy;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface EventChannelPolicyRepository extends JpaRepository<EventChannelPolicy, UUID> {
    Optional<EventChannelPolicy> findByTenantIdAndEventType(UUID tenantId, String eventType);
}
