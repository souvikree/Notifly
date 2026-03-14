package com.notifly.api.exception;

import com.notifly.common.context.CorrelationIdContext;
import com.notifly.common.error.ErrorResponse;
import com.notifly.common.error.StandardErrorCode;
import com.notifly.common.exception.AuthenticationException;
import com.notifly.common.exception.IdempotencyException;
import com.notifly.common.exception.NotiflyException;
import com.notifly.common.exception.RateLimitException;
import com.notifly.common.exception.TenantException;
import com.notifly.common.exception.ValidationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import jakarta.servlet.http.HttpServletRequest;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(RateLimitException.class)
    public ResponseEntity<ErrorResponse> handleRateLimitException(
            RateLimitException ex, HttpServletRequest request) {
        String correlationId = CorrelationIdContext.getCorrelationId();
        return ResponseEntity
                .status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
                .body(ErrorResponse.of(
                        HttpStatus.TOO_MANY_REQUESTS.value(),
                        StandardErrorCode.RATE_LIMIT_EXCEEDED.getCode(),
                        ex.getMessage(), correlationId, request.getRequestURI()));
    }

    @ExceptionHandler(IdempotencyException.class)
    public ResponseEntity<ErrorResponse> handleIdempotencyException(
            IdempotencyException ex, HttpServletRequest request) {
        String correlationId = CorrelationIdContext.getCorrelationId();
        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(ErrorResponse.of(
                        HttpStatus.CONFLICT.value(),
                        StandardErrorCode.IDEMPOTENCY_CONFLICT.getCode(),
                        ex.getMessage(), correlationId, request.getRequestURI()));
    }

    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(
            ValidationException ex, HttpServletRequest request) {
        String correlationId = CorrelationIdContext.getCorrelationId();
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(
                        HttpStatus.BAD_REQUEST.value(),
                        StandardErrorCode.INVALID_REQUEST.getCode(),
                        ex.getMessage(), correlationId, request.getRequestURI()));
    }

    /**
     * ADDED: AuthenticationException was previously caught by the generic
     * NotiflyException handler which returned 500. Auth failures (bad credentials,
     * expired tokens, invalid Google tokens) should return 401, not 500.
     */
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ErrorResponse> handleAuthenticationException(
            AuthenticationException ex, HttpServletRequest request) {
        String correlationId = CorrelationIdContext.getCorrelationId();
        log.warn("[{}] Authentication failed: {}", correlationId, ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
                .body(ErrorResponse.of(
                        HttpStatus.UNAUTHORIZED.value(),
                        "AUTHENTICATION_FAILED",
                        ex.getMessage(), correlationId, request.getRequestURI()));
    }

    /**
     * ADDED: TenantException was previously caught by the generic NotiflyException
     * handler which returned 500. Missing tenant context is a client-side problem
     * (bad token, no auth header) so it should return 400.
     */
    @ExceptionHandler(TenantException.class)
    public ResponseEntity<ErrorResponse> handleTenantException(
            TenantException ex, HttpServletRequest request) {
        String correlationId = CorrelationIdContext.getCorrelationId();
        log.warn("[{}] Tenant context error: {}", correlationId, ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(
                        HttpStatus.BAD_REQUEST.value(),
                        "TENANT_ERROR",
                        ex.getMessage(), correlationId, request.getRequestURI()));
    }

    @ExceptionHandler(NotiflyException.class)
    public ResponseEntity<ErrorResponse> handleNotiflyException(
            NotiflyException ex, HttpServletRequest request) {
        String correlationId = CorrelationIdContext.getCorrelationId();
        log.error("[{}] Notifly exception: {}", correlationId, ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.of(
                        HttpStatus.INTERNAL_SERVER_ERROR.value(),
                        ex.getErrorCode(),
                        ex.getMessage(), correlationId, request.getRequestURI()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(
            Exception ex, HttpServletRequest request) {
        String correlationId = CorrelationIdContext.getCorrelationId();
        log.error("[{}] Unexpected exception", correlationId, ex);
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.of(
                        HttpStatus.INTERNAL_SERVER_ERROR.value(),
                        StandardErrorCode.INTERNAL_ERROR.getCode(),
                        "Internal server error", correlationId, request.getRequestURI()));
    }
}