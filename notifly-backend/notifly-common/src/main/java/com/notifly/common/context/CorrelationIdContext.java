package com.notifly.common.context;

import lombok.extern.slf4j.Slf4j;

import java.util.UUID;

@Slf4j
public class CorrelationIdContext {
    private static final ThreadLocal<String> correlationIdHolder = new ThreadLocal<>();

    public static void setCorrelationId(String correlationId) {
        correlationIdHolder.set(correlationId);
    }

    public static String getCorrelationId() {
        String correlationId = correlationIdHolder.get();
        if (correlationId == null) {
            correlationId = generateCorrelationId();
            correlationIdHolder.set(correlationId);
        }
        return correlationId;
    }

    public static String generateCorrelationId() {
        return UUID.randomUUID().toString();
    }

    public static void clear() {
        correlationIdHolder.remove();
    }
}
