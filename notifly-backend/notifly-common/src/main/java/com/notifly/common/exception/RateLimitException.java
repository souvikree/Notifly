package com.notifly.common.exception;

/**
 * Thrown when a tenant exceeds their configured request rate limit.
 * Maps to HTTP 429 Too Many Requests.
 * Includes retryAfterSeconds for the Retry-After response header.
 */
public class RateLimitException extends NotiflyException {

    private final long retryAfterSeconds;

    public RateLimitException(String message, long retryAfterSeconds) {
        super("RATE_LIMIT_EXCEEDED", message);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public RateLimitException(String message, long retryAfterSeconds, Throwable cause) {
        super("RATE_LIMIT_EXCEEDED", message, cause);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public RateLimitException(String message, long retryAfterSeconds, String correlationId) {
        super("RATE_LIMIT_EXCEEDED", message, correlationId);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}