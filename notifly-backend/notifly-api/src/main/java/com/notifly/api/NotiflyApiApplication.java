package com.notifly.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

import com.notifly.api.config.NotiflyProperties;

/**
 * Notifly API Gateway — entry point.
 *
 * FIXED: Added @EnableScheduling so OutboxPublisher's @Scheduled method
 * actually runs. Without this annotation, the entire outbox polling loop
 * never starts and no notifications are ever published to Kafka.
 */
@SpringBootApplication(scanBasePackages = "com.notifly")
@EnableScheduling
@EnableConfigurationProperties(NotiflyProperties.class)
public class NotiflyApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(NotiflyApiApplication.class, args);
    }
}
