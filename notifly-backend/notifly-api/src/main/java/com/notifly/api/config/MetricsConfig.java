package com.notifly.api.config;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Custom Prometheus metrics for Notifly.
 *
 * Exposes:
 *  - notifications_sent_total{channel, status}
 *  - notifications_failed_total{channel, error_code}
 *  - notifications_retry_total{attempt}
 *  - notifications_dlq_total
 *  - provider_latency_seconds{channel, provider}
 *
 * Access via: GET /actuator/prometheus
 */
@Configuration
public class MetricsConfig {

    // Shared atomic for DLQ gauge
    public static final AtomicLong DLQ_COUNT = new AtomicLong(0);

    @Bean
    public Counter emailSentCounter(MeterRegistry registry) {
        return Counter.builder("notifications_sent_total")
                .description("Total notifications sent")
                .tag("channel", "EMAIL")
                .tag("status", "SUCCESS")
                .register(registry);
    }

    @Bean
    public Counter smsSentCounter(MeterRegistry registry) {
        return Counter.builder("notifications_sent_total")
                .description("Total notifications sent")
                .tag("channel", "SMS")
                .tag("status", "SUCCESS")
                .register(registry);
    }

    @Bean
    public Counter pushSentCounter(MeterRegistry registry) {
        return Counter.builder("notifications_sent_total")
                .description("Total notifications sent")
                .tag("channel", "PUSH")
                .tag("status", "SUCCESS")
                .register(registry);
    }

    @Bean
    public Counter notificationsFailedCounter(MeterRegistry registry) {
        return Counter.builder("notifications_failed_total")
                .description("Total notifications that failed")
                .tag("channel", "ALL")
                .register(registry);
    }

    @Bean
    public Counter retryCounter(MeterRegistry registry) {
        return Counter.builder("notifications_retry_total")
                .description("Total retry attempts")
                .register(registry);
    }

    @Bean
    public Counter dlqCounter(MeterRegistry registry) {
        return Counter.builder("notifications_dlq_total")
                .description("Total notifications moved to DLQ")
                .register(registry);
    }

    @Bean
    public Gauge dlqGauge(MeterRegistry registry) {
        return Gauge.builder("notifications_dlq_current", DLQ_COUNT, AtomicLong::get)
                .description("Current DLQ size")
                .register(registry);
    }

    @Bean
    public Timer emailProviderLatency(MeterRegistry registry) {
        return Timer.builder("provider_latency_seconds")
                .description("Provider response latency")
                .tag("channel", "EMAIL")
                .publishPercentiles(0.5, 0.95, 0.99)
                .register(registry);
    }

    @Bean
    public Timer smsProviderLatency(MeterRegistry registry) {
        return Timer.builder("provider_latency_seconds")
                .description("Provider response latency")
                .tag("channel", "SMS")
                .publishPercentiles(0.5, 0.95, 0.99)
                .register(registry);
    }

    @Bean
    public Timer pushProviderLatency(MeterRegistry registry) {
        return Timer.builder("provider_latency_seconds")
                .description("Provider response latency")
                .tag("channel", "PUSH")
                .publishPercentiles(0.5, 0.95, 0.99)
                .register(registry);
    }
}