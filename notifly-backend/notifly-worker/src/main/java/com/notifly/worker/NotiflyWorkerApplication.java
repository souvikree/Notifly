package com.notifly.worker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.kafka.annotation.EnableKafka;

/**
 * Notifly Worker - Kafka consumer for processing notifications
 */
@SpringBootApplication
@EnableKafka
@EnableScheduling
public class NotiflyWorkerApplication {
    public static void main(String[] args) {
        SpringApplication.run(NotiflyWorkerApplication.class, args);
    }
}
