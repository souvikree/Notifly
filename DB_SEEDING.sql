/**
 * Database Seeding Guide - Notifly Authentication System
 * 
 * This guide provides SQL commands to set up initial data for testing
 * the authentication system in development or production.
 * 
 * Execute this in your Supabase SQL Editor or psql console
 */

-- ============================================================
-- STEP 1: Create a test tenant
-- ============================================================

INSERT INTO tenants (name, slug)
VALUES (
  'Demo Tenant',
  'demo-tenant'
) RETURNING id;

-- Copy the returned tenant ID - you'll need it for user creation
-- Example: 550e8400-e29b-41d4-a716-446655440000

-- ============================================================
-- STEP 2: Create admin users for the tenant
-- ============================================================

-- First, generate a password hash. Run this in Node.js:
-- 
-- import crypto from 'crypto';
-- 
-- function hashPassword(password) {
--   return new Promise((resolve, reject) => {
--     const salt = crypto.randomBytes(16).toString('hex');
--     crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
--       if (err) reject(err);
--       resolve(`${salt}:${derivedKey.toString('hex')}`);
--     });
--   });
-- }
-- 
-- // For password: AdminPassword123!
-- hashPassword('AdminPassword123!').then(hash => console.log(hash));
-- 
-- Then copy the hash and use it below.

INSERT INTO admin_users (
  tenant_id,
  email,
  password_hash,
  first_name,
  last_name,
  role,
  is_active
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000'::uuid, -- Replace with your tenant ID
  'admin@example.com',
  '5f4dcc3b5aa765d61d8327deb882cf99:a1c8e1b0c8f0a1b2c3d4e5f6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9x0y1z2', -- Replace with generated hash
  'Admin',
  'User',
  'ADMIN',
  true
) RETURNING id;

-- Create editor user
INSERT INTO admin_users (
  tenant_id,
  email,
  password_hash,
  first_name,
  last_name,
  role,
  is_active
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'editor@example.com',
  '5f4dcc3b5aa765d61d8327deb882cf99:a1c8e1b0c8f0a1b2c3d4e5f6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9x0y1z2', -- Same hash for testing
  'Editor',
  'User',
  'EDITOR',
  true
) RETURNING id;

-- Create viewer user
INSERT INTO admin_users (
  tenant_id,
  email,
  password_hash,
  first_name,
  last_name,
  role,
  is_active
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'viewer@example.com',
  '5f4dcc3b5aa765d61d8327deb882cf99:a1c8e1b0c8f0a1b2c3d4e5f6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9x0y1z2',
  'Viewer',
  'User',
  'VIEWER',
  true
) RETURNING id;

-- ============================================================
-- STEP 3: Set up rate limiting for the tenant
-- ============================================================

INSERT INTO rate_limit_config (
  tenant_id,
  requests_per_minute,
  requests_per_hour,
  burst_limit
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  1000,  -- 1000 requests per minute
  50000, -- 50000 requests per hour
  5000   -- 5000 burst limit
);

-- ============================================================
-- STEP 4: Set up retry policies
-- ============================================================

INSERT INTO retry_policy (
  tenant_id,
  event_type,
  max_attempts,
  initial_delay_ms,
  max_delay_ms,
  backoff_multiplier
) VALUES
  (
    '550e8400-e29b-41d4-a716-446655440000'::uuid,
    'user.signup',
    5,
    1000,
    60000,
    1.5
  ),
  (
    '550e8400-e29b-41d4-a716-446655440000'::uuid,
    'user.password_reset',
    3,
    500,
    30000,
    2.0
  ),
  (
    '550e8400-e29b-41d4-a716-446655440000'::uuid,
    'order.confirmation',
    5,
    1000,
    60000,
    1.5
  );

-- ============================================================
-- STEP 5: Set up channel policies
-- ============================================================

