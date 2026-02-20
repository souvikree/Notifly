package com.notifly.common.domain.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.notifly.common.domain.entity.NotificationLog;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface NotificationLogRepository extends JpaRepository<NotificationLog, UUID> {
    Optional<NotificationLog> findByTenantIdAndRequestIdAndChannelAndRetryAttempt(
            UUID tenantId, UUID requestId, String channel, Integer attempt);

    List<NotificationLog> findByTenantIdAndRequestId(UUID tenantId, UUID requestId);

    List<NotificationLog> findByTenantIdAndStatus(UUID tenantId, String status);

    long countByTenantIdAndStatus(UUID tenantId, String status);

    long countByTenantId(UUID tenantId);

    long countByTenantIdAndChannelAndStatus(UUID tenantId, String channel, String status);

    @Query("SELECT AVG(n.providerLatencyMs) FROM NotificationLog n WHERE n.tenantId = :tenantId AND n.status = 'SUCCESS'")
    Double avgLatencyByTenantId(UUID tenantId);

    @Query("""
                SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY n.providerLatencyMs)
                FROM NotificationLog n
                WHERE n.tenantId = :tenantId AND n.status = 'SUCCESS'
            """)
    Double p99LatencyByTenantId(UUID tenantId);

    @Query("""
                SELECT n FROM NotificationLog n
                WHERE n.tenantId = :tenantId
                AND (:status IS NULL OR n.status = :status)
                AND (:channel IS NULL OR n.channel = :channel)
                AND (:search IS NULL OR CAST(n.requestId AS string) LIKE %:search%)
            """)
    Page<NotificationLog> findByTenantIdWithFilters(
            UUID tenantId,
            String status,
            String channel,
            String search,
            Pageable pageable);
}
