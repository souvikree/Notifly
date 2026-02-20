-- NOTIFLY Production Schema - Complete multi-tenant architecture
-- PostgreSQL 14+ with UUID support
-- Implements idempotency, transactional outbox, and retry tracking

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tenants table (multi-tenancy root)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- API Keys with bcrypt hashing
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(50) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'SERVICE' CHECK (role IN ('ADMIN', 'SERVICE')),
    revoked BOOLEAN DEFAULT FALSE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT unique_api_key_prefix UNIQUE(tenant_id, key_prefix)
);

-- Admin Users with password hashing
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN', 'SERVICE')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_admin_email UNIQUE(tenant_id, email)
);

-- Main notification requests (idempotency enforcement)
CREATE TABLE IF NOT EXISTS notification_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    idempotency_key VARCHAR(255),
    payload JSONB NOT NULL,
    payload_hash VARCHAR(255),
    status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'PROCESSING', 'SENT', 'FAILED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_request UNIQUE(tenant_id, request_id),
    CONSTRAINT unique_idempotency UNIQUE(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
);

-- Transactional Outbox (guarantees zero message loss)
CREATE TABLE IF NOT EXISTS notification_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    aggregate_id UUID NOT NULL,
    event_payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    retry_count INT DEFAULT 0,
    last_error VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE
);

-- Notification Logs (per-channel delivery tracking with retry)
CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('EMAIL', 'SMS', 'PUSH')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'RETRYING')),
    retry_attempt INT NOT NULL DEFAULT 1,
    error_message VARCHAR(500),
    provider_latency_ms BIGINT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_delivery UNIQUE(tenant_id, request_id, channel, retry_attempt)
);

-- Dead Letter Queue (failed notifications)
CREATE TABLE IF NOT EXISTS failed_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    channel VARCHAR(50) NOT NULL,
    error_code VARCHAR(50),
    error_details JSONB,
    max_retries_exceeded BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Notification Templates with versioning
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('EMAIL', 'SMS', 'PUSH')),
    subject VARCHAR(255),
    content TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_template UNIQUE(tenant_id, name, version)
);

-- Event Channel Policy (configurable fallback order)
CREATE TABLE IF NOT EXISTS event_channel_policy (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    fallback_order JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_policy UNIQUE(tenant_id, event_type)
);

-- Retry Policy Configuration (per tenant + event type)
CREATE TABLE IF NOT EXISTS retry_policy (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    max_attempts INT NOT NULL DEFAULT 5,
    initial_delay_ms BIGINT NOT NULL DEFAULT 1000,
    backoff_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.5,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_retry UNIQUE(tenant_id, event_type)
);

-- Rate Limit Configuration (per tenant)
CREATE TABLE IF NOT EXISTS rate_limit_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    requests_per_minute INT NOT NULL DEFAULT 1000,
    burst_limit INT NOT NULL DEFAULT 5000,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- User Channel Preferences
CREATE TABLE IF NOT EXISTS user_channel_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('EMAIL', 'SMS', 'PUSH')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_preference UNIQUE(tenant_id, user_id, channel)
);

-- Admin Audit Logs
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    action VARCHAR(255) NOT NULL,
    user_id UUID,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES FOR PERFORMANCE
-- API Keys
CREATE INDEX idx_api_key_tenant ON api_keys(tenant_id);
CREATE INDEX idx_api_key_prefix ON api_keys(key_prefix);

-- Admin Users
CREATE INDEX idx_admin_tenant ON admin_users(tenant_id);
CREATE INDEX idx_admin_tenant_email ON admin_users(tenant_id, email);

-- Notification Requests
CREATE INDEX idx_request_tenant ON notification_requests(tenant_id);
CREATE INDEX idx_request_tenant_request_id ON notification_requests(tenant_id, request_id);
CREATE INDEX idx_request_created ON notification_requests(created_at DESC);
CREATE INDEX idx_request_payload ON notification_requests USING GIN(payload);

-- Outbox (critical for polling)
CREATE INDEX idx_outbox_tenant_status ON notification_outbox(tenant_id, status);
CREATE INDEX idx_outbox_status_created ON notification_outbox(status, created_at) WHERE status = 'PENDING';

-- Notification Logs
CREATE INDEX idx_log_tenant ON notification_logs(tenant_id);
CREATE INDEX idx_log_request_channel ON notification_logs(tenant_id, request_id, channel);
CREATE INDEX idx_log_status ON notification_logs(status);
CREATE INDEX idx_log_created ON notification_logs(created_at DESC);

-- Failed Notifications (DLQ)
CREATE INDEX idx_failed_tenant ON failed_notifications(tenant_id);
CREATE INDEX idx_failed_created ON failed_notifications(created_at DESC);

-- Templates
CREATE INDEX idx_template_tenant ON notification_templates(tenant_id);
CREATE INDEX idx_template_active ON notification_templates(active);

-- Policies
CREATE INDEX idx_policy_tenant ON event_channel_policy(tenant_id);
CREATE INDEX idx_retry_tenant ON retry_policy(tenant_id);
CREATE INDEX idx_rate_limit_tenant ON rate_limit_config(tenant_id);

-- Preferences
CREATE INDEX idx_preference_tenant ON user_channel_preferences(tenant_id);

-- Audit
CREATE INDEX idx_audit_tenant ON admin_audit_logs(tenant_id);
CREATE INDEX idx_audit_created ON admin_audit_logs(created_at DESC);

