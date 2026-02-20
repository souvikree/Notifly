package com.notifly.common.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.notifly.common.domain.entity.NotificationOutbox;

import java.util.List;
import java.util.UUID;

@Repository
public interface NotificationOutboxRepository extends JpaRepository<NotificationOutbox, UUID> {

    @Query("SELECT no FROM NotificationOutbox no WHERE no.tenantId = ?1 AND no.status = ?2 ORDER BY no.createdAt ASC LIMIT ?3")
    List<NotificationOutbox> findPendingByTenantId(UUID tenantId, NotificationOutbox.OutboxStatus status, int limit);

    @Query("SELECT no FROM NotificationOutbox no WHERE no.status = ?1 ORDER BY no.createdAt ASC LIMIT ?2")
    List<NotificationOutbox> findPending(NotificationOutbox.OutboxStatus status, int limit);
}
