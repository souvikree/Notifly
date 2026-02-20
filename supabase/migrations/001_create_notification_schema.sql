-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create tenants table (root for multi-tenancy)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create API keys table with bcrypt hashing
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(50) NOT NULL,
  display_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'SERVICE' CHECK (role IN ('ADMIN', 'SERVICE')),
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_api_key UNIQUE(tenant_id, key_prefix)
);

-- Create admin users table
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN', 'EDITOR', 'VIEWER')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_admin_email UNIQUE(tenant_id, email)
);

-- Main notification requests table with idempotency enforcement
CREATE TABLE IF NOT EXISTS notification_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  idempotency_key VARCHAR(255),
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  payload_hash VARCHAR(255),
  status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'PROCESSING', 'SENT', 'FAILED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_request UNIQUE(tenant_id, request_id),
  CONSTRAINT unique_idempotency UNIQUE(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
);

-- Transactional outbox table for guaranteed message delivery
CREATE TABLE IF NOT EXISTS notification_outbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  aggregate_id UUID NOT NULL,
  event_payload JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  retry_count INT DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP WITH TIME ZONE
);

-- Notification logs table for per-channel delivery tracking
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  channel VARCHAR(50) NOT NULL CHECK (channel IN ('EMAIL', 'SMS', 'PUSH', 'WEBHOOK')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'RETRYING')),
  retry_attempt INT NOT NULL DEFAULT 1,
  provider_latency_ms BIGINT,
  error_message TEXT,
  error_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_delivery UNIQUE(tenant_id, request_id, channel, retry_attempt)
);

-- Retry attempts tracking table
CREATE TABLE IF NOT EXISTS retry_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  notification_log_id UUID NOT NULL REFERENCES notification_logs(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  error_code VARCHAR(100),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Failed notifications (Dead Letter Queue)
CREATE TABLE IF NOT EXISTS failed_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  channel VARCHAR(50) NOT NULL,
  error_code VARCHAR(100),
  error_details JSONB,
  notification_log_id UUID REFERENCES notification_logs(id) ON DELETE SET NULL,
  manual_retry_attempted BOOLEAN DEFAULT FALSE,
  manual_retry_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notification templates with versioning
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  channel VARCHAR(50) NOT NULL CHECK (channel IN ('EMAIL', 'SMS', 'PUSH', 'WEBHOOK')),
  subject VARCHAR(500),
  content TEXT NOT NULL,
  variables JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  CONSTRAINT unique_template UNIQUE(tenant_id, name, version)
);

-- Event to channel fallback policy
CREATE TABLE IF NOT EXISTS event_channel_policy (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  fallback_order JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_policy UNIQUE(tenant_id, event_type)
);

-- Retry policy configuration per tenant and event type
CREATE TABLE IF NOT EXISTS retry_policy (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  max_attempts INT NOT NULL DEFAULT 5,
  initial_delay_ms BIGINT NOT NULL DEFAULT 1000,
  max_delay_ms BIGINT NOT NULL DEFAULT 60000,
  backoff_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_retry_policy UNIQUE(tenant_id, event_type)
);

-- Rate limit configuration per tenant
CREATE TABLE IF NOT EXISTS rate_limit_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  requests_per_minute INT NOT NULL DEFAULT 1000,
  requests_per_hour INT NOT NULL DEFAULT 50000,
  burst_limit INT NOT NULL DEFAULT 5000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User channel preferences
CREATE TABLE IF NOT EXISTS user_channel_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  channel VARCHAR(50) NOT NULL CHECK (channel IN ('EMAIL', 'SMS', 'PUSH', 'WEBHOOK')),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_preference UNIQUE(tenant_id, user_id, channel)
);

-- Admin audit logs for compliance
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  changes JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance optimization

-- API Keys indexes
CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_tenant_prefix ON api_keys(tenant_id, key_prefix);

-- Admin users indexes
CREATE INDEX idx_admin_users_tenant ON admin_users(tenant_id);
CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_tenant_email ON admin_users(tenant_id, email);

-- Notification requests indexes
CREATE INDEX idx_notification_requests_tenant ON notification_requests(tenant_id);
CREATE INDEX idx_notification_requests_request_id ON notification_requests(request_id);
CREATE INDEX idx_notification_requests_tenant_request_id ON notification_requests(tenant_id, request_id);
CREATE INDEX idx_notification_requests_created ON notification_requests(created_at DESC);
CREATE INDEX idx_notification_requests_status ON notification_requests(status);
CREATE INDEX idx_notification_requests_payload ON notification_requests USING GIN(payload);

