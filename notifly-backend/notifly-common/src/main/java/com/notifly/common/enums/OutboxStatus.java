package com.notifly.common.enums;

public enum OutboxStatus {
    PENDING("pending"),
    SENT("sent"),
    FAILED("failed");

    private final String code;

    OutboxStatus(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    public static OutboxStatus fromCode(String code) {
        for (OutboxStatus status : values()) {
            if (status.code.equalsIgnoreCase(code)) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown outbox status: " + code);
    }
}
