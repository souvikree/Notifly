package com.notifly.common.util;

import java.util.UUID;

/**
 * Thread-local utility for managing correlation IDs across async operations
 * Ensures traceability from API request through Kafka to worker processing
 */
public class CorrelationIdUtil {
    private static final ThreadLocal<String> correlationId = new ThreadLocal<>();

    public static void setCorrelationId(String id) {
        correlationId.set(id);
    }

    public static String getCorrelationId() {
        String id = correlationId.get();
        if (id == null) {
            id = UUID.randomUUID().toString();
            correlationId.set(id);
        }
        return id;
    }

    public static void clear() {
        correlationId.remove();
    }

    public static String generateNewCorrelationId() {
        String id = UUID.randomUUID().toString();
        setCorrelationId(id);
        return id;
    }
}
