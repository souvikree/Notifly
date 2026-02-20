package com.notifly.common.enums;

public enum NotificationStatus {
    PENDING("pending"),
    ACCEPTED("accepted"),
    SENT("sent"),
    FAILED("failed"),
    RETRYING("retrying");

    private final String code;

    NotificationStatus(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    public static NotificationStatus fromCode(String code) {
        for (NotificationStatus status : values()) {
            if (status.code.equalsIgnoreCase(code)) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown status: " + code);
    }
}
