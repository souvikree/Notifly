package com.notifly.common.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.notifly.common.domain.entity.NotificationTemplate;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface NotificationTemplateRepository extends JpaRepository<NotificationTemplate, UUID> {

    List<NotificationTemplate> findByTenantIdAndNameAndIsActive(UUID tenantId, String name, Boolean isActive);

    Optional<NotificationTemplate> findByTenantIdAndNameAndVersionAndChannel(
            UUID tenantId, String name, Integer version, String channel);

    List<NotificationTemplate> findByTenantIdAndChannel(UUID tenantId, String channel);

    Optional<NotificationTemplate> findByIdAndTenantId(UUID id, UUID tenantId);

    void deleteByIdAndTenantId(UUID id, UUID tenantId);

    Optional<NotificationTemplate> findFirstByTenantIdAndChannelAndIsActiveTrue(UUID tenantId, String channel);

    @Query("SELECT MAX(t.version) FROM NotificationTemplate t WHERE t.tenantId = :tenantId AND t.name = :name")
    Optional<Integer> findMaxVersionByTenantIdAndName(UUID tenantId, String name);

    @Query("""
                SELECT t FROM NotificationTemplate t
                WHERE t.tenantId = :tenantId
                AND (:channel IS NULL OR t.channel = :channel)
                AND (:active IS NULL OR t.isActive = :active)
            """)
    List<NotificationTemplate> findByTenantIdWithFilters(
            @Param("tenantId") UUID tenantId,
            @Param("channel") String channel,
            @Param("active") Boolean active);

    /**
     * CQ-005: Fetch all versions of a template by name within a tenant.
     * Used by AdminController.getTemplateVersions() to power the version
     * history tab in the template editor UI.
     *
     * Returns all rows for the given tenant + name, ordered oldest → newest
     * so the frontend can display a chronological history list.
     */
    @Query("""
                SELECT t FROM NotificationTemplate t
                WHERE t.tenantId = :tenantId
                  AND t.name     = :name
                ORDER BY t.version ASC
            """)
    List<NotificationTemplate> findAllByTenantIdAndName(
            @Param("tenantId") UUID tenantId,
            @Param("name")     String name);
}