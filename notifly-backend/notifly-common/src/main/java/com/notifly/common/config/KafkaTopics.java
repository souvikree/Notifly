package com.notifly.common.config;

/**
 * Kafka topic configuration for NOTIFLY
 * Implements retry topic naming convention: topic.retry.Ns (where N = seconds)
 */
public class KafkaTopics {
    public static final String NOTIFICATION_EVENTS = "notification.events";
    public static final String NOTIFICATION_RETRY_1S = "notification.retry.1s";
    public static final String NOTIFICATION_RETRY_5S = "notification.retry.5s";
    public static final String NOTIFICATION_RETRY_30S = "notification.retry.30s";
    public static final String NOTIFICATION_DLQ = "notification.dlq";
}
