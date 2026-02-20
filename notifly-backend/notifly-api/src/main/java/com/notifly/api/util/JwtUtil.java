package com.notifly.api.util;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Map;
import java.util.UUID;

/**
 * JWT utility for creating and validating tokens.
 *
 * Token claims:
 *  - sub: userId
 *  - tenant_id: tenantId
 *  - role: ADMIN | SERVICE
 *  - iat / exp: timestamps
 */
@Slf4j
@Component
public class JwtUtil {

    @Value("${notifly.jwt.secret}")
    private String jwtSecret;

    @Value("${notifly.jwt.expiration-ms:86400000}")
    private long jwtExpirationMs; // Default 24h

    @Value("${notifly.jwt.refresh-expiration-ms:604800000}")
    private long refreshExpirationMs; // Default 7 days

    private SecretKey getSigningKey() {
        byte[] keyBytes = jwtSecret.getBytes(StandardCharsets.UTF_8);
        // Pad or truncate to 32 bytes for HMAC-SHA256
        byte[] paddedKey = new byte[32];
        System.arraycopy(keyBytes, 0, paddedKey, 0, Math.min(keyBytes.length, 32));
        return Keys.hmacShaKeyFor(paddedKey);
    }

    /**
     * Generate a JWT access token for an admin user.
     */
    public String generateToken(String userId, String tenantId, String role) {
        return Jwts.builder()
                .subject(userId)
                .claims(Map.of(
                        "tenant_id", tenantId,
                        "role", role,
                        "token_type", "access"
                ))
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + jwtExpirationMs))
                .signWith(getSigningKey(), Jwts.SIG.HS256)
                .compact();
    }

    /**
     * Generate a refresh token (longer-lived, fewer claims).
     */
    public String generateRefreshToken(String userId, String tenantId) {
        return Jwts.builder()
                .subject(userId)
                .claims(Map.of(
                        "tenant_id", tenantId,
                        "token_type", "refresh"
                ))
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + refreshExpirationMs))
                .signWith(getSigningKey(), Jwts.SIG.HS256)
                .compact();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parser()
                    .verifyWith(getSigningKey())
                    .build()
                    .parseSignedClaims(token);
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
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}