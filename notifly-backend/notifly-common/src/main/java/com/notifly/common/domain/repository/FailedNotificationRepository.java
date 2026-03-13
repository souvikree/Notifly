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

    /**
     * BUG-005 FIX: Replaced JPQL CAST(f.requestId AS string) with a native query.
     *
     * Same root cause as NotificationLogRepository.findByTenantIdWithFilters —
     * "string" is a non-standard Hibernate type alias that throws SemanticException
     * on some Hibernate 6 / PostgreSQL combinations.
     *
     * Native query uses CAST(request_id AS TEXT) (standard PostgreSQL).
     * CONCAT('%', :search, '%') replaces the JPQL %:search% syntax.
     *
     * The explicit countQuery is required: Spring Data cannot auto-derive a
     * COUNT from a native SELECT * query. Both queries share identical WHERE
     * clauses so totals are always consistent with page contents.
     *
     * Used by AdminController.retryBatchFromDlq(). All filter params are
     * optional — passing null matches all rows for that filter.
     */
    @Query(
        value = """
            SELECT *
            FROM failed_notifications
            WHERE tenant_id = :tenantId
              AND (:channel   IS NULL OR channel    = :channel)
              AND (:errorCode IS NULL OR error_code = :errorCode)
              AND (:search    IS NULL OR CAST(request_id AS TEXT) LIKE CONCAT('%', :search, '%'))
            ORDER BY created_at ASC
            """,
        countQuery = """
            SELECT COUNT(*)
            FROM failed_notifications
            WHERE tenant_id = :tenantId
              AND (:channel   IS NULL OR channel    = :channel)
              AND (:errorCode IS NULL OR error_code = :errorCode)
              AND (:search    IS NULL OR CAST(request_id AS TEXT) LIKE CONCAT('%', :search, '%'))
            """,
        nativeQuery = true
    )
    List<FailedNotification> findByTenantIdWithFilters(
            @Param("tenantId")  UUID   tenantId,
            @Param("channel")   String channel,
            @Param("errorCode") String errorCode,
            @Param("search")    String search,
            Pageable pageable);
}