-- Outbox indexes (critical for polling)
CREATE INDEX idx_notification_outbox_status ON notification_outbox(status);
CREATE INDEX idx_notification_outbox_tenant_status ON notification_outbox(tenant_id, status);
CREATE INDEX idx_notification_outbox_pending_created ON notification_outbox(created_at) WHERE status = 'PENDING';

-- Notification logs indexes
CREATE INDEX idx_notification_logs_tenant ON notification_logs(tenant_id);
CREATE INDEX idx_notification_logs_request_id ON notification_logs(request_id);
CREATE INDEX idx_notification_logs_tenant_request_id ON notification_logs(tenant_id, request_id);
CREATE INDEX idx_notification_logs_channel ON notification_logs(channel);
CREATE INDEX idx_notification_logs_status ON notification_logs(status);
CREATE INDEX idx_notification_logs_created ON notification_logs(created_at DESC);
CREATE INDEX idx_notification_logs_composite ON notification_logs(tenant_id, request_id, channel, retry_attempt);

-- Retry attempts indexes
CREATE INDEX idx_retry_attempts_tenant ON retry_attempts(tenant_id);
CREATE INDEX idx_retry_attempts_next_retry ON retry_attempts(next_retry_at) WHERE next_retry_at IS NOT NULL;

-- Failed notifications indexes
CREATE INDEX idx_failed_notifications_tenant ON failed_notifications(tenant_id);
CREATE INDEX idx_failed_notifications_created ON failed_notifications(created_at DESC);
CREATE INDEX idx_failed_notifications_channel ON failed_notifications(channel);

-- Templates indexes
CREATE INDEX idx_notification_templates_tenant ON notification_templates(tenant_id);
CREATE INDEX idx_notification_templates_name ON notification_templates(name);
CREATE INDEX idx_notification_templates_active ON notification_templates(is_active);

-- Policies indexes
CREATE INDEX idx_event_channel_policy_tenant ON event_channel_policy(tenant_id);
CREATE INDEX idx_retry_policy_tenant ON retry_policy(tenant_id);

-- User preferences indexes
CREATE INDEX idx_user_channel_preferences_tenant ON user_channel_preferences(tenant_id);
CREATE INDEX idx_user_channel_preferences_user_id ON user_channel_preferences(user_id);

-- Audit logs indexes
CREATE INDEX idx_admin_audit_logs_tenant ON admin_audit_logs(tenant_id);
CREATE INDEX idx_admin_audit_logs_created ON admin_audit_logs(created_at DESC);
CREATE INDEX idx_admin_audit_logs_action ON admin_audit_logs(action);

-- Enable Row Level Security
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE failed_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_channel_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE retry_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_channel_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE retry_attempts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tenant isolation
CREATE POLICY "Tenants are isolated by ID" ON tenants
  FOR ALL USING (auth.uid()::text = id::text OR auth.role() = 'authenticated');

CREATE POLICY "API keys isolated by tenant" ON api_keys
  FOR ALL USING (tenant_id = auth.uid()::uuid OR auth.role() = 'service_role');

CREATE POLICY "Notification requests isolated by tenant" ON notification_requests
  FOR ALL USING (tenant_id = auth.uid()::uuid OR auth.role() = 'service_role');

CREATE POLICY "Notification logs isolated by tenant" ON notification_logs
  FOR ALL USING (tenant_id = auth.uid()::uuid OR auth.role() = 'service_role');

CREATE POLICY "Failed notifications isolated by tenant" ON failed_notifications
  FOR ALL USING (tenant_id = auth.uid()::uuid OR auth.role() = 'service_role');

-- Views for common queries
CREATE VIEW v_notification_stats AS
SELECT 
  tenant_id,
  COUNT(*) as total_notifications,
  SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) as sent_count,
  SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_count,
  AVG(CASE WHEN provider_latency_ms IS NOT NULL THEN provider_latency_ms ELSE NULL END) as avg_latency_ms
FROM notification_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY tenant_id;

CREATE VIEW v_failed_notification_summary AS
SELECT 
  tenant_id,
  channel,
  error_code,
  COUNT(*) as failure_count,
  MAX(created_at) as last_failure_at
FROM failed_notifications
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY tenant_id, channel, error_code;
