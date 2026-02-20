package com.notifly.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
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

    private String correlationId;
    private int retryCount;
    private long createdAt;
}
