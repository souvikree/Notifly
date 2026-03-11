package com.notifly.common.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.notifly.common.domain.entity.Tenant;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface TenantRepository extends JpaRepository<Tenant, UUID> {

    // Used during registration to check workspace slug uniqueness
    boolean existsBySlug(String slug);

    // Used during Google onboarding completion
    Optional<Tenant> findBySlug(String slug);
}