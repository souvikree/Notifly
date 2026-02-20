package com.notifly.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

/**
 * Failed notification DTO (Dead Letter Queue)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FailedNotificationDTO {
    private String requestId;
    private String channel;
    private String recipient;
    private String errorCode;
    private String errorMessage;
    private String errorDetails;
    private Integer retryCount;
    private Instant failedAt;
}
