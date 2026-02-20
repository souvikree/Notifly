package com.notifly.common.exception;

/**
 * Base exception for all Notifly exceptions.
 *
 * FIXED:
 *  - Removed org.springframework.http.HttpStatus import (spring-web not in common module)
 *  - Added 2-arg constructor (errorCode, message) used by all child exceptions
 *  - Added 3-arg (errorCode, message, cause) for wrapping root causes
 *  - Kept correlationId as optional field for tracing
 */
public class NotiflyException extends RuntimeException {

    private final String errorCode;
    private final String correlationId;

    // ── 2-arg: used by ValidationException, TenantException, IdempotencyException, etc.
    public NotiflyException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
        this.correlationId = null;
    }

    // ── 3-arg with cause: for wrapping lower-level exceptions
    public NotiflyException(String errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
        this.correlationId = null;
    }

    // ── 3-arg with correlationId: used by child exceptions that pass a trace ID
    public NotiflyException(String errorCode, String message, String correlationId) {
        super(message);
        this.errorCode = errorCode;
        this.correlationId = correlationId;
    }

    // ── 4-arg: full constructor
    public NotiflyException(String errorCode, String message, String correlationId, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
        this.correlationId = correlationId;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public String getCorrelationId() {
        return correlationId;
    }
}