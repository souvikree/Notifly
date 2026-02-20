package com.notifly.common.exception;

/**
 * Thrown when an idempotency key is reused with a different payload.
 * Maps to HTTP 409 Conflict.
 */
public class IdempotencyException extends NotiflyException {

    public IdempotencyException(String message) {
        super("IDEMPOTENCY_ERROR", message);
    }

    public IdempotencyException(String message, Throwable cause) {
        super("IDEMPOTENCY_ERROR", message, cause);
    }

    public IdempotencyException(String message, String correlationId) {
        super("IDEMPOTENCY_ERROR", message, correlationId);
    }
}