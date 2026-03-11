package com.notifly.common.domain.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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

    // ADDED: Used by AdminController.retryBatchFromDlq() (INT-004)
    // Supports filtering by channel, errorCode, and search (requestId substring).
    // All filter params are optional — null means "match all".
    // Capped at a max batch size in the controller to avoid unbounded queries.
    @Query("""
        SELECT f FROM FailedNotification f
        WHERE f.tenantId = :tenantId
        AND (:channel   IS NULL OR f.channel   = :channel)
        AND (:errorCode IS NULL OR f.errorCode = :errorCode)
        AND (:search    IS NULL OR CAST(f.requestId AS string) LIKE %:search%)
        ORDER BY f.createdAt ASC
    """)
    List<FailedNotification> findByTenantIdWithFilters(
        @Param("tenantId")  UUID   tenantId,
        @Param("channel")   String channel,
        @Param("errorCode") String errorCode,
        @Param("search")    String search,
        Pageable pageable
    );
}