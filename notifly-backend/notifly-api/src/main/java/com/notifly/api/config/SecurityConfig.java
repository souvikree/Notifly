package com.notifly.api.config;

import com.notifly.api.security.ApiKeyAuthFilter;
import com.notifly.api.security.JwtAuthFilter;
import com.notifly.api.security.TenantFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

/**
 * Spring Security configuration for Notifly API.
 *
 * FIXES from original:
 *  1. CORS was using allowedOriginPatterns("*") with allowCredentials(true).
 *     This is dangerous — any origin can make credentialed cross-site requests.
 *     Now reads allowed origins from ALLOWED_ORIGINS env var.
 *  2. Added proper 401/403 JSON response handlers for API clients.
 *
 * INF-001 FIX — Prometheus auth:
 *  The previous config had .requestMatchers("/actuator/prometheus").hasRole("ADMIN")
 *  but prometheus.yml scraped with no credentials → every scrape returned 401
 *  → Grafana showed no data.
 *
 *  Fix: Actuator endpoints (including /actuator/prometheus) are moved to a
 *  separate management port (9091) defined in application.yml. Spring Boot's
 *  management server runs on its own embedded Tomcat instance that is completely
 *  separate from this SecurityFilterChain. SecurityFilterChain only applies to
 *  the main port (8080) — the management port has no security filter chain,
 *  so Prometheus can scrape freely.
 *
 *  Port 9091 must NOT be exposed outside the Docker network (no ports: mapping
 *  in docker-compose.yml for it). Prometheus reaches it via the internal network.
 *
 *  Result: /actuator/prometheus on port 9091 → open to Prometheus (internal only)
 *          /actuator/* on port 8080          → these paths no longer exist
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final TenantFilter tenantFilter;

    @Value("${notifly.cors.allowed-origins:http://localhost:3000}")
    private String allowedOriginsConfig;

    /**
     * Public endpoints on the main port (8080).
     * Actuator endpoints are NOT listed here — they live on port 9091 only.
     */
    private static final String[] PUBLIC_URLS = {
        "/api/v1/auth/**"
        // /actuator/** intentionally omitted — served on management port 9091,
        // not reachable through this filter chain at all.
    };

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, ApiKeyAuthFilter apiKeyAuthFilter) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((request, response, authException) -> {
                    response.setContentType("application/json");
                    response.setStatus(401);
                    response.getWriter().write(
                        "{\"status\":401,\"error\":\"Unauthorized\",\"message\":\"Authentication required\"}"
                    );
                })
                .accessDeniedHandler((request, response, accessDeniedException) -> {
                    response.setContentType("application/json");
                    response.setStatus(403);
                    response.getWriter().write(
                        "{\"status\":403,\"error\":\"Forbidden\",\"message\":\"Insufficient permissions\"}"
                    );
                })
            )
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(PUBLIC_URLS).permitAll()
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/v1/notifications").hasAnyRole("ADMIN", "SERVICE")
                .requestMatchers(HttpMethod.GET,  "/api/v1/notifications/**").hasAnyRole("ADMIN", "SERVICE")
                // INF-001: No actuator rules here — actuator is on port 9091, not 8080.
                // Any request that somehow reaches /actuator on port 8080 is blocked
                // by the catch-all below (authenticated() → 401 for unauthenticated).
                .anyRequest().authenticated()
            )
            .addFilterBefore(apiKeyAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(jwtAuthFilter, ApiKeyAuthFilter.class)
            .addFilterAfter(tenantFilter, JwtAuthFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    /**
     * CORS — reads allowed origins from env, never uses wildcard with credentials.
     *
     * Set ALLOWED_ORIGINS env var as comma-separated list:
     *   ALLOWED_ORIGINS=http://localhost:3000,https://app.yourdomain.com
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        List<String> allowedOrigins = Arrays.asList(allowedOriginsConfig.split(","));
        config.setAllowedOrigins(allowedOrigins);

        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        config.setAllowedHeaders(List.of(
            "Authorization", "Content-Type", "X-Correlation-ID",
            "Idempotency-Key", "X-API-Key", "X-Tenant-ID"
        ));
        config.setExposedHeaders(List.of("X-Correlation-ID", "Retry-After"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}