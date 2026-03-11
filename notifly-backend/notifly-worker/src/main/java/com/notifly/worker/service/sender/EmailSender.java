package com.notifly.worker.service.sender;

import com.sendgrid.*;
import com.sendgrid.helpers.mail.Mail;
import com.sendgrid.helpers.mail.objects.Content;
import com.sendgrid.helpers.mail.objects.Email;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Email sender using SendGrid.
 *
 * FIXED from original: was a stub that always returned success.
 * Now makes real API calls to SendGrid.
 *
 * Configuration required (in application.yml / env):
 *   notifly.sendgrid.api-key        → SENDGRID_API_KEY
 *   notifly.sendgrid.from-email     → SENDGRID_FROM_EMAIL (e.g., noreply@yourdomain.com)
 *   notifly.sendgrid.from-name      → SENDGRID_FROM_NAME  (e.g., Notifly)
 *
 * Falls back to no-op mode (logs only) when api-key is blank —
 * so local development without a SendGrid account still works.
 */
@Slf4j
@Component
public class EmailSender implements ChannelSender {

    @Value("${notifly.sendgrid.api-key:}")
    private String sendGridApiKey;

    @Value("${notifly.sendgrid.from-email:noreply@notifly.io}")
    private String fromEmail;

    @Value("${notifly.sendgrid.from-name:Notifly}")
    private String fromName;

    @Override
    public String getChannel() {
        return "EMAIL";
    }

    @Override
    public SendResult send(String recipient, String subject, String content) {
        long startMs = System.currentTimeMillis();

        // Validate before calling API
        if (!isValidEmail(recipient)) {
            log.warn("EmailSender: Invalid email address: {}", recipient);
            return SendResult.failed("INVALID_EMAIL", "Invalid email format: " + recipient);
        }

        // No-op mode for local development
        if (sendGridApiKey == null || sendGridApiKey.isBlank()) {
            log.info("[DEV MODE] EmailSender: Would send to={}, subject={}", recipient, subject);
            return SendResult.success(System.currentTimeMillis() - startMs);
        }

        try {
            Email from = new Email(fromEmail, fromName);
            Email to   = new Email(recipient);

            // Support both HTML and plain text
            String contentType = isHtml(content) ? "text/html" : "text/plain";
            Content emailContent = new Content(contentType, content);

            Mail mail = new Mail(from, subject != null ? subject : "(No Subject)", to, emailContent);

            SendGrid sg = new SendGrid(sendGridApiKey);
            Request request = new Request();
            request.setMethod(Method.POST);
            request.setEndpoint("mail/send");
            request.setBody(mail.build());

            Response response = sg.api(request);
            long latencyMs = System.currentTimeMillis() - startMs;

            // SendGrid returns 202 for successful queuing
            if (response.getStatusCode() == 202) {
                log.info("EmailSender: Sent to={}, latency={}ms", recipient, latencyMs);
                return SendResult.success(latencyMs);
            }

            // Classify error types for smart retry decisions
            String errorMsg = "SendGrid error: HTTP " + response.getStatusCode() + " — " + response.getBody();
            log.error("EmailSender: Failed to={}, status={}", recipient, response.getStatusCode());

            // 4xx = permanent failure (bad email, bounced, etc.) — don't retry
            if (response.getStatusCode() >= 400 && response.getStatusCode() < 500) {
                return SendResult.permanentFailure("SENDGRID_CLIENT_ERROR_" + response.getStatusCode(), errorMsg);
            }
            // 5xx = transient — retry
            return SendResult.failed("SENDGRID_SERVER_ERROR_" + response.getStatusCode(), errorMsg);

        } catch (IOException e) {
            long latencyMs = System.currentTimeMillis() - startMs;
            log.error("EmailSender: IOException sending to={}: {}", recipient, e.getMessage());
            return SendResult.failed("SENDGRID_IO_ERROR", e.getMessage());
        }
    }

    private boolean isValidEmail(String email) {
        if (email == null || email.isBlank()) return false;
        // RFC-5322 simplified check
        return email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    }

    private boolean isHtml(String content) {
        return content != null && (content.contains("<html") || content.contains("<body") || content.contains("<p>"));
    }
}
