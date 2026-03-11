package com.notifly.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KafkaNotificationEvent {

    private UUID requestId;
    private UUID tenantId;

    private String userId;
    private String eventType;
    private String recipient;
    private String subject;
    private String content;

    private List<String> channels;

    // ADDED: Template variable substitution map.
    // Used by NotificationProcessorService.renderTemplate() to replace {{key}} tokens
    // in notification templates. Example: {"userName": "Alice", "orderId": "12345"}
    // Callers populate this when submitting a notification via the API.
    private Map<String, Object> payload;

    private String correlationId;
    private int retryCount;
    private long createdAt;
}