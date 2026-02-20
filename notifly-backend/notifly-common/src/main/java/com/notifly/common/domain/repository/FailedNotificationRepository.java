package com.notifly.common.domain.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.notifly.common.domain.entity.FailedNotification;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FailedNotificationRepository extends JpaRepository<FailedNotification, UUID> {
    List<FailedNotification> findByTenantId(UUID tenantId);

    long countByTenantId(UUID tenantId);

    List<FailedNotification> findByTenantIdAndChannel(UUID tenantId, String channel);

    Page<FailedNotification> findByTenantId(UUID tenantId, Pageable pageable);

    Optional<FailedNotification> findByIdAndTenantId(UUID id, UUID tenantId);

    void deleteByIdAndTenantId(UUID id, UUID tenantId);
}
