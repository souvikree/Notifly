package com.notifly.api.controller;

import com.notifly.api.util.JwtUtil;
import com.notifly.common.domain.entity.AdminUser;
import com.notifly.common.domain.repository.AdminUserRepository;
import com.notifly.common.domain.repository.TenantRepository;
import com.notifly.common.exception.AuthenticationException;
import com.notifly.common.exception.ValidationException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Authentication endpoints - public (no auth required).
 *
 * POST /api/v1/auth/login    - admin user login → JWT tokens
 * POST /api/v1/auth/refresh  - refresh access token
 * POST /api/v1/auth/logout   - invalidate refresh token
 * POST /api/v1/auth/register - create admin user (requires tenant to exist)
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AdminUserRepository adminUserRepository;
    private final TenantRepository tenantRepository;
    private final JwtUtil jwtUtil;
    private final PasswordEncoder passwordEncoder;
    private final RedisTemplate<String, String> redisTemplate;

    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final long LOCKOUT_SECONDS = 900; // 15 minutes
    private static final String REFRESH_TOKEN_PREFIX = "refresh:";
    private static final String LOCKOUT_PREFIX = "lockout:";

    // ──────────────────────────────────────────────────────────────────────────
    // Login
    // ──────────────────────────────────────────────────────────────────────────

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        String lockoutKey = LOCKOUT_PREFIX + request.getEmail();

        // Check lockout
        String attempts = redisTemplate.opsForValue().get(lockoutKey);
        if (attempts != null && Integer.parseInt(attempts) >= MAX_FAILED_ATTEMPTS) {
            throw new AuthenticationException("Account temporarily locked. Try again in 15 minutes.");
        }

        // Find user
        Optional<AdminUser> userOpt = adminUserRepository.findByEmail(request.getEmail());
        if (userOpt.isEmpty() || !passwordEncoder.matches(request.getPassword(), userOpt.get().getPasswordHash())) {
            // Increment failed attempts
            redisTemplate.opsForValue().increment(lockoutKey);
            redisTemplate.expire(lockoutKey, LOCKOUT_SECONDS, TimeUnit.SECONDS);
            throw new AuthenticationException("Invalid email or password");
        }

        AdminUser user = userOpt.get();
        if (!user.isActive()) {
            throw new AuthenticationException("Account is inactive. Contact your administrator.");
        }

        // Clear failed attempts on success
        redisTemplate.delete(lockoutKey);

        // Generate tokens
        String accessToken = jwtUtil.generateToken(user.getId().toString(), user.getTenantId().toString(), user.getRole());
        String refreshToken = jwtUtil.generateRefreshToken(user.getId().toString(), user.getTenantId().toString());

        // Store refresh token in Redis (7 days)
        storeRefreshToken(user.getId(), refreshToken);

        log.info("User logged in: userId={}, tenantId={}", user.getId(), user.getTenantId());

        return ResponseEntity.ok(new LoginResponse(
                accessToken,
                refreshToken,
                86400L, // 24h in seconds
                user.getId().toString(),
                user.getEmail(),
                user.getRole(),
                user.getTenantId().toString()
        ));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Refresh Token
    // ──────────────────────────────────────────────────────────────────────────

    @PostMapping("/refresh")
    public ResponseEntity<Map<String, String>> refresh(@Valid @RequestBody RefreshRequest request) {
        String token = request.getRefreshToken();

        if (!jwtUtil.validateToken(token)) {
            throw new AuthenticationException("Invalid or expired refresh token");
        }

        if (!"refresh".equals(jwtUtil.getTokenType(token))) {
            throw new AuthenticationException("Token is not a refresh token");
        }

        String userId = jwtUtil.getUserIdFromToken(token);
        String tenantId = jwtUtil.getTenantIdFromToken(token);

        // Verify stored token matches
        String storedToken = redisTemplate.opsForValue().get(REFRESH_TOKEN_PREFIX + userId);
        if (!token.equals(storedToken)) {
            throw new AuthenticationException("Refresh token has been revoked");
        }

        AdminUser user = adminUserRepository.findByIdAndTenantId(UUID.fromString(userId), UUID.fromString(tenantId))
                .orElseThrow(() -> new AuthenticationException("User not found"));

        String newAccessToken = jwtUtil.generateToken(userId, tenantId, user.getRole());

        return ResponseEntity.ok(Map.of(
                "accessToken", newAccessToken,
                "expiresIn", "86400"
        ));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Logout
    // ──────────────────────────────────────────────────────────────────────────

    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(@Valid @RequestBody RefreshRequest request) {
        try {
            String userId = jwtUtil.getUserIdFromToken(request.getRefreshToken());
            redisTemplate.delete(REFRESH_TOKEN_PREFIX + userId);
        } catch (Exception e) {
            // Ignore - token may already be invalid
        }
        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Register
    // ──────────────────────────────────────────────────────────────────────────

    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        // Tenant must exist
        if (!tenantRepository.existsById(UUID.fromString(request.getTenantId()))) {
            throw new ValidationException("Tenant not found: " + request.getTenantId());
        }

        // Check duplicate email within tenant
        if (adminUserRepository.findByEmailAndTenantId(
                request.getEmail(), UUID.fromString(request.getTenantId())).isPresent()) {
            throw new ValidationException("Email already registered for this tenant");
        }

        // Validate password strength
        validatePasswordStrength(request.getPassword());

        AdminUser user = AdminUser.builder()
                .tenantId(UUID.fromString(request.getTenantId()))
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .role("ADMIN") // First user gets ADMIN; production: check if tenant has users
                .active(true)
                .build();

        user = adminUserRepository.save(user);
        log.info("New admin user registered: userId={}, tenantId={}", user.getId(), user.getTenantId());

        String accessToken = jwtUtil.generateToken(user.getId().toString(), user.getTenantId().toString(), user.getRole());
        String refreshToken = jwtUtil.generateRefreshToken(user.getId().toString(), user.getTenantId().toString());
        storeRefreshToken(user.getId(), refreshToken);

        return ResponseEntity.status(201).body(new RegisterResponse(
                user.getId().toString(),
                user.getEmail(),
                user.getTenantId().toString(),
                accessToken,
                refreshToken
        ));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private void storeRefreshToken(UUID userId, String refreshToken) {
        redisTemplate.opsForValue().set(
                REFRESH_TOKEN_PREFIX + userId,
                refreshToken,
                7, TimeUnit.DAYS
        );
    }

    private void validatePasswordStrength(String password) {
        if (password.length() < 10) {
            throw new ValidationException("Password must be at least 10 characters");
        }
        if (!password.matches(".*[A-Z].*")) {
            throw new ValidationException("Password must contain at least one uppercase letter");
        }
        if (!password.matches(".*[0-9].*")) {
            throw new ValidationException("Password must contain at least one digit");
        }
        if (!password.matches(".*[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>/?].*")) {
            throw new ValidationException("Password must contain at least one special character");
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Request / Response DTOs (inner classes for simplicity)
    // ──────────────────────────────────────────────────────────────────────────

    @Data
    public static class LoginRequest {
        @NotBlank @Email
        private String email;
        @NotBlank
        private String password;
    }

    @Data
    public static class RefreshRequest {
        @NotBlank
        private String refreshToken;
    }

    @Data
    public static class RegisterRequest {
        @NotBlank
        private String tenantId;
        @NotBlank @Email
        private String email;
        @NotBlank @Size(min = 10)
        private String password;
        @NotBlank
        private String firstName;
        @NotBlank
        private String lastName;
    }

    public record LoginResponse(
            String accessToken,
            String refreshToken,
            long expiresIn,
            String userId,
            String email,
            String role,
            String tenantId
    ) {}

    public record RegisterResponse(
            String userId,
            String email,
            String tenantId,
            String accessToken,
            String refreshToken
    ) {}
}