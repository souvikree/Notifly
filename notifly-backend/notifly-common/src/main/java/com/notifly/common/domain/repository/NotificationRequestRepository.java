package com.notifly.common.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.notifly.common.domain.entity.NotificationRequest;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface NotificationRequestRepository extends JpaRepository<NotificationRequest, UUID> {

    @Query("SELECT nr FROM NotificationRequest nr WHERE nr.tenantId = ?1 AND nr.requestId = ?2")
    Optional<NotificationRequest> findByTenantIdAndRequestId(UUID tenantId, String requestId);

    @Query("SELECT nr FROM NotificationRequest nr WHERE nr.tenantId = ?1 AND nr.idempotencyKey = ?2")
    Optional<NotificationRequest> findByTenantIdAndIdempotencyKey(UUID tenantId, String idempotencyKey);
}
