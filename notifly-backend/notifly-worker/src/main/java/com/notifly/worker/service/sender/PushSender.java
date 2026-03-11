package com.notifly.worker.service.sender;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.FileInputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;

/**
 * Push notification sender using Firebase Cloud Messaging (FCM) HTTP v1 API.
 *
 * FIXED CQ-001: Was a stub that always returned success without making any
 * real API calls. Now sends real push notifications via FCM HTTP v1 API
 * using a service account for authentication.
 *
 * Configuration required:
 *   notifly.firebase.project-id            → FIREBASE_PROJECT_ID
 *   notifly.firebase.service-account-path  → FIREBASE_SERVICE_ACCOUNT_PATH
 *                                             (path to service account JSON file)
 *
 * Falls back to no-op dev mode when project-id is blank — so local
 * development without Firebase credentials still works.
 *
 * How to get credentials:
 *   Firebase Console → Project Settings → Service Accounts
 *   → Generate new private key → download JSON
 *   → mount as volume in Docker and set FIREBASE_SERVICE_ACCOUNT_PATH
 */
@Slf4j
@Component
public class PushSender implements ChannelSender {

    private static final String FCM_SEND_URL =
        "https://fcm.googleapis.com/v1/projects/%s/messages:send";
    private static final List<String> FCM_SCOPES =
        List.of("https://www.googleapis.com/auth/firebase.messaging");

    @Value("${notifly.firebase.project-id:}")
    private String projectId;

    @Value("${notifly.firebase.service-account-path:}")
    private String serviceAccountPath;

    private GoogleCredentials credentials;
    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private boolean fcmEnabled = false;

    @PostConstruct
    public void init() {
        if (projectId == null || projectId.isBlank()) {
            log.warn("PushSender: Running in DEV MODE — FIREBASE_PROJECT_ID not configured");
            return;
        }
        if (serviceAccountPath == null || serviceAccountPath.isBlank()) {
            log.warn("PushSender: Running in DEV MODE — FIREBASE_SERVICE_ACCOUNT_PATH not configured");
            return;
        }
        try {
            try (FileInputStream fis = new FileInputStream(serviceAccountPath)) {
                credentials = ServiceAccountCredentials
                    .fromStream(fis)
                    .createScoped(FCM_SCOPES);
            }
            fcmEnabled = true;
            log.info("PushSender: Firebase FCM initialized for project={}", projectId);
        } catch (IOException e) {
            log.error("PushSender: Failed to load Firebase service account from path={}: {}",
                serviceAccountPath, e.getMessage());
            log.warn("PushSender: Falling back to DEV MODE");
        }
    }

    @Override
    public String getChannel() {
        return "PUSH";
    }

    @Override
    public SendResult send(String recipient, String subject, String content) {
        long startMs = System.currentTimeMillis();

        if (!isValidDeviceToken(recipient)) {
            log.warn("PushSender: Invalid device token: {}", recipient);
            return SendResult.permanentFailure("INVALID_DEVICE_TOKEN",
                "Device token too short or null: " + recipient);
        }

        // No-op dev mode
        if (!fcmEnabled) {
            log.info("[DEV MODE] PushSender: Would send to={}, title={}", recipient, subject);
            return SendResult.success(System.currentTimeMillis() - startMs);
        }

        try {
            String accessToken = getAccessToken();
            String url = String.format(FCM_SEND_URL, projectId);

            // Build FCM v1 message payload
            Map<String, Object> notification = Map.of(
                "title", subject != null ? subject : "",
                "body",  content != null ? content : ""
            );
            Map<String, Object> message = Map.of(
                "token",        recipient,
                "notification", notification
            );
            String body = objectMapper.writeValueAsString(Map.of("message", message));

            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + accessToken)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

            HttpResponse<String> response = httpClient.send(request,
                HttpResponse.BodyHandlers.ofString());

            long latencyMs = System.currentTimeMillis() - startMs;

            if (response.statusCode() == 200) {
                log.info("PushSender: Sent to={}, latency={}ms", recipient, latencyMs);
                return SendResult.success(latencyMs);
            }

            String errorBody = response.body();
            log.error("PushSender: FCM error status={}, body={}", response.statusCode(), errorBody);

            // 404 = token not found / app uninstalled — permanent failure, don't retry
            if (response.statusCode() == 404) {
                return SendResult.permanentFailure("FCM_TOKEN_NOT_FOUND",
                    "Device token not registered (app uninstalled?): " + errorBody);
            }
            // 400 = malformed request — permanent
            if (response.statusCode() == 400) {
                return SendResult.permanentFailure("FCM_BAD_REQUEST", errorBody);
            }
            // 429 / 500 / 503 = transient — worth retrying
            return SendResult.failed("FCM_ERROR_" + response.statusCode(), errorBody);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return SendResult.failed("FCM_INTERRUPTED", "Request interrupted");
        } catch (Exception e) {
            log.error("PushSender: Unexpected error sending to={}: {}", recipient, e.getMessage(), e);
            return SendResult.failed("FCM_UNEXPECTED_ERROR", e.getMessage());
        }
    }

    /**
     * Fetches (and auto-refreshes) an OAuth2 access token from the service account.
     * GoogleCredentials handles token caching and refresh automatically.
     */
    private String getAccessToken() throws IOException {
        credentials.refreshIfExpired();
        return credentials.getAccessToken().getTokenValue();
    }

    private boolean isValidDeviceToken(String token) {
        // FCM tokens are typically 100-200 chars
        return token != null && token.length() > 20;
    }
}