package com.notifly.worker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.kafka.annotation.EnableKafka;

/**
 * Notifly Worker - Kafka consumer for processing notifications
 */
@SpringBootApplication
@EnableKafka
@EnableScheduling
@ComponentScan(basePackages = {
    "com.notifly.worker",
    "com.notifly.common"
})

// JPA repositories from common module (NotificationLog, FailedNotification etc)
@EnableJpaRepositories(basePackages = {
    "com.notifly.common.domain.repository"
})

// Entities from common module
@EntityScan(basePackages = {
    "com.notifly.common.domain.entity"
})
public class NotiflyWorkerApplication {
    public static void main(String[] args) {
        SpringApplication.run(NotiflyWorkerApplication.class, args);
    }
}
