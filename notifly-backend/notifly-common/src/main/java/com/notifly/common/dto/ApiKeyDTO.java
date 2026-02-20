package com.notifly.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * API key request/response DTO
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApiKeyDTO {
    private UUID id;
    private UUID tenantId;
    private String displayName;
    private String keyPrefix;  // For display only (e.g., "nf_live_abc123def456")
    private String rawKey;  // Only returned on creation
    private String role;  // ADMIN, SERVICE
    private Boolean revoked;
    private String createdAt;
}
