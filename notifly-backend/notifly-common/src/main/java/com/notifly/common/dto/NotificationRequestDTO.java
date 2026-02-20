package com.notifly.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Request DTO for submitting notifications to NOTIFLY
 * Includes all metadata for routing, retrying, and channel selection
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationRequestDTO {
    @JsonProperty("request_id")
    @Builder.Default
    private String requestId = UUID.randomUUID().toString();

    @JsonProperty("event_type")
    private String eventType;

    @JsonProperty("user_id")
    private String userId;

    @JsonProperty("recipient")
    private Map<String, String> recipient; // {"email": "user@example.com", "phone": "+1234567890"}

    @JsonProperty("channels")
    private List<String> channels; // ["email", "sms", "push"]

    @JsonProperty("template_id")
    private String templateId;

    @JsonProperty("data")
    private Map<String, Object> data; // Template variables

    @JsonProperty("metadata")
    private Map<String, String> metadata; // Custom metadata
}

