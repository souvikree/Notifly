package com.notifly.common.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.notifly.common.domain.entity.EventChannelPolicy;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EventChannelPolicyRepository extends JpaRepository<EventChannelPolicy, UUID> {

    // Used by NotificationProcessorService — find policy for a specific event type
    Optional<EventChannelPolicy> findByTenantIdAndEventType(UUID tenantId, String eventType);

    // Used by SettingsController.getFallbackSettings() — list all policies for a tenant
    List<EventChannelPolicy> findAllByTenantId(UUID tenantId);
}