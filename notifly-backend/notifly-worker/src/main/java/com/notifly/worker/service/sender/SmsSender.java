package com.notifly.worker.service.sender;

import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

/**
 * SMS sender implementation
 */
@Slf4j
@Component
public class SmsSender implements ChannelSender {

    @Override
    public SendResult send(String recipient, String subject, String content) {
        try {
            long startTime = System.currentTimeMillis();
            
            log.info("Sending SMS to {} with message: {}", recipient, content);
            
            // In production, integrate with Twilio, AWS SNS, etc.
            if (!isValidPhoneNumber(recipient)) {
                return SendResult.failed("INVALID_PHONE", "Invalid phone number");
            }
            
            long latencyMs = System.currentTimeMillis() - startTime;
            
            return SendResult.success(latencyMs);
        } catch (Exception e) {
            log.error("Failed to send SMS", e);
            return SendResult.failed("SMS_SEND_ERROR", e.getMessage());
        }
    }

    private boolean isValidPhoneNumber(String phone) {
        return phone != null && phone.length() >= 10;
    }

    @Override
    public String getChannel() {
        return "SMS";
    }
}
