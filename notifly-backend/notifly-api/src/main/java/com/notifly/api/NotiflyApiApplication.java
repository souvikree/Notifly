package com.notifly.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.EnableScheduling;

import com.notifly.api.config.NotiflyProperties;

@SpringBootApplication
@EnableConfigurationProperties(NotiflyProperties.class)
@EnableScheduling
@ComponentScan(basePackages = {
    "com.notifly.api",
    "com.notifly.common"
})

// Tell Spring Data JPA WHERE to find repository interfaces
// Must include common because ApiKeyRepository, AdminUserRepository etc live there
@EnableJpaRepositories(basePackages = {
    "com.notifly.api.domain.repository",
    "com.notifly.common.domain.repository"
})

// Tell Hibernate WHERE to find @Entity classes
// Must include common because ApiKey, AdminUser, Tenant etc live there
@EntityScan(basePackages = {
    "com.notifly.api.domain.entity",
    "com.notifly.common.domain.entity"
})
public class NotiflyApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(NotiflyApiApplication.class, args);
    }
}
