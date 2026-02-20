package com.notifly.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.scheduling.annotation.EnableScheduling;

import com.notifly.api.config.NotiflyProperties;

@SpringBootApplication
@EnableConfigurationProperties(NotiflyProperties.class)
@EnableScheduling
@ComponentScan(basePackages = {"com.notifly.api", "com.notifly.common"})
public class NotiflyApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(NotiflyApiApplication.class, args);
    }
}
