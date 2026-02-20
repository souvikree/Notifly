package com.notifly.worker.service.sender;

/**
 * Result of sending notification via channel
 */
public class SendResult {
    private final boolean success;
    private final long latencyMs;
    private final String errorCode;
    private final String errorMessage;

    private SendResult(boolean success, long latencyMs, String errorCode, String errorMessage) {
        this.success = success;
        this.latencyMs = latencyMs;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }

    public static SendResult success(long latencyMs) {
        return new SendResult(true, latencyMs, null, null);
    }

    public static SendResult failed(String errorCode, String errorMessage) {
        return new SendResult(false, 0, errorCode, errorMessage);
    }

    public boolean isSuccess() { return success; }
    public long getLatencyMs() { return latencyMs; }
    public String getErrorCode() { return errorCode; }
    public String getErrorMessage() { return errorMessage; }
}
