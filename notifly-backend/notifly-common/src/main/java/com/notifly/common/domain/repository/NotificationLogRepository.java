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

    // ADDED: Used by NotificationProcessorService.hasSuccessfulDelivery()
    // Replaces the old findByTenantIdAndRequestIdAndChannelAndRetryAttempt(... 0) check,
    // which only looked at attempt=0 and missed successes on retry attempts.
    boolean existsByTenantIdAndRequestIdAndChannelAndStatus(
            UUID tenantId, UUID requestId, String channel, String status);

    // ADDED: Used by AdminController log retry endpoint
    Optional<NotificationLog> findByIdAndTenantId(UUID id, UUID tenantId);

    List<NotificationLog> findByTenantIdAndRequestId(UUID tenantId, UUID requestId);

    List<NotificationLog> findByTenantIdAndStatus(UUID tenantId, String status);

    long countByTenantIdAndStatus(UUID tenantId, String status);

    long countByTenantId(UUID tenantId);

    long countByTenantIdAndChannelAndStatus(UUID tenantId, String channel, String status);

    // FIXED: was hardcoded status = 'SUCCESS' — worker now writes 'SENT' (CQ-002 fix).
    // Changed to 'SENT' so latency metrics actually return data.
    @Query("SELECT AVG(n.providerLatencyMs) FROM NotificationLog n WHERE n.tenantId = :tenantId AND n.status = 'SENT'")
    Double avgLatencyByTenantId(UUID tenantId);

    // FIXED: same — was 'SUCCESS', now 'SENT'
    @Query(value = """
                SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY provider_latency_ms)
                FROM notification_logs
                WHERE tenant_id = :tenantId AND status = 'SENT'
            """, nativeQuery = true)
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