package com.notifly.worker.service.sender;

/**
 * Interface for channel-specific senders
 */
public interface ChannelSender {
    SendResult send(String recipient, String subject, String content);
    String getChannel();
}
