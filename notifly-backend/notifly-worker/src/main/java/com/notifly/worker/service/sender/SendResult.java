package com.notifly.worker.service.sender;

import lombok.Getter;

/**
 * Result of a channel send attempt.
 *
 * ADDED: permanentFailure type — for cases like invalid email/phone where
 * retrying will never help. The listener can use this to skip retry topics
 * and go directly to DLQ, saving time and reducing noise in retry logs.
 */
@Getter
public class SendResult {

    public enum ResultType {
        SUCCESS,
        TRANSIENT_FAILURE,   // Network error, provider overloaded — worth retrying
        PERMANENT_FAILURE    // Invalid recipient, bounced — retrying will not help
    }

    private final ResultType type;
    private final long latencyMs;
    private final String errorCode;
    private final String errorMessage;

    private SendResult(ResultType type, long latencyMs, String errorCode, String errorMessage) {
        this.type = type;
        this.latencyMs = latencyMs;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }

    public static SendResult success(long latencyMs) {
        return new SendResult(ResultType.SUCCESS, latencyMs, null, null);
    }

    /** Transient failure — worth retrying (network error, 5xx from provider). */
    public static SendResult failed(String errorCode, String errorMessage) {
        return new SendResult(ResultType.TRANSIENT_FAILURE, 0, errorCode, errorMessage);
    }

    /** Permanent failure — skip retries, go straight to DLQ (invalid recipient, 4xx). */
    public static SendResult permanentFailure(String errorCode, String errorMessage) {
        return new SendResult(ResultType.PERMANENT_FAILURE, 0, errorCode, errorMessage);
    }

    public boolean isSuccess() {
        return type == ResultType.SUCCESS;
    }

    public boolean isPermanentFailure() {
        return type == ResultType.PERMANENT_FAILURE;
    }

    public boolean isTransientFailure() {
        return type == ResultType.TRANSIENT_FAILURE;
    }
}
