package com.notifly.common.exception;

/**
 * Thrown when request validation fails (missing/invalid fields).
 * Maps to HTTP 400 Bad Request.
 */
public class ValidationException extends NotiflyException {

    public ValidationException(String message) {
        super("VALIDATION_ERROR", message);
    }

    public ValidationException(String message, Throwable cause) {
        super("VALIDATION_ERROR", message, cause);
    }

    public ValidationException(String message, String correlationId) {
        super("VALIDATION_ERROR", message, correlationId);
    }
}