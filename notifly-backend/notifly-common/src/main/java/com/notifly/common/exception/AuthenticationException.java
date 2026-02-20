package com.notifly.common.exception;

/**
 * Thrown when request authentication fails (JWT/API Key invalid or expired).
 * Maps to HTTP 401 Unauthorized.
 *
 * FIXED: Removed HttpStatus import (spring-web not in common module).
 * HTTP status is handled by GlobalExceptionHandler in notifly-api.
 */
public class AuthenticationException extends NotiflyException {

    public AuthenticationException(String message) {
        super("AUTHENTICATION_FAILED", message);
    }

    public AuthenticationException(String message, Throwable cause) {
        super("AUTHENTICATION_FAILED", message, cause);
    }

    public AuthenticationException(String message, String correlationId) {
        super("AUTHENTICATION_FAILED", message, correlationId);
    }
}