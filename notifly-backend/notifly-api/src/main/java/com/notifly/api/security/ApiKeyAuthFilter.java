package com.notifly.api.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.notifly.common.domain.entity.ApiKey;
import com.notifly.common.domain.repository.ApiKeyRepository;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

/**
 * API Key authentication filter.
 * Processes Authorization: ApiKey nf_live_xxxxxxx headers.
 *
 * Key format: nf_live_{prefix}
 * - prefix is stored in DB for fast lookup
 * - full key is bcrypt-compared against stored hash
 *
 * Sets principal = tenantId (UUID string).
 * Sets credentials = apiKeyId (UUID string) for audit.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ApiKeyAuthFilter extends OncePerRequestFilter {

    private static final String API_KEY_PREFIX = "ApiKey ";
    private static final int KEY_PREFIX_LENGTH = 16; // "nf_live_" + 8 chars for prefix lookup

    private final ApiKeyRepository apiKeyRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");

        if (authHeader != null && authHeader.startsWith(API_KEY_PREFIX)) {
            String rawKey = authHeader.substring(API_KEY_PREFIX.length()).trim();

            try {
                authenticateWithApiKey(rawKey, request);
            } catch (Exception e) {
                log.warn("API key authentication failed: {}", e.getMessage());
            }
        }

        filterChain.doFilter(request, response);
    }

    private void authenticateWithApiKey(String rawKey, HttpServletRequest request) {
        // Extract prefix for DB lookup (first KEY_PREFIX_LENGTH chars)
        if (rawKey.length() < KEY_PREFIX_LENGTH) {
            log.warn("API key too short");
            return;
        }

        String keyPrefix = rawKey.substring(0, Math.min(KEY_PREFIX_LENGTH, rawKey.length()));

        Optional<ApiKey> apiKeyOpt = apiKeyRepository.findValidByKeyPrefix(keyPrefix);

        if (apiKeyOpt.isEmpty()) {
            log.warn("API key prefix not found: {}", keyPrefix);
            return;
        }

        ApiKey apiKey = apiKeyOpt.get();

        // Validate via bcrypt
        if (!passwordEncoder.matches(rawKey, apiKey.getKeyHash())) {
            log.warn("API key hash mismatch for prefix: {}", keyPrefix);
            return;
        }

        // Build authorities from ApiKey role
        List<SimpleGrantedAuthority> authorities = List.of(
                new SimpleGrantedAuthority("ROLE_" + apiKey.getRole().name())
        );

        // Principal = tenantId, credentials = apiKey entity (for downstream access)
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(
                        apiKey.getTenantId().toString(),
                        apiKey,
                        authorities
                );

        SecurityContextHolder.getContext().setAuthentication(authentication);

        log.debug("API key auth successful: tenantId={}, role={}", apiKey.getTenantId(), apiKey.getRole());
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return path.startsWith("/api/v1/auth/") || path.startsWith("/actuator/");
    }
}