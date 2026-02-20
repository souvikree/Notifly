package com.notifly.common.enums;

public enum NotificationChannel {
    EMAIL,
    SMS,
    PUSH_NOTIFICATION,
    WEBHOOK,
    IN_APP;

    public static boolean isValid(String channel) {
        try {
            NotificationChannel.valueOf(channel.toUpperCase());
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
