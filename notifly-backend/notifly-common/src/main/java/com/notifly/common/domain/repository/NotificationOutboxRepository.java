package com.notifly.common.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.notifly.common.domain.entity.NotificationOutbox;

import java.util.List;
import java.util.UUID;

@Repository
public interface NotificationOutboxRepository extends JpaRepository<NotificationOutbox, UUID> {

    // Used by OutboxPublisher.publishPendingEvents() — fetch next batch to publish
    @Query("SELECT no FROM NotificationOutbox no WHERE no.status = ?1 ORDER BY no.createdAt ASC LIMIT ?2")
    List<NotificationOutbox> findPending(NotificationOutbox.OutboxStatus status, int limit);

    // Used by OutboxPublisher.publishPendingEvents() — per-tenant variant
    @Query("SELECT no FROM NotificationOutbox no WHERE no.tenantId = ?1 AND no.status = ?2 ORDER BY no.createdAt ASC LIMIT ?3")
    List<NotificationOutbox> findPendingByTenantId(UUID tenantId, NotificationOutbox.OutboxStatus status, int limit);

    // ADDED: Used by OutboxPublisher.recoverFailedEvents()
    // Finds FAILED entries whose retryCount is still below the max — worth retrying.
    // Entries at or above maxRetryCount are permanently failed and left alone.
    @Query("SELECT no FROM NotificationOutbox no WHERE no.status = ?1 AND no.retryCount < ?2 ORDER BY no.createdAt ASC LIMIT ?3")
    List<NotificationOutbox> findFailedForRecovery(NotificationOutbox.OutboxStatus status, int maxRetryCount, int limit);
}