package com.notifly.api.util;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Map;

/**
 * JWT utility for creating and validating tokens.
 *
 * FIXES from original:
 *  1. getSigningKey() was called on every operation and recreated the key each time.
 *     Now cached as a field, initialized once at startup via @PostConstruct.
 *  2. Short secrets were silently padded with zeros — predictable in adversarial scenarios.
 *     Now throws at startup if secret < 32 chars (fails fast, not silently insecure).
 *  3. Added token_type validation to prevent access tokens from being used as refresh tokens.
 */
@Slf4j
@Component
public class JwtUtil {

    @Value("${notifly.jwt.secret}")
    private String jwtSecret;

    @Value("${notifly.jwt.expiration-ms:86400000}")
    private long jwtExpirationMs;

    @Value("${notifly.jwt.refresh-expiration-ms:604800000}")
    private long refreshExpirationMs;

    // FIXED: Cached, not recreated on every call
    private SecretKey signingKey;

    /**
     * FIXED: Validates secret length at startup.
     * Original silently padded short keys with zeros — a security vulnerability.
     * Application now fails fast at startup with a clear error message.
     */
    @PostConstruct
    public void init() {
        if (jwtSecret == null || jwtSecret.length() < 32) {
            throw new IllegalStateException(
                "JWT_SECRET must be at least 32 characters. Current length: "
                + (jwtSecret == null ? 0 : jwtSecret.length())
                + ". Generate one with: openssl rand -base64 48"
            );
        }
        // FIXED: Key is created once and cached — consistent across all calls
        this.signingKey = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
        log.info("JwtUtil initialized with key length: {} chars", jwtSecret.length());
    }

    /**
     * Generate a JWT access token for an admin user.
     */
    public String generateToken(String userId, String tenantId, String role) {
        return Jwts.builder()
                .subject(userId)
                .claims(Map.of(
                        "tenant_id",  tenantId,
                        "role",       role,
                        "token_type", "access"
                ))
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + jwtExpirationMs))
                .signWith(signingKey, Jwts.SIG.HS256)
                .compact();
    }

    /**
     * Generate a refresh token (longer-lived, fewer claims).
     */
    public String generateRefreshToken(String userId, String tenantId) {
        return Jwts.builder()
                .subject(userId)
                .claims(Map.of(
                        "tenant_id",  tenantId,
                        "token_type", "refresh"
                ))
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + refreshExpirationMs))
                .signWith(signingKey, Jwts.SIG.HS256)
                .compact();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parser().verifyWith(signingKey).build().parseSignedClaims(token);
            return true;
        } catch (ExpiredJwtException e) {
            log.debug("JWT expired: {}", e.getMessage());
        } catch (MalformedJwtException e) {
            log.warn("Malformed JWT: {}", e.getMessage());
        } catch (JwtException e) {
            log.warn("JWT validation error: {}", e.getMessage());
        }
        return false;
    }

    public String getUserIdFromToken(String token) {
        return parseClaims(token).getSubject();
    }

    public String getTenantIdFromToken(String token) {
        return (String) parseClaims(token).get("tenant_id");
    }

    public String getRoleFromToken(String token) {
        return (String) parseClaims(token).get("role");
    }

    public String getTokenType(String token) {
        return (String) parseClaims(token).get("token_type");
    }

    public Date getExpirationFromToken(String token) {
        return parseClaims(token).getExpiration();
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
