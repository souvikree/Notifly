package com.notifly.worker.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

/**
 * Prometheus metrics for the Notifly Worker.
 *
 * NEW FILE: Original worker emitted no metrics at all.
 * The API service had a MetricsConfig but worker had nothing.
 * These counters power the Grafana dashboard.
 *
 * Metrics exposed:
 *  - notifications_sent_total{channel}        — successful deliveries
 *  - notifications_failed_total{channel}      — failed deliveries
 *  - notifications_dlq_total{channel}         — messages moved to DLQ
 *  - notifications_retry_total{channel,attempt} — retry attempts
 *  - notification_processing_seconds          — end-to-end processing time
 */
@Component
public class NotificationMetrics {

    private final MeterRegistry registry;

    public NotificationMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    /**
     * Increment sent counter for a channel.
     * Used when a notification is successfully delivered.
     */
    public void incrementSent(String channel) {
        Counter.builder("notifications_sent_total")
                .tag("channel", normalizeChannel(channel))
                .description("Total notifications sent successfully")
                .register(registry)
                .increment();
    }

    /**
     * Increment failed counter for a channel.
     * Used when all retry attempts for a channel fail.
     */
    public void incrementFailed(String channel) {
        Counter.builder("notifications_failed_total")
                .tag("channel", normalizeChannel(channel))
                .description("Total notifications failed after all retries")
                .register(registry)
                .increment();
    }

    /**
     * Increment DLQ counter.
     * Used when a message reaches the dead letter queue.
     */
    public void incrementDlq(String channel) {
        Counter.builder("notifications_dlq_total")
                .tag("channel", normalizeChannel(channel))
                .description("Total notifications moved to DLQ")
                .register(registry)
                .increment();
    }

    /**
     * Increment retry counter for a specific attempt.
     */
    public void incrementRetry(String channel, int attemptNumber) {
        Counter.builder("notifications_retry_total")
                .tag("channel", normalizeChannel(channel))
                .tag("attempt", String.valueOf(attemptNumber))
                .description("Total notification retry attempts")
                .register(registry)
                .increment();
    }

    /**
     * Record provider latency for a channel.
     * Used to track how long the actual send call takes.
     */
    public void recordProviderLatency(String channel, long latencyMs) {
        registry.timer("notification_provider_latency_ms",
                "channel", normalizeChannel(channel))
                .record(latencyMs, java.util.concurrent.TimeUnit.MILLISECONDS);
    }

    /**
     * Get a timer to record end-to-end processing time.
     * Usage: try (Timer.Sample sample = metrics.startProcessingTimer()) { ... }
     */
    public Timer.Sample startProcessingTimer() {
        return Timer.start(registry);
    }

    public void stopProcessingTimer(Timer.Sample sample, String channel, boolean success) {
        sample.stop(Timer.builder("notification_processing_seconds")
                .tag("channel", normalizeChannel(channel))
                .tag("success", String.valueOf(success))
                .description("End-to-end notification processing time")
                .register(registry));
    }

    private String normalizeChannel(String channel) {
        if (channel == null || channel.isBlank()) return "UNKNOWN";
        // Handle comma-separated channels (when multiple channels were attempted)
        return channel.split(",")[0].trim().toUpperCase();
    }
}
