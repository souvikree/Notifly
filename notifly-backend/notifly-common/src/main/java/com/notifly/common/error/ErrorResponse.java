package com.notifly.common.error;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ErrorResponse {
    private Instant timestamp;
    private int status;
    @JsonProperty("errorCode")
    private String errorCode;
    private String message;
    @JsonProperty("correlationId")
    private String correlationId;
    private String path;

    public static ErrorResponse of(int status, String errorCode, String message, String correlationId, String path) {
        return ErrorResponse.builder()
                .timestamp(Instant.now())
                .status(status)
                .errorCode(errorCode)
                .message(message)
                .correlationId(correlationId)
                .path(path)
                .build();
    }
}
