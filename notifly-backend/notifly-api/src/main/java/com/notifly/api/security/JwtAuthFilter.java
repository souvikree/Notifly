package com.notifly.api.security;

import com.notifly.api.util.JwtUtil;
import com.notifly.common.domain.entity.AdminUser;
import com.notifly.common.domain.repository.AdminUserRepository;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * JWT authentication filter.
 * Validates Bearer tokens and populates the SecurityContext.
 * Sets principal = tenantId (UUID string) for downstream use.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final AdminUserRepository adminUserRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = extractTokenFromRequest(request);

        if (StringUtils.hasText(token)) {
            try {
                if (jwtUtil.validateToken(token)) {
                    String userId = jwtUtil.getUserIdFromToken(token);
                    String tenantId = jwtUtil.getTenantIdFromToken(token);
                    String role = jwtUtil.getRoleFromToken(token);

                    // Verify user still active in DB
                    Optional<AdminUser> userOpt = adminUserRepository.findByIdAndTenantId(
                            UUID.fromString(userId), UUID.fromString(tenantId));

                    if (userOpt.isPresent() && userOpt.get().isActive()) {
                        List<SimpleGrantedAuthority> authorities = List.of(
                                new SimpleGrantedAuthority("ROLE_" + role)
                        );

                        UsernamePasswordAuthenticationToken authentication =
                                new UsernamePasswordAuthenticationToken(tenantId, null, authorities);
                        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                        // Store userId as detail for audit logs
                        SecurityContextHolder.getContext().setAuthentication(authentication);

                        log.debug("JWT auth successful: userId={}, tenantId={}, role={}", userId, tenantId, role);
                    } else {
                        log.warn("JWT token valid but user not found or inactive: userId={}", userId);
                    }
                }
            } catch (Exception e) {
                log.warn("JWT validation failed: {}", e.getMessage());
                // Don't throw - allow ApiKeyFilter or anonymous to handle
            }
        }

        filterChain.doFilter(request, response);
    }

    private String extractTokenFromRequest(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        // Skip if API key header is present (handled by ApiKeyAuthFilter)
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("ApiKey ")) {
            return true;
        }
        return path.startsWith("/api/v1/auth/") ||
               path.startsWith("/actuator/");
    }
}