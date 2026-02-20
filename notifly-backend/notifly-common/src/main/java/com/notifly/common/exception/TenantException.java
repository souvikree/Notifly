package com.notifly.common.exception;

/**
 * Thrown when a tenant is not found or tenant context is missing.
 * Maps to HTTP 400 Bad Request or 403 Forbidden.
 */
public class TenantException extends NotiflyException {

    public TenantException(String message) {
        super("TENANT_ERROR", message);
    }

    public TenantException(String message, Throwable cause) {
        super("TENANT_ERROR", message, cause);
    }

    public TenantException(String message, String correlationId) {
        super("TENANT_ERROR", message, correlationId);
    }
}