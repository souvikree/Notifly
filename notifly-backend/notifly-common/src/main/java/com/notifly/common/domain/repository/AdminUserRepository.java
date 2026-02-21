package com.notifly.common.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.notifly.common.domain.entity.AdminUser;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface AdminUserRepository extends JpaRepository<AdminUser, UUID> {

    Optional<AdminUser> findByEmail(String email);

    Optional<AdminUser> findByTenantIdAndEmail(UUID tenantId, String email);

    Optional<AdminUser> findByEmailAndTenantId(String email, UUID tenantId);

    Optional<AdminUser> findByIdAndTenantId(UUID id, UUID tenantId);

    Optional<AdminUser> findByTenantIdAndId(UUID tenantId, UUID id);

    // New: look up Google user by their stable Google sub ID
    Optional<AdminUser> findByGoogleId(String googleId);

    // New: find Google user within a specific tenant
    Optional<AdminUser> findByTenantIdAndGoogleId(UUID tenantId, String googleId);

    boolean existsByTenantIdAndEmail(UUID tenantId, String email);
}