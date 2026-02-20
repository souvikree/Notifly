package com.notifly.api.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Data
@Configuration
@ConfigurationProperties(prefix = "notifly")
public class NotiflyProperties {

    private Jwt jwt;
    private ApiKey apiKey;
    private RateLimit rateLimit;
    private Kafka kafka;
    private Outbox outbox;

    @Data
    public static class Jwt {
        private String secret;
        private long expirationMs;
        private long refreshExpirationMs;
    }

    @Data
    public static class ApiKey {
        private String prefix;
    }

    @Data
    public static class RateLimit {
        private int defaultRequestsPerMinute;
        private int defaultBurstLimit;
    }

    @Data
    public static class Kafka {
        private String topic;
        private String outboxTopic;
        private List<String> retryTopics;
        private String dlqTopic;
    }

    @Data
    public static class Outbox {
        private long pollInterval;
        private int batchSize;
    }
}