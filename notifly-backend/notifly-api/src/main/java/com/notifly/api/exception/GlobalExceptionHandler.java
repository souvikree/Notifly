package com.notifly.api.exception;

import com.notifly.common.context.CorrelationIdContext;
import com.notifly.common.error.ErrorResponse;
import com.notifly.common.error.StandardErrorCode;
import com.notifly.common.exception.IdempotencyException;
import com.notifly.common.exception.NotiflyException;
import com.notifly.common.exception.RateLimitException;
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
            RateLimitException ex,
            HttpServletRequest request) {
        String correlationId = CorrelationIdContext.getCorrelationId();
        
        ErrorResponse errorResponse = ErrorResponse.of(
                HttpStatus.TOO_MANY_REQUESTS.value(),
                StandardErrorCode.RATE_LIMIT_EXCEEDED.getCode(),
                ex.getMessage(),
                correlationId,
                request.getRequestURI()
        );

        return ResponseEntity
                .status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
                .body(errorResponse);
    }

    @ExceptionHandler(IdempotencyException.class)
    public ResponseEntity<ErrorResponse> handleIdempotencyException(
            IdempotencyException ex,
            HttpServletRequest request) {
        String correlationId = CorrelationIdContext.getCorrelationId();
        
        ErrorResponse errorResponse = ErrorResponse.of(
                HttpStatus.CONFLICT.value(),
                StandardErrorCode.IDEMPOTENCY_CONFLICT.getCode(),
                ex.getMessage(),
                correlationId,
                request.getRequestURI()
        );

        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(errorResponse);
    }

    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(
            ValidationException ex,
            HttpServletRequest request) {
        String correlationId = CorrelationIdContext.getCorrelationId();
        
        ErrorResponse errorResponse = ErrorResponse.of(
                HttpStatus.BAD_REQUEST.value(),
                StandardErrorCode.INVALID_REQUEST.getCode(),
                ex.getMessage(),
                correlationId,
                request.getRequestURI()
        );

        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(errorResponse);
    }

    @ExceptionHandler(NotiflyException.class)
    public ResponseEntity<ErrorResponse> handleNotiflyException(
            NotiflyException ex,
            HttpServletRequest request) {
        String correlationId = CorrelationIdContext.getCorrelationId();
        
        ErrorResponse errorResponse = ErrorResponse.of(
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                ex.getErrorCode(),
                ex.getMessage(),
                correlationId,
                request.getRequestURI()
        );

        log.error("[{}] Notifly exception: {}", correlationId, ex.getMessage());

        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(errorResponse);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(
            Exception ex,
            HttpServletRequest request) {
        String correlationId = CorrelationIdContext.getCorrelationId();
        
        ErrorResponse errorResponse = ErrorResponse.of(
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                StandardErrorCode.INTERNAL_ERROR.getCode(),
                "Internal server error",
                correlationId,
                request.getRequestURI()
        );

        log.error("[{}] Unexpected exception", correlationId, ex);

        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(errorResponse);
    }
}