INSERT INTO event_channel_policy (
  tenant_id,
  event_type,
  fallback_order
) VALUES
  (
    '550e8400-e29b-41d4-a716-446655440000'::uuid,
    'user.signup',
    '["EMAIL", "SMS", "PUSH"]'::jsonb
  ),
  (
    '550e8400-e29b-41d4-a716-446655440000'::uuid,
    'user.password_reset',
    '["EMAIL"]'::jsonb
  ),
  (
    '550e8400-e29b-41d4-a716-446655440000'::uuid,
    'order.confirmation',
    '["EMAIL", "SMS", "PUSH"]'::jsonb
  );

-- ============================================================
-- STEP 6: Create notification templates
-- ============================================================

INSERT INTO notification_templates (
  tenant_id,
  name,
  channel,
  subject,
  content,
  is_active
) VALUES
  (
    '550e8400-e29b-41d4-a716-446655440000'::uuid,
    'welcome_email',
    'EMAIL',
    'Welcome to {{app_name}}!',
    'Hi {{first_name}},\n\nWelcome to {{app_name}}! We''re excited to have you on board.\n\nBest regards,\nThe {{app_name}} Team',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440000'::uuid,
    'password_reset',
    'EMAIL',
    'Reset your {{app_name}} password',
    'Hi {{first_name}},\n\nClick here to reset your password: {{reset_link}}\n\nThis link expires in 24 hours.\n\nBest regards,\nThe {{app_name}} Team',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440000'::uuid,
    'order_confirmation',
    'EMAIL',
    'Your order #{{order_id}} has been confirmed',
    'Hi {{customer_name}},\n\nThank you for your order!\n\nOrder #: {{order_id}}\nTotal: {{total_amount}}\n\nTrack your order: {{tracking_link}}\n\nBest regards,\nThe Sales Team',
    true
  );

-- ============================================================
-- STEP 7: Set up user channel preferences
-- ============================================================

INSERT INTO user_channel_preferences (
  tenant_id,
  user_id,
  channel,
  is_enabled
) VALUES
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'user-123', 'EMAIL', true),
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'user-123', 'SMS', true),
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'user-123', 'PUSH', false),
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'user-456', 'EMAIL', true),
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'user-456', 'SMS', false),
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'user-456', 'PUSH', true);

-- ============================================================
-- STEP 8: Verify setup
-- ============================================================

-- Check tenants
SELECT id, name, slug, created_at FROM tenants;

-- Check admin users
SELECT id, email, first_name, last_name, role, is_active, created_at 
FROM admin_users 
WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000'::uuid;

-- Check rate limit config
SELECT * FROM rate_limit_config 
WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000'::uuid;

-- Check retry policies
SELECT event_type, max_attempts, initial_delay_ms, backoff_multiplier 
FROM retry_policy 
WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000'::uuid;

-- Check event channel policies
SELECT event_type, fallback_order 
FROM event_channel_policy 
WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000'::uuid;

-- Check templates
SELECT name, channel, subject, is_active 
FROM notification_templates 
WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000'::uuid;

-- ============================================================
-- STEP 9: Testing Authentication (Optional)
-- ============================================================

-- After seeding, test login with:
-- Email: admin@example.com
-- Password: AdminPassword123! (or whatever you set)
-- Tenant ID: 550e8400-e29b-41d4-a716-446655440000

-- View audit logs to see authentication events
SELECT id, action, user_id, resource_type, created_at 
FROM admin_audit_logs 
WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000'::uuid 
ORDER BY created_at DESC 
LIMIT 20;

-- ============================================================
-- CLEANUP (If needed)
-- ============================================================

-- WARNING: This will delete ALL data for the tenant!
-- Only run if you want to completely reset:

-- DELETE FROM admin_audit_logs WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000'::uuid;
-- DELETE FROM user_channel_preferences WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000'::uuid;
-- DELETE FROM notification_templates WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000'::uuid;
-- DELETE FROM event_channel_policy WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000'::uuid;
-- DELETE FROM retry_policy WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000'::uuid;
-- DELETE FROM rate_limit_config WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000'::uuid;
-- DELETE FROM admin_users WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000'::uuid;
-- DELETE FROM tenants WHERE id = '550e8400-e29b-41d4-a716-446655440000'::uuid;
