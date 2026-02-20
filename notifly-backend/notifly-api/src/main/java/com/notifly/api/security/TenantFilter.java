package com.notifly.api.security;

import com.notifly.common.context.CorrelationIdContext;
import com.notifly.common.context.TenantContext;
import com.notifly.common.domain.entity.ApiKey;
import com.notifly.common.domain.repository.ApiKeyRepository;

import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.mindrot.jbcrypt.BCrypt;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Slf4j
@Component
public class TenantFilter extends OncePerRequestFilter {

    private final ApiKeyRepository apiKeyRepository;

    @Value("${notifly.jwt.secret}")
    private String jwtSecret;

    public TenantFilter(ApiKeyRepository apiKeyRepository) {
        this.apiKeyRepository = apiKeyRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        try {
            // Generate/set correlation ID
            String correlationId = request.getHeader("X-Correlation-ID");
            if (correlationId == null || correlationId.isEmpty()) {
                correlationId = CorrelationIdContext.generateCorrelationId();
            }
            CorrelationIdContext.setCorrelationId(correlationId);

            // Extract tenant from JWT or API Key
            String authorization = request.getHeader("Authorization");
            UUID tenantId = null;

            if (authorization != null && authorization.startsWith("Bearer ")) {
                // JWT authentication
                String token = authorization.substring(7);
                tenantId = extractTenantFromJWT(token);
            } else if (authorization != null && authorization.startsWith("ApiKey ")) {
                // API Key authentication
                String apiKeyHeader = authorization.substring(7);
                tenantId = extractTenantFromApiKey(apiKeyHeader);
            }

            if (tenantId != null) {
                TenantContext.setTenantId(tenantId);
            }

            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
            CorrelationIdContext.clear();
        }
    }

    private UUID extractTenantFromJWT(String token) {
        try {
            var claims = Jwts.parser()
                    .verifyWith(new javax.crypto.spec.SecretKeySpec(jwtSecret.getBytes(), 0, jwtSecret.getBytes().length, "HmacSHA256"))
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            String tenantIdStr = (String) claims.get("tenant_id");
            if (tenantIdStr != null) {
                return UUID.fromString(tenantIdStr);
            }
        } catch (JwtException e) {
            log.warn("Invalid JWT token: {}", e.getMessage());
        }
        return null;
    }

    private UUID extractTenantFromApiKey(String apiKeyHeader) {
        try {
            // API key format: nf_live_<key_prefix_hash>
            ApiKey apiKey = apiKeyRepository.findValidByKeyPrefix(apiKeyHeader).orElse(null);
            if (apiKey != null && BCrypt.checkpw(apiKeyHeader, apiKey.getKeyHash())) {
                return apiKey.getTenantId();
            }
        } catch (Exception e) {
            log.warn("Failed to extract tenant from API key: {}", e.getMessage());
        }
        return null;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) throws ServletException {
        String path = request.getRequestURI();
        return path.startsWith("/api/health") || path.startsWith("/api/metrics") || path.startsWith("/api/prometheus");
    }
}
