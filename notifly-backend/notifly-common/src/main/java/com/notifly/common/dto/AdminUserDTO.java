package com.notifly.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

/**
 * Admin user DTO for authentication and management
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminUserDTO {
    private UUID id;
    private UUID tenantId;
    private String email;
    private String role;  // ADMIN, SERVICE
    private Instant createdAt;
    private Instant updatedAt;
}
