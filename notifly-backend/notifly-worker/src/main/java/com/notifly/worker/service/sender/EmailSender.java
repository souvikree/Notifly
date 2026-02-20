package com.notifly.worker.service.sender;

import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

import java.time.Instant;

/**
 * Email sender implementation
 */
@Slf4j
@Component
public class EmailSender implements ChannelSender {

    @Override
    public SendResult send(String recipient, String subject, String content) {
        try {
            long startTime = System.currentTimeMillis();
            
            // Simulate email sending (replace with actual email service)
            log.info("Sending email to {} with subject: {}", recipient, subject);
            
            // In production, integrate with SendGrid, SES, Mailgun, etc.
            if (!isValidEmail(recipient)) {
                return SendResult.failed("INVALID_EMAIL", "Invalid email format");
            }
            
            long latencyMs = System.currentTimeMillis() - startTime;
            
            return SendResult.success(latencyMs);
        } catch (Exception e) {
            log.error("Failed to send email", e);
            return SendResult.failed("EMAIL_SEND_ERROR", e.getMessage());
        }
    }

    private boolean isValidEmail(String email) {
        return email != null && email.contains("@");
    }

    @Override
    public String getChannel() {
        return "EMAIL";
    }
}
