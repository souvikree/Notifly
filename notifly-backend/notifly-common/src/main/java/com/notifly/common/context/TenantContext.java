package com.notifly.common.context;

import com.notifly.common.exception.TenantException;
import lombok.extern.slf4j.Slf4j;

import java.util.UUID;

@Slf4j
public class TenantContext {
    private static final ThreadLocal<UUID> tenantIdHolder = new ThreadLocal<>();

    public static void setTenantId(UUID tenantId) {
        if (tenantId == null) {
            throw new TenantException("Tenant ID cannot be null");
        }
        tenantIdHolder.set(tenantId);
    }

    public static UUID getTenantId() {
        UUID tenantId = tenantIdHolder.get();
        if (tenantId == null) {
            throw new TenantException("No tenant context found in current thread");
        }
        return tenantId;
    }

    public static UUID getTenantIdOptional() {
        return tenantIdHolder.get();
    }

    public static boolean isSet() {
        return tenantIdHolder.get() != null;
    }

    public static void clear() {
        tenantIdHolder.remove();
    }
}
