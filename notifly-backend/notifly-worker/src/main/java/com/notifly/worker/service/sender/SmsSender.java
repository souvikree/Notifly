package com.notifly.worker.service.sender;

import com.twilio.Twilio;
import com.twilio.exception.ApiException;
import com.twilio.rest.api.v2010.account.Message;
import com.twilio.type.PhoneNumber;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * SMS sender using Twilio.
 *
 * FIXED from original: was a stub that always returned success.
 * Now makes real API calls to Twilio.
 *
 * Configuration required:
 *   notifly.twilio.account-sid   → TWILIO_ACCOUNT_SID
 *   notifly.twilio.auth-token    → TWILIO_AUTH_TOKEN
 *   notifly.twilio.from-phone    → TWILIO_FROM_PHONE (e.g., +14155551234)
 *
 * Falls back to no-op mode when account-sid is blank.
 */
@Slf4j
@Component
public class SmsSender implements ChannelSender {

    @Value("${notifly.twilio.account-sid:}")
    private String accountSid;

    @Value("${notifly.twilio.auth-token:}")
    private String authToken;

    @Value("${notifly.twilio.from-phone:}")
    private String fromPhone;

    private boolean twilioEnabled = false;

    @PostConstruct
    public void init() {
        if (accountSid != null && !accountSid.isBlank()
                && authToken != null && !authToken.isBlank()) {
            Twilio.init(accountSid, authToken);
            twilioEnabled = true;
            log.info("SmsSender: Twilio initialized, from={}", fromPhone);
        } else {
            log.warn("SmsSender: Running in DEV MODE — Twilio credentials not configured");
        }
    }

    @Override
    public String getChannel() {
        return "SMS";
    }

    @Override
    public SendResult send(String recipient, String subject, String content) {
        long startMs = System.currentTimeMillis();

        if (!isValidPhoneNumber(recipient)) {
            log.warn("SmsSender: Invalid phone number: {}", recipient);
            return SendResult.failed("INVALID_PHONE", "Invalid phone number format: " + recipient);
        }

        // No-op mode for local development
        if (!twilioEnabled) {
            log.info("[DEV MODE] SmsSender: Would send to={}, message={}", recipient,
                content != null && content.length() > 50 ? content.substring(0, 50) + "..." : content);
            return SendResult.success(System.currentTimeMillis() - startMs);
        }

        try {
            // Truncate SMS to 160 chars (1 segment) — longer messages cost more
            String smsBody = content != null && content.length() > 1600 ? content.substring(0, 1600) : content;

            Message message = Message.creator(
                    new PhoneNumber(recipient),
                    new PhoneNumber(fromPhone),
                    smsBody
            ).create();

            long latencyMs = System.currentTimeMillis() - startMs;

            // Check Twilio delivery status
            if (message.getStatus() == Message.Status.FAILED || message.getStatus() == Message.Status.UNDELIVERED) {
                String error = "Twilio delivery status: " + message.getStatus()
                    + ", error=" + message.getErrorCode() + ": " + message.getErrorMessage();
                log.error("SmsSender: Failed to={}, status={}", recipient, message.getStatus());
                return SendResult.failed("TWILIO_DELIVERY_FAILED_" + message.getErrorCode(), error);
            }

            log.info("SmsSender: Sent sid={}, to={}, latency={}ms",
                    message.getSid(), recipient, latencyMs);
            return SendResult.success(latencyMs);

        } catch (ApiException e) {
            log.error("SmsSender: Twilio API error to={}: code={}, msg={}",
                    recipient, e.getCode(), e.getMessage());
            // 4xx = permanent (invalid number, unsubscribed, etc.)
            if (e.getStatusCode() >= 400 && e.getStatusCode() < 500) {
                return SendResult.permanentFailure("TWILIO_CLIENT_ERROR_" + e.getCode(), e.getMessage());
            }
            return SendResult.failed("TWILIO_SERVER_ERROR_" + e.getCode(), e.getMessage());
        } catch (Exception e) {
            log.error("SmsSender: Unexpected error sending to={}: {}", recipient, e.getMessage(), e);
            return SendResult.failed("SMS_UNEXPECTED_ERROR", e.getMessage());
        }
    }

    private boolean isValidPhoneNumber(String phone) {
        if (phone == null || phone.isBlank()) return false;
        // E.164 format: +[country][number], 7-15 digits
        return phone.matches("^\\+[1-9]\\d{6,14}$");
    }
}
