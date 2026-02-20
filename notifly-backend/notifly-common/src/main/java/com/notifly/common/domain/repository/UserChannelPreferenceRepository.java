package com.notifly.common.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.notifly.common.domain.entity.UserChannelPreference;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserChannelPreferenceRepository extends JpaRepository<UserChannelPreference, UUID> {
    Optional<UserChannelPreference> findByTenantIdAndUserIdAndChannel(
        UUID tenantId, String userId, String channel);
}
