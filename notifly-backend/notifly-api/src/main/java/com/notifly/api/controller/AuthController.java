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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

// Google ID token verification
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import java.util.Collections;

/**
 * Authentication endpoints — supports BOTH email/password AND Google OAuth.
 *
 * POST /api/v1/auth/login         — email + password login
 * POST /api/v1/auth/google        — Google ID token login / register
 * POST /api/v1/auth/register      — email + password registration
 * POST /api/v1/auth/refresh       — refresh access token
 * POST /api/v1/auth/logout        — invalidate refresh token
 * POST /api/v1/auth/forgot-password — send reset link
 *
 * Flow for Google:
 *   1. Frontend gets a Google ID token from @react-oauth/google
 *   2. Frontend sends that token to POST /auth/google
 *   3. Backend verifies it with Google's servers (no fake tokens accepted)
 *   4. Backend finds-or-creates the AdminUser
 *   5. Returns same JWT tokens as email login
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

    @Value("${google.client-id}")
    private String googleClientId;

    // ── For Google-only signups we need a default tenant ──────────────────────
    // In production you'd have a tenant selection step or a "personal" tenant.
    // For now, we create one if it doesn't exist, keyed by the user's email domain.
    @Value("${notifly.default-tenant-id:}")
    private String defaultTenantId;

    private static final int  MAX_FAILED_ATTEMPTS = 5;
    private static final long LOCKOUT_SECONDS      = 900; // 15 minutes
    private static final String REFRESH_PREFIX     = "refresh:";
    private static final String LOCKOUT_PREFIX     = "lockout:";
    private static final String RESET_PREFIX       = "reset:";

    // ══════════════════════════════════════════════════════════════════════════
    // 1. Email / Password Login
    // ══════════════════════════════════════════════════════════════════════════

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        String lockoutKey = LOCKOUT_PREFIX + request.getEmail();

        // Check lockout
        String attempts = redisTemplate.opsForValue().get(lockoutKey);
        if (attempts != null && Integer.parseInt(attempts) >= MAX_FAILED_ATTEMPTS) {
            throw new AuthenticationException("Account temporarily locked. Try again in 15 minutes.");
        }

        AdminUser user = adminUserRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> {
                    incrementLockout(lockoutKey);
                    return new AuthenticationException("Invalid email or password");
                });

        // Google-only users don't have a password hash
        if (user.getPasswordHash() == null) {
            throw new AuthenticationException(
                "This account uses Google sign-in. Please click 'Continue with Google'."
            );
        }

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            incrementLockout(lockoutKey);
            throw new AuthenticationException("Invalid email or password");
        }

        if (!user.isActive()) {
            throw new AuthenticationException("Account is inactive. Contact your administrator.");
        }

        redisTemplate.delete(lockoutKey);
        return ResponseEntity.ok(issueTokensFor(user));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. Google OAuth Login / Register
    // ══════════════════════════════════════════════════════════════════════════

    @PostMapping("/google")
    public ResponseEntity<AuthResponse> googleAuth(@Valid @RequestBody GoogleAuthRequest request) {
        // Verify the ID token with Google
        GoogleIdToken.Payload payload = verifyGoogleToken(request.getIdToken());

        String googleId  = payload.getSubject();
        String email     = payload.getEmail();
        String firstName = (String) payload.get("given_name");
        String lastName  = (String) payload.get("family_name");
        String avatarUrl = (String) payload.get("picture");

        if (firstName == null) firstName = email.split("@")[0];
        if (lastName  == null) lastName  = "";

        // ── Find existing user by googleId (most direct match) ────────────────
        Optional<AdminUser> byGoogleId = adminUserRepository.findByGoogleId(googleId);
        if (byGoogleId.isPresent()) {
            AdminUser user = byGoogleId.get();
            if (!user.isActive()) {
                throw new AuthenticationException("Account is inactive. Contact your administrator.");
            }
            // Update avatar in case it changed
            if (avatarUrl != null && !avatarUrl.equals(user.getAvatarUrl())) {
                user.setAvatarUrl(avatarUrl);
                adminUserRepository.save(user);
            }
            log.info("Google login - existing user: userId={}", user.getId());
            return ResponseEntity.ok(issueTokensFor(user));
        }

        // ── Find existing user by email (they registered with email/password) ─
        Optional<AdminUser> byEmail = adminUserRepository.findByEmail(email);
        if (byEmail.isPresent()) {
            AdminUser user = byEmail.get();
            // Link Google to their existing account
            user.setGoogleId(googleId);
            user.setAvatarUrl(avatarUrl);
            if ("LOCAL".equals(user.getAuthProvider())) {
                user.setAuthProvider("LINKED"); // has both email+password and Google
            }
            adminUserRepository.save(user);
            log.info("Google login - linked to existing email account: userId={}", user.getId());
            return ResponseEntity.ok(issueTokensFor(user));
        }

        // ── Brand new user — create account ───────────────────────────────────
        UUID tenantId = resolveTenantForGoogleUser(email);

        final String firstNameFinal = firstName;
        final String lastNameFinal  = lastName;

        AdminUser newUser = AdminUser.builder()
                .tenantId(tenantId)
                .email(email)
                .googleId(googleId)
                .avatarUrl(avatarUrl)
                .firstName(firstNameFinal)
                .lastName(lastNameFinal)
                .authProvider("GOOGLE")
                .passwordHash(null) // No password for Google-only users
                .role("ADMIN")
                .active(true)
                .build();

        newUser = adminUserRepository.save(newUser);
        log.info("Google login - new user created: userId={}, tenantId={}", newUser.getId(), tenantId);
        return ResponseEntity.status(201).body(issueTokensFor(newUser));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 3. Email / Password Registration
    // ══════════════════════════════════════════════════════════════════════════

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        // Tenant must exist
        UUID tenantId = UUID.fromString(request.getTenantId());
        if (!tenantRepository.existsById(tenantId)) {
            throw new ValidationException("Tenant not found: " + request.getTenantId());
        }

        // Check duplicate email within tenant
        if (adminUserRepository.existsByTenantIdAndEmail(tenantId, request.getEmail())) {
            throw new ValidationException("Email already registered for this tenant");
        }

        validatePasswordStrength(request.getPassword());

        AdminUser user = AdminUser.builder()
                .tenantId(tenantId)
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .authProvider("LOCAL")
                .role("ADMIN")
                .active(true)
                .build();

        user = adminUserRepository.save(user);
        log.info("New admin registered: userId={}, tenantId={}", user.getId(), user.getTenantId());
        return ResponseEntity.status(201).body(issueTokensFor(user));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 4. Refresh Token
    // ══════════════════════════════════════════════════════════════════════════

    @PostMapping("/refresh")
    public ResponseEntity<Map<String, String>> refresh(@Valid @RequestBody RefreshRequest request) {
        String token = request.getRefreshToken();

        if (!jwtUtil.validateToken(token)) {
            throw new AuthenticationException("Invalid or expired refresh token");
        }
        if (!"refresh".equals(jwtUtil.getTokenType(token))) {
            throw new AuthenticationException("Token is not a refresh token");
        }

        String userId   = jwtUtil.getUserIdFromToken(token);
        String tenantId = jwtUtil.getTenantIdFromToken(token);

        String stored = redisTemplate.opsForValue().get(REFRESH_PREFIX + userId);
        if (!token.equals(stored)) {
            throw new AuthenticationException("Refresh token has been revoked");
        }

        AdminUser user = adminUserRepository
                .findByIdAndTenantId(UUID.fromString(userId), UUID.fromString(tenantId))
                .orElseThrow(() -> new AuthenticationException("User not found"));

        String newAccessToken = jwtUtil.generateToken(userId, tenantId, user.getRole());
        return ResponseEntity.ok(Map.of("accessToken", newAccessToken, "expiresIn", "86400"));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 5. Logout
    // ══════════════════════════════════════════════════════════════════════════

    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(@RequestBody(required = false) RefreshRequest request) {
        if (request != null && request.getRefreshToken() != null) {
            try {
                String userId = jwtUtil.getUserIdFromToken(request.getRefreshToken());
                redisTemplate.delete(REFRESH_PREFIX + userId);
            } catch (Exception ignored) {}
        }
        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 6. Forgot Password (stub — wire up email service in production)
    // ══════════════════════════════════════════════════════════════════════════

    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, String>> forgotPassword(
            @RequestBody Map<String, String> body) {
        String email = body.get("email");

        // Always return 200 for security (don't reveal whether email exists)
        adminUserRepository.findByEmail(email).ifPresent(user -> {
            if ("GOOGLE".equals(user.getAuthProvider())) {
                // Google-only users can't reset a password — silently skip
                return;
            }
            String resetToken = UUID.randomUUID().toString();
            redisTemplate.opsForValue().set(
                RESET_PREFIX + resetToken, user.getId().toString(),
                30, TimeUnit.MINUTES
            );
            log.info("Password reset requested for userId={}", user.getId());
        });

        return ResponseEntity.ok(Map.of("message", "If that email is registered, a reset link has been sent."));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Private Helpers
    // ══════════════════════════════════════════════════════════════════════════

    private AuthResponse issueTokensFor(AdminUser user) {
        String userId   = user.getId().toString();
        String tenantId = user.getTenantId().toString();

        String accessToken  = jwtUtil.generateToken(userId, tenantId, user.getRole());
        String refreshToken = jwtUtil.generateRefreshToken(userId, tenantId);

        redisTemplate.opsForValue().set(REFRESH_PREFIX + userId, refreshToken, 7, TimeUnit.DAYS);

        return new AuthResponse(
                accessToken,
                refreshToken,
                86400L,
                userId,
                user.getEmail(),
                user.getFirstName(),
                user.getLastName(),
                user.getRole(),
                tenantId,
                user.getAvatarUrl(),
                user.getAuthProvider()
        );
    }

    private GoogleIdToken.Payload verifyGoogleToken(String idToken) {
        try {
            GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(
                    new NetHttpTransport(), GsonFactory.getDefaultInstance())
                    .setAudience(Collections.singletonList(googleClientId))
                    .build();

            GoogleIdToken token = verifier.verify(idToken);
            if (token == null) {
                throw new AuthenticationException("Google ID token is invalid or expired");
            }
            return token.getPayload();
        } catch (AuthenticationException e) {
            throw e;
        } catch (Exception e) {
            log.error("Google token verification failed", e);
            throw new AuthenticationException("Failed to verify Google token");
        }
    }

    /**
     * Resolve which tenant a new Google user belongs to.
     * Strategy: use configured default tenant, or throw if none configured.
     * In production you'd show a tenant selection page or use email domain matching.
     */
    private UUID resolveTenantForGoogleUser(String email) {
        if (defaultTenantId != null && !defaultTenantId.isBlank()) {
            UUID id = UUID.fromString(defaultTenantId);
            if (tenantRepository.existsById(id)) {
                return id;
            }
        }
        // Fallback: use the first tenant (single-tenant mode)
        return tenantRepository.findAll().stream()
                .findFirst()
                .map(t -> t.getId())
                .orElseThrow(() -> new ValidationException(
                    "No tenant configured. Create a tenant first before signing in with Google."
                ));
    }

    private void incrementLockout(String key) {
        redisTemplate.opsForValue().increment(key);
        redisTemplate.expire(key, LOCKOUT_SECONDS, TimeUnit.SECONDS);
    }

    private void validatePasswordStrength(String password) {
        if (password.length() < 10)
            throw new ValidationException("Password must be at least 10 characters");
        if (!password.matches(".*[A-Z].*"))
            throw new ValidationException("Password must contain at least one uppercase letter");
        if (!password.matches(".*[0-9].*"))
            throw new ValidationException("Password must contain at least one digit");
        if (!password.matches(".*[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>/?].*"))
            throw new ValidationException("Password must contain at least one special character");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // DTOs
    // ══════════════════════════════════════════════════════════════════════════

    @Data public static class LoginRequest {
        @NotBlank @Email private String email;
        @NotBlank        private String password;
    }

    @Data public static class GoogleAuthRequest {
        @NotBlank private String idToken; // Google ID token from frontend
    }

    @Data public static class RefreshRequest {
        private String refreshToken;
    }

    @Data public static class RegisterRequest {
        @NotBlank                    private String tenantId;
        @NotBlank @Email             private String email;
        @NotBlank @Size(min = 10)    private String password;
        @NotBlank                    private String firstName;
        @NotBlank                    private String lastName;
    }

    public record AuthResponse(
        String  accessToken,
        String  refreshToken,
        long    expiresIn,
        String  userId,
        String  email,
        String  firstName,
        String  lastName,
        String  role,
        String  tenantId,
        String  avatarUrl,    // populated for Google users
        String  authProvider  // "LOCAL" | "GOOGLE" | "LINKED"
    ) {}
}