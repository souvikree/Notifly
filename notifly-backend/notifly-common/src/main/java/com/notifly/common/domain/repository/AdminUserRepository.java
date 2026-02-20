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

    Optional<AdminUser> findByTenantIdAndId(UUID tenantId, UUID id);

    Optional<AdminUser> findByIdAndTenantId(UUID fromString, UUID fromString2);

    Optional<AdminUser> findByEmailAndTenantId(String email, UUID fromString);
}
