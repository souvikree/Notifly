package com.notifly.common.domain.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.notifly.common.domain.entity.NotificationLog;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface NotificationLogRepository extends JpaRepository<NotificationLog, UUID> {

    Optional<NotificationLog> findByTenantIdAndRequestIdAndChannelAndRetryAttempt(
            UUID tenantId, UUID requestId, String channel, Integer attempt);

    boolean existsByTenantIdAndRequestIdAndChannelAndStatus(
            UUID tenantId, UUID requestId, String channel, String status);

    Optional<NotificationLog> findByIdAndTenantId(UUID id, UUID tenantId);

    List<NotificationLog> findByTenantIdAndRequestId(UUID tenantId, UUID requestId);

    List<NotificationLog> findByTenantIdAndStatus(UUID tenantId, String status);

    long countByTenantIdAndStatus(UUID tenantId, String status);

    long countByTenantId(UUID tenantId);

    long countByTenantIdAndChannelAndStatus(UUID tenantId, String channel, String status);

    @Query("SELECT AVG(n.providerLatencyMs) FROM NotificationLog n WHERE n.tenantId = :tenantId AND n.status = 'SENT'")
    Double avgLatencyByTenantId(@Param("tenantId") UUID tenantId);

    @Query(value = """
                SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY provider_latency_ms)
                FROM notification_logs
                WHERE tenant_id = :tenantId AND status = 'SENT'
            """, nativeQuery = true)
    Double p99LatencyByTenantId(@Param("tenantId") UUID tenantId);

    /**
     * BUG-005 FIX: Replaced JPQL CAST(n.requestId AS string) with a native query.
     *
     * The JPQL form used "string" as the cast target type — this is a Hibernate
     * internal alias for java.lang.String that is not guaranteed across Hibernate
     * versions and throws SemanticException on some Hibernate 6 / PostgreSQL
     * combinations.
     *
     * Native query uses CAST(request_id AS TEXT), which is standard PostgreSQL.
     * CONCAT('%', :search, '%') replaces the JPQL %:search% syntax, which is
     * not valid in nativeQuery mode.
     *
     * An explicit countQuery is required because Spring Data cannot derive a
     * COUNT from a native SELECT * query. Both queries share identical WHERE
     * clauses so page totals are always consistent with page contents.
     */
    @Query(
        value = """
            SELECT *
            FROM notification_logs
            WHERE tenant_id = :tenantId
              AND (:status  IS NULL OR status  = :status)
              AND (:channel IS NULL OR channel = :channel)
              AND (:search  IS NULL OR CAST(request_id AS TEXT) LIKE CONCAT('%', :search, '%'))
            ORDER BY created_at DESC
            """,
        countQuery = """
            SELECT COUNT(*)
            FROM notification_logs
            WHERE tenant_id = :tenantId
              AND (:status  IS NULL OR status  = :status)
              AND (:channel IS NULL OR channel = :channel)
              AND (:search  IS NULL OR CAST(request_id AS TEXT) LIKE CONCAT('%', :search, '%'))
            """,
        nativeQuery = true
    )
    Page<NotificationLog> findByTenantIdWithFilters(
            @Param("tenantId") UUID    tenantId,
            @Param("status")   String  status,
            @Param("channel")  String  channel,
            @Param("search")   String  search,
            Pageable pageable);

    /**
     * BUG-003 FIX: Daily aggregates for the dashboard time-series chart.
     * Native PostgreSQL — JPQL has no DATE() or FILTER clause.
     *
     * Row layout: [0] day (yyyy-MM-dd), [1] total, [2] success, [3] failed
     */
    @Query(value = """
            SELECT
                DATE(created_at AT TIME ZONE 'UTC')         AS day,
                COUNT(*)                                     AS total,
                COUNT(*) FILTER (WHERE status = 'SENT')     AS success,
                COUNT(*) FILTER (WHERE status = 'FAILED')   AS failed
            FROM notification_logs
            WHERE tenant_id = :tenantId
              AND created_at >= NOW() - CAST(:days || ' days' AS INTERVAL)
            GROUP BY day
            ORDER BY day ASC
            """, nativeQuery = true)
    List<Object[]> getDailyStats(@Param("tenantId") UUID tenantId, @Param("days") int days);
}