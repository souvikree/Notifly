package com.notifly.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;
import java.util.List;

/**
 * Template DTO for management operations
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TemplateDTO {
    private UUID id;
    private UUID tenantId;
    private String name;
    private Integer version;
    private String channel;
    private JsonNode content;  // Template JSON structure
    private Boolean active;
    private Instant createdAt;
    private Instant updatedAt;
}
