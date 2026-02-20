package com.notifly.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

/**
 * Notification log DTO for API responses
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationLogDTO {
    private UUID id;
    private UUID tenantId;
    private UUID requestId;
    private String channel;
    private String status;
    private Integer retryAttempt;
    private Long providerLatencyMs;
    private String errorDetails;
    private Instant createdAt;
}
