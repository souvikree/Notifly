package com.notifly.api.controller;

import com.notifly.api.util.JwtUtil;
import com.notifly.common.domain.entity.AdminUser;
import com.notifly.common.domain.entity.RateLimitConfig;
import com.notifly.common.domain.entity.Tenant;
import com.notifly.common.domain.repository.AdminUserRepository;
import com.notifly.common.domain.repository.RateLimitConfigRepository;
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

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.sendgrid.*;
import com.sendgrid.helpers.mail.Mail;
import com.sendgrid.helpers.mail.objects.Content;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.TimeUnit;

/**
 * Authentication controller.
 *
 * Registration flow (email/password):
 *   User provides name, email, password, workspaceName
 *   → Backend auto-creates Tenant (slug from workspaceName)
 *   → AdminUser created and linked to that tenant
 *   → RateLimitConfig seeded (FREE plan defaults)
 *   → Tokens issued
 *
 * Registration flow (Google — new user):
 *   POST /auth/google → 202 { needsOnboarding: true, profile }
 *   → Frontend shows /onboarding page
 *   → User enters workspace name → POST /auth/complete-google-signup
 *   → Tenant + user created → tokens issued
 *
 * FIXES (SEC-003):
 *   - forgotPassword: added null/blank check on email to prevent NPE
 *   - forgotPassword: now sends a real reset email via SendGrid
 *                     (dev-mode no-op when SENDGRID_API_KEY is not set)
 *   - Added POST /auth/reset-password endpoint to consume the token
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AdminUserRepository           adminUserRepository;
    private final TenantRepository              tenantRepository;
    private final RateLimitConfigRepository     rateLimitConfigRepository;
    private final JwtUtil                       jwtUtil;
    private final PasswordEncoder               passwordEncoder;
    private final RedisTemplate<String, String> redisTemplate;

    @Value("${google.client-id:}")
    private String googleClientId;

    // SendGrid — same env vars used by the worker's EmailSender
    @Value("${notifly.sendgrid.api-key:}")
    private String sendGridApiKey;

    @Value("${notifly.sendgrid.from-email:noreply@notifly.io}")
    private String fromEmail;

    @Value("${notifly.sendgrid.from-name:Notifly}")
    private String fromName;

    // The public URL of the frontend — used to build the reset link.
    // Set FRONTEND_URL=https://app.yourdomain.com in production env.
    @Value("${notifly.frontend-url:http://localhost:3000}")
    private String frontendUrl;

    private static final int  MAX_FAILED_ATTEMPTS = 5;
    private static final long LOCKOUT_SECONDS     = 900;
    private static final String REFRESH_PREFIX    = "refresh:";
    private static final String LOCKOUT_PREFIX    = "lockout:";
    private static final String RESET_PREFIX      = "reset:";

    // FREE plan limits applied to every new signup
    private static final int FREE_REQUESTS_PER_MINUTE = 60;
    private static final int FREE_REQUESTS_PER_HOUR   = 1000;
    private static final int FREE_BURST_LIMIT         = 100;
    private static final int FREE_MONTHLY_LIMIT       = 10000;

    // ── 1. Login ──────────────────────────────────────────────────────────────

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        String lockoutKey = LOCKOUT_PREFIX + request.getEmail();

        String attempts = redisTemplate.opsForValue().get(lockoutKey);
        if (attempts != null && Integer.parseInt(attempts) >= MAX_FAILED_ATTEMPTS) {
            throw new AuthenticationException("Account temporarily locked. Try again in 15 minutes.");
        }

        AdminUser user = adminUserRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> {
                    incrementLockout(lockoutKey);
                    return new AuthenticationException("Invalid email or password");
                });

        if (user.getPasswordHash() == null) {
            throw new AuthenticationException(
                "This account uses Google sign-in. Please click 'Continue with Google'.");
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

    // ── 2. Email Registration — auto-creates tenant ───────────────────────────

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        if (adminUserRepository.findByEmail(request.getEmail()).isPresent()) {
            throw new ValidationException("Email already registered. Please sign in instead.");
        }

        validatePasswordStrength(request.getPassword());

        String slug = generateUniqueSlug(request.getWorkspaceName());

        Tenant tenant = Tenant.builder()
                .name(request.getWorkspaceName().trim())
                .slug(slug)
                .plan("FREE")
                .monthlyRequestLimit(FREE_MONTHLY_LIMIT)
                .build();
        tenant = tenantRepository.save(tenant);

        AdminUser user = AdminUser.builder()
                .tenantId(tenant.getId())
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .authProvider("LOCAL")
                .role("ADMIN")
                .active(true)
                .build();
        user = adminUserRepository.save(user);

        seedRateLimitConfig(tenant.getId());

        log.info("New workspace: tenantId={}, slug={}, userId={}",
                tenant.getId(), slug, user.getId());
        return ResponseEntity.status(201).body(issueTokensFor(user));
    }

    // ── 3. Google Auth ────────────────────────────────────────────────────────

    @PostMapping("/google")
    public ResponseEntity<?> googleAuth(@Valid @RequestBody GoogleAuthRequest request) {
        GoogleIdToken.Payload payload = verifyGoogleToken(request.getIdToken());

        String googleId  = payload.getSubject();
        String email     = payload.getEmail();
        String firstName = (String) payload.get("given_name");
        String lastName  = (String) payload.get("family_name");
        String avatarUrl = (String) payload.get("picture");

        if (firstName == null) firstName = email.split("@")[0];
        if (lastName  == null) lastName  = "";

        // Existing Google user → login
        Optional<AdminUser> byGoogleId = adminUserRepository.findByGoogleId(googleId);
        if (byGoogleId.isPresent()) {
            AdminUser user = byGoogleId.get();
            if (!user.isActive()) throw new AuthenticationException("Account is inactive.");
            if (avatarUrl != null && !avatarUrl.equals(user.getAvatarUrl())) {
                user.setAvatarUrl(avatarUrl);
                adminUserRepository.save(user);
            }
            return ResponseEntity.ok(issueTokensFor(user));
        }

        // Email already registered with password → link Google
        Optional<AdminUser> byEmail = adminUserRepository.findByEmail(email);
        if (byEmail.isPresent()) {
            AdminUser user = byEmail.get();
            user.setGoogleId(googleId);
            user.setAvatarUrl(avatarUrl);
            if ("LOCAL".equals(user.getAuthProvider())) user.setAuthProvider("LINKED");
            adminUserRepository.save(user);
            return ResponseEntity.ok(issueTokensFor(user));
        }

        // Brand new user — needs workspace name before we can create tenant
        log.info("New Google user needs onboarding: email={}", email);
        return ResponseEntity.status(202).body(Map.of(
            "needsOnboarding", true,
            "profile", Map.of(
                "idToken",   request.getIdToken(),
                "email",     email,
                "firstName", firstName,
                "lastName",  lastName,
                "avatarUrl", avatarUrl != null ? avatarUrl : ""
            )
        ));
    }

    // ── 4. Complete Google Signup (from /onboarding page) ─────────────────────

    @PostMapping("/complete-google-signup")
    public ResponseEntity<AuthResponse> completeGoogleSignup(
            @Valid @RequestBody CompleteGoogleSignupRequest request) {

        GoogleIdToken.Payload payload = verifyGoogleToken(request.getIdToken());

        String googleId  = payload.getSubject();
        String email     = payload.getEmail();
        String firstName = (String) payload.get("given_name");
        String lastName  = (String) payload.get("family_name");
        String avatarUrl = (String) payload.get("picture");

        if (firstName == null) firstName = email.split("@")[0];
        if (lastName  == null) lastName  = "";

        // Guard against race / double submit
        Optional<AdminUser> existing = adminUserRepository.findByGoogleId(googleId);
        if (existing.isPresent()) {
            return ResponseEntity.ok(issueTokensFor(existing.get()));
        }

        String slug = generateUniqueSlug(request.getWorkspaceName());

        Tenant tenant = Tenant.builder()
                .name(request.getWorkspaceName().trim())
                .slug(slug)
                .plan("FREE")
                .monthlyRequestLimit(FREE_MONTHLY_LIMIT)
                .build();
        tenant = tenantRepository.save(tenant);

        AdminUser user = AdminUser.builder()
                .tenantId(tenant.getId())
                .email(email)
                .googleId(googleId)
                .avatarUrl(avatarUrl)
                .firstName(firstName)
                .lastName(lastName)
                .authProvider("GOOGLE")
                .passwordHash(null)
                .role("ADMIN")
                .active(true)
                .build();
        user = adminUserRepository.save(user);

        seedRateLimitConfig(tenant.getId());

        log.info("Google signup complete: tenantId={}, slug={}, userId={}",
                tenant.getId(), slug, user.getId());
        return ResponseEntity.status(201).body(issueTokensFor(user));
    }

    // ── 5. Refresh Token ──────────────────────────────────────────────────────

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
            log.warn("SEC: Refresh token reuse detected for userId={}", userId);
            throw new AuthenticationException("Refresh token has been revoked");
        }

        AdminUser user = adminUserRepository
                .findByIdAndTenantId(UUID.fromString(userId), UUID.fromString(tenantId))
                .orElseThrow(() -> new AuthenticationException("User not found"));

        String newAccessToken  = jwtUtil.generateToken(userId, tenantId, user.getRole());
        String newRefreshToken = jwtUtil.generateRefreshToken(userId, tenantId);

        redisTemplate.delete(REFRESH_PREFIX + userId);
        redisTemplate.opsForValue().set(REFRESH_PREFIX + userId, newRefreshToken, 7, TimeUnit.DAYS);

        return ResponseEntity.ok(Map.of(
            "accessToken",  newAccessToken,
            "refreshToken", newRefreshToken,
            "expiresIn",    "86400"
        ));
    }

    // ── 6. Logout ─────────────────────────────────────────────────────────────

    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(
            @RequestBody(required = false) RefreshRequest request) {
        if (request != null && request.getRefreshToken() != null) {
            try {
                String userId = jwtUtil.getUserIdFromToken(request.getRefreshToken());
                redisTemplate.delete(REFRESH_PREFIX + userId);
            } catch (Exception ignored) {}
        }
        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }

    // ── 7. Forgot Password ────────────────────────────────────────────────────

    /**
     * FIXED SEC-003 Part 1: Added null/blank check on email to prevent NPE.
     * FIXED SEC-003 Part 2: Now sends a real password reset email via SendGrid.
     *
     * Dev mode (SENDGRID_API_KEY not set): logs the reset link instead of sending.
     * Always returns the same generic message regardless of whether the email exists
     * — prevents user enumeration attacks.
     */
    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, String>> forgotPassword(
            @RequestBody Map<String, String> body) {

        // FIXED SEC-003: was null — caused NPE passed to findByEmail()
        String email = body.get("email");
        if (email == null || email.isBlank()) {
            throw new ValidationException("email is required");
        }

        adminUserRepository.findByEmail(email.trim().toLowerCase()).ifPresent(user -> {
            // Google-only accounts have no password to reset
            if ("GOOGLE".equals(user.getAuthProvider())) {
                log.info("Password reset skipped — Google-only account: userId={}", user.getId());
                return;
            }

            String resetToken = UUID.randomUUID().toString();
            redisTemplate.opsForValue().set(
                RESET_PREFIX + resetToken, user.getId().toString(), 30, TimeUnit.MINUTES);

            String resetLink = frontendUrl + "/reset-password?token=" + resetToken;
            sendResetEmail(user.getEmail(), user.getFirstName(), resetLink);

            log.info("Password reset token issued for userId={}", user.getId());
        });

        // Always return the same message — prevents user enumeration
        return ResponseEntity.ok(Map.of(
            "message", "If that email is registered, a reset link has been sent."));
    }

    // ── 8. Reset Password (NEW — SEC-003 Part 2) ─────────────────────────────

    /**
     * Consumes the reset token from Redis and updates the password.
     *
     * Token is single-use — deleted from Redis immediately after successful reset.
     * Existing refresh tokens are also invalidated so the user must log in fresh.
     */
    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, String>> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request) {

        String userId = redisTemplate.opsForValue().get(RESET_PREFIX + request.getToken());
        if (userId == null) {
            // Same message for expired and invalid tokens — don't distinguish
            throw new AuthenticationException(
                "Reset link is invalid or has expired. Please request a new one.");
        }

        AdminUser user = adminUserRepository.findById(UUID.fromString(userId))
                .orElseThrow(() -> new AuthenticationException("User not found"));

        if ("GOOGLE".equals(user.getAuthProvider())) {
            throw new AuthenticationException(
                "This account uses Google sign-in and does not have a password.");
        }

        validatePasswordStrength(request.getNewPassword());

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        adminUserRepository.save(user);

        // Single-use: delete the reset token immediately after successful reset
        redisTemplate.delete(RESET_PREFIX + request.getToken());

        // Invalidate any active sessions — force re-login with the new password
        redisTemplate.delete(REFRESH_PREFIX + userId);

        log.info("Password reset complete for userId={}", userId);
        return ResponseEntity.ok(Map.of("message", "Password updated successfully. Please sign in."));
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private AuthResponse issueTokensFor(AdminUser user) {
        String userId   = user.getId().toString();
        String tenantId = user.getTenantId().toString();
        String accessToken  = jwtUtil.generateToken(userId, tenantId, user.getRole());
        String refreshToken = jwtUtil.generateRefreshToken(userId, tenantId);
        redisTemplate.opsForValue().set(REFRESH_PREFIX + userId, refreshToken, 7, TimeUnit.DAYS);
        return new AuthResponse(
                accessToken, refreshToken, 86400L,
                userId, user.getEmail(),
                user.getFirstName(), user.getLastName(),
                user.getRole(), tenantId,
                user.getAvatarUrl(), user.getAuthProvider());
    }

    /**
     * Send a password reset email via SendGrid.
     * Falls back to logging the reset link in dev mode when no API key is configured.
     *
     * Failure is non-fatal: the reset token is already in Redis. If the email
     * fails, the user can request another link and it will retry.
     */
    private void sendResetEmail(String recipientEmail, String firstName, String resetLink) {
        if (sendGridApiKey == null || sendGridApiKey.isBlank()) {
            log.info("[DEV MODE] Password reset link for {}: {}", recipientEmail, resetLink);
            return;
        }

        String subject = "Reset your Notifly password";
        String body = String.format("""
                Hi %s,

                We received a request to reset your Notifly password.
                Click the link below to set a new password. This link expires in 30 minutes.

                %s

                If you didn't request this, you can safely ignore this email.
                Your password will not change until you click the link above.

                — The Notifly Team
                """, firstName, resetLink);

        try {
            // Use fully-qualified names — simple name "Email" is shadowed by
            // jakarta.validation.constraints.Email used on the DTO fields above.
            com.sendgrid.helpers.mail.objects.Email from =
                new com.sendgrid.helpers.mail.objects.Email(fromEmail, fromName);
            com.sendgrid.helpers.mail.objects.Email to =
                new com.sendgrid.helpers.mail.objects.Email(recipientEmail);

            // Build via setters — avoids the 4-arg Mail constructor which is
            // absent in some SendGrid 4.x patch versions.
            Mail mail = new Mail();
            mail.setFrom(from);
            mail.setSubject(subject);
            com.sendgrid.helpers.mail.objects.Personalization personalization =
                new com.sendgrid.helpers.mail.objects.Personalization();
            personalization.addTo(to);
            mail.addPersonalization(personalization);
            mail.addContent(new Content("text/plain", body));

            SendGrid sg = new SendGrid(sendGridApiKey);
            Request sgRequest = new Request();
            sgRequest.setMethod(Method.POST);
            sgRequest.setEndpoint("mail/send");
            sgRequest.setBody(mail.build());

            Response response = sg.api(sgRequest);
            if (response.getStatusCode() == 202) {
                log.info("Password reset email sent to={}", recipientEmail);
            } else {
                log.error("SendGrid reset email failed: status={}, body={}",
                        response.getStatusCode(), response.getBody());
            }
        } catch (IOException e) {
            // Don't throw — token is already in Redis, user can retry the request
            log.error("Failed to send password reset email to={}: {}", recipientEmail, e.getMessage());
        }
    }

    /**
     * "My SaaS App" → "my-saas-app"
     * If slug taken: "my-saas-app-2", "my-saas-app-3", etc.
     */
    private String generateUniqueSlug(String workspaceName) {
        String base = workspaceName.trim()
                .toLowerCase()
                .replaceAll("[^a-z0-9\\s-]", "")
                .replaceAll("[\\s]+", "-")
                .replaceAll("-+", "-")
                .replaceAll("^-|-$", "");

        if (base.isEmpty()) base = "workspace";
        if (!tenantRepository.existsBySlug(base)) return base;

        int suffix = 2;
        while (tenantRepository.existsBySlug(base + "-" + suffix)) suffix++;
        return base + "-" + suffix;
    }

    private void seedRateLimitConfig(UUID tenantId) {
        RateLimitConfig config = RateLimitConfig.builder()
                .tenantId(tenantId)
                .requestsPerMinute(FREE_REQUESTS_PER_MINUTE)
                .requestsPerHour(FREE_REQUESTS_PER_HOUR)
                .burstLimit(FREE_BURST_LIMIT)
                .build();
        rateLimitConfigRepository.save(config);
    }

    private GoogleIdToken.Payload verifyGoogleToken(String idToken) {
        try {
            GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(
                    new NetHttpTransport(), GsonFactory.getDefaultInstance())
                    .setAudience(Collections.singletonList(googleClientId))
                    .build();
            GoogleIdToken token = verifier.verify(idToken);
            if (token == null) throw new AuthenticationException("Google ID token is invalid or expired");
            return token.getPayload();
        } catch (AuthenticationException e) {
            throw e;
        } catch (Exception e) {
            log.error("Google token verification failed", e);
            throw new AuthenticationException("Failed to verify Google token");
        }
    }

    private void incrementLockout(String key) {
        Long count = redisTemplate.opsForValue().increment(key);
        if (count != null && count == 1L) {
            redisTemplate.expire(key, LOCKOUT_SECONDS, TimeUnit.SECONDS);
        }
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

    // ── DTOs ──────────────────────────────────────────────────────────────────

    @Data public static class LoginRequest {
        @NotBlank @Email private String email;
        @NotBlank        private String password;
    }

    @Data public static class RegisterRequest {
        @NotBlank @Email                   private String email;
        @NotBlank @Size(min = 10)          private String password;
        @NotBlank                          private String firstName;
        @NotBlank                          private String lastName;
        @NotBlank @Size(min = 2, max = 50) private String workspaceName;
    }

    @Data public static class GoogleAuthRequest {
        @NotBlank private String idToken;
    }

    @Data public static class CompleteGoogleSignupRequest {
        @NotBlank                          private String idToken;
        @NotBlank @Size(min = 2, max = 50) private String workspaceName;
    }

    @Data public static class RefreshRequest {
        private String refreshToken;
    }

    @Data public static class ResetPasswordRequest {
        @NotBlank                 private String token;
        @NotBlank @Size(min = 10) private String newPassword;
    }

    public record AuthResponse(
        String accessToken, String refreshToken, long expiresIn,
        String userId, String email, String firstName, String lastName,
        String role, String tenantId, String avatarUrl, String authProvider
    ) {}
}