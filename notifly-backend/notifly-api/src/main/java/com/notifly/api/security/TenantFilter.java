package com.notifly.api.security;

import com.notifly.common.context.CorrelationIdContext;
import com.notifly.common.context.TenantContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * TenantFilter runs AFTER JwtAuthFilter and ApiKeyAuthFilter have set Authentication.
 * Its job is to:
 *   1. Set/propagate X-Correlation-ID header
 *   2. Extract tenantId from the already-authenticated principal and put it in TenantContext
 *      so downstream services can call TenantContext.getTenantId() safely
 *
 * NOTE: This filter no longer does its own JWT/ApiKey verification —
 * that is handled by JwtAuthFilter and ApiKeyAuthFilter respectively.
 *
 * BUG-006 FIX: Removed dead @Value("${notifly.jwt.secret}") / jwtSecret field.
 * TenantFilter has not used the JWT secret since verification was moved to
 * JwtAuthFilter. Keeping it created a spurious startup dependency on the
 * JWT_SECRET env var and would cause a startup failure if the binding changed.
 * Also removed the now-unused io.jsonwebtoken and @Value imports.
 */
@Slf4j
@Component
public class TenantFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {
        try {
            // 1. Correlation ID — propagate from caller or generate fresh
            String correlationId = request.getHeader("X-Correlation-ID");
            if (correlationId == null || correlationId.isBlank()) {
                correlationId = CorrelationIdContext.generateCorrelationId();
            }
            CorrelationIdContext.setCorrelationId(correlationId);
            response.setHeader("X-Correlation-ID", correlationId);

            // 2. Extract tenantId from already-authenticated principal.
            //    JwtAuthFilter sets principal = tenantId (string).
            //    ApiKeyAuthFilter also sets principal = tenantId (string).
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.getPrincipal() instanceof String tenantIdStr) {
                try {
                    TenantContext.setTenantId(UUID.fromString(tenantIdStr));
                } catch (IllegalArgumentException e) {
                    log.warn("Principal is not a valid UUID: {}", tenantIdStr);
                }
            }

            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
            CorrelationIdContext.clear();
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/api/v1/auth/")
            || path.startsWith("/actuator/");
    }
}