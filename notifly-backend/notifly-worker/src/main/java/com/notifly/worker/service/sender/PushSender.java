package com.notifly.worker.service.sender;

import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

/**
 * Push notification sender implementation
 */
@Slf4j
@Component
public class PushSender implements ChannelSender {

    @Override
    public SendResult send(String recipient, String subject, String content) {
        try {
            long startTime = System.currentTimeMillis();
            
            log.info("Sending push notification to {} with subject: {}", recipient, subject);
            
            // In production, integrate with Firebase FCM, Apple APNs, etc.
            if (!isValidDeviceToken(recipient)) {
                return SendResult.failed("INVALID_DEVICE_TOKEN", "Invalid device token");
            }
            
            long latencyMs = System.currentTimeMillis() - startTime;
            
            return SendResult.success(latencyMs);
        } catch (Exception e) {
            log.error("Failed to send push notification", e);
            return SendResult.failed("PUSH_SEND_ERROR", e.getMessage());
        }
    }

    private boolean isValidDeviceToken(String token) {
        return token != null && token.length() > 20;
    }

    @Override
    public String getChannel() {
        return "PUSH";
    }
}
