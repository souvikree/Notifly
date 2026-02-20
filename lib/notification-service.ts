import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { publishNotification, getRetryTopic, KAFKA_TOPICS, KafkaMessageHeaders, parseKafkaHeaders } from './kafka';
import Redis from 'ioredis';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'public' } }
);

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
});

// Error codes for standardized error handling
export enum NotificationErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  IDEMPOTENT_CONFLICT = 'IDEMPOTENT_CONFLICT',
  CHANNEL_DISABLED = 'CHANNEL_DISABLED',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',
  INVALID_API_KEY = 'INVALID_API_KEY',
  DELIVERY_FAILED = 'DELIVERY_FAILED',
  RETRY_EXHAUSTED = 'RETRY_EXHAUSTED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface NotificationError {
  code: NotificationErrorCode;
  message: string;
  retryable: boolean;
  statusCode: number;
}

export const ERROR_MAP: Record<NotificationErrorCode, NotificationError> = {
  [NotificationErrorCode.VALIDATION_FAILED]: {
    code: NotificationErrorCode.VALIDATION_FAILED,
    message: 'Validation failed',
    retryable: false,
    statusCode: 400,
  },
  [NotificationErrorCode.RATE_LIMIT_EXCEEDED]: {
    code: NotificationErrorCode.RATE_LIMIT_EXCEEDED,
    message: 'Rate limit exceeded',
    retryable: true,
    statusCode: 429,
  },
  [NotificationErrorCode.IDEMPOTENT_CONFLICT]: {
    code: NotificationErrorCode.IDEMPOTENT_CONFLICT,
    message: 'Duplicate request with same idempotency key',
    retryable: false,
    statusCode: 409,
  },
  [NotificationErrorCode.CHANNEL_DISABLED]: {
    code: NotificationErrorCode.CHANNEL_DISABLED,
    message: 'Channel is disabled for this user',
    retryable: false,
    statusCode: 400,
  },
  [NotificationErrorCode.TEMPLATE_NOT_FOUND]: {
    code: NotificationErrorCode.TEMPLATE_NOT_FOUND,
    message: 'Notification template not found',
    retryable: false,
    statusCode: 404,
  },
  [NotificationErrorCode.TENANT_NOT_FOUND]: {
    code: NotificationErrorCode.TENANT_NOT_FOUND,
    message: 'Tenant not found',
    retryable: false,
    statusCode: 404,
  },
  [NotificationErrorCode.INVALID_API_KEY]: {
    code: NotificationErrorCode.INVALID_API_KEY,
    message: 'Invalid or revoked API key',
    retryable: false,
    statusCode: 401,
  },
  [NotificationErrorCode.DELIVERY_FAILED]: {
    code: NotificationErrorCode.DELIVERY_FAILED,
    message: 'Failed to deliver notification',
    retryable: true,
    statusCode: 502,
  },
  [NotificationErrorCode.RETRY_EXHAUSTED]: {
    code: NotificationErrorCode.RETRY_EXHAUSTED,
    message: 'Maximum retry attempts exceeded',
    retryable: false,
    statusCode: 500,
  },
  [NotificationErrorCode.INTERNAL_ERROR]: {
    code: NotificationErrorCode.INTERNAL_ERROR,
    message: 'Internal server error',
    retryable: true,
    statusCode: 500,
  },
};

// Rate limiting helper
export async function checkRateLimit(tenantId: string): Promise<boolean> {
  try {
    const config = await supabase
      .from('rate_limit_config')
      .select('requests_per_minute, requests_per_hour, burst_limit')
      .eq('tenant_id', tenantId)
      .single();

    if (!config.data) {
      // Default limits
      return true;
    }

    const { requests_per_minute, requests_per_hour, burst_limit } = config.data;
    const key = `ratelimit:${tenantId}`;
    
    const current = await redis.incr(`${key}:minute`);
    if (current === 1) {
      await redis.expire(`${key}:minute`, 60);
    }

    if (current > requests_per_minute) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Rate limit check error:', error);
    return true; // Fail open on Redis error
  }
}

// Idempotency checker
export async function checkIdempotency(
  tenantId: string,
  idempotencyKey: string
): Promise<{ exists: boolean; requestId?: string }> {
  const result = await supabase
    .from('notification_requests')
    .select('request_id')
    .eq('tenant_id', tenantId)
    .eq('idempotency_key', idempotencyKey)
    .single();

  if (result.data) {
    return { exists: true, requestId: result.data.request_id };
  }

  return { exists: false };
}

// Generate payload hash for duplicate detection
export function generatePayloadHash(payload: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

// API key verification with caching
export async function verifyApiKey(keyPrefix: string, keyHash: string): Promise<{ tenantId: string } | null> {
  try {
    // Check Redis cache first
    const cached = await redis.get(`apikey:${keyPrefix}`);
    if (cached) {
      const { tenantId, hash } = JSON.parse(cached);
      if (hash === keyHash) {
        return { tenantId };
      }
    }

    // Query database
    const result = await supabase
      .from('api_keys')
      .select('tenant_id, key_hash')
      .eq('key_prefix', keyPrefix)
      .eq('revoked', false)
      .single();

    if (!result.data) {
      return null;
    }

    const { tenant_id, key_hash } = result.data;
    
    // Verify hash matches
    const isValid = await verifyKeyHash(keyHash, key_hash);
    if (!isValid) {
      return null;
    }

    // Cache for 1 hour
    await redis.setex(`apikey:${keyPrefix}`, 3600, JSON.stringify({ tenantId: tenant_id, hash: key_hash }));
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_prefix', keyPrefix);

    return { tenantId: tenant_id };
  } catch (error) {
    console.error('API key verification error:', error);
    return null;
  }
}

// Simplified hash verification (use bcrypt in production)
async function verifyKeyHash(provided: string, stored: string): Promise<boolean> {
  // In production, use bcrypt: const match = await bcrypt.compare(provided, stored);
  return provided === stored;
}

// Transactional outbox pattern implementation
export async function insertNotificationWithOutbox(
  tenantId: string,
  requestId: string,
  eventType: string,
  payload: any,
  idempotencyKey?: string,
  userId?: string
) {
  try {
    // Check idempotency first
    if (idempotencyKey) {
      const { exists, requestId: existingId } = await checkIdempotency(tenantId, idempotencyKey);
      if (exists) {
        throw {
          code: NotificationErrorCode.IDEMPOTENT_CONFLICT,
          message: `Duplicate request: ${existingId}`,
          retryable: false,
          statusCode: 409,
        };
      }
    }

    // Use transaction
    const payloadHash = generatePayloadHash(payload);

    // Insert into notification_requests
    const { error: reqError } = await supabase
      .from('notification_requests')
      .insert({
        tenant_id: tenantId,
        request_id: requestId,
        idempotency_key: idempotencyKey,
        event_type: eventType,
        payload,
        payload_hash: payloadHash,
        status: 'ACCEPTED',
      });

    if (reqError) throw reqError;

    // Insert into outbox for guaranteed delivery
    const { error: outboxError } = await supabase
      .from('notification_outbox')
      .insert({
        tenant_id: tenantId,
        aggregate_id: requestId,
        event_payload: {
          requestId,
          eventType,
          payload,
          userId,
          timestamp: Date.now(),
        },
        status: 'PENDING',
        retry_count: 0,
      });

    if (outboxError) throw outboxError;

    // Audit log
    await logAuditEvent(tenantId, 'NOTIFICATION_CREATED', 'notification_request', requestId, { eventType, userId });

    return { requestId };
  } catch (error) {
    console.error('Error inserting notification:', error);
    throw error;
  }
}

// Channel fallback logic
export async function getChannelFallbackOrder(
  tenantId: string,
  eventType: string
): Promise<string[]> {
  try {
    const result = await supabase
      .from('event_channel_policy')
      .select('fallback_order')
      .eq('tenant_id', tenantId)
      .eq('event_type', eventType)
      .single();

    if (result.data) {
      return result.data.fallback_order;
    }

    // Default fallback order
    return ['EMAIL', 'SMS', 'PUSH', 'WEBHOOK'];
  } catch (error) {
    console.error('Error fetching fallback order:', error);
    return ['EMAIL', 'SMS', 'PUSH', 'WEBHOOK'];
  }
}

// Get retry policy
export async function getRetryPolicy(
  tenantId: string,
  eventType: string
) {
  try {
    const result = await supabase
      .from('retry_policy')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('event_type', eventType)
      .single();

    if (result.data) {
      return result.data;
    }

    // Default policy
    return {
      max_attempts: 5,
      initial_delay_ms: 1000,
      max_delay_ms: 60000,
      backoff_multiplier: 1.5,
    };
  } catch (error) {
    console.error('Error fetching retry policy:', error);
    return {
      max_attempts: 5,
      initial_delay_ms: 1000,
      max_delay_ms: 60000,
      backoff_multiplier: 1.5,
    };
  }
}

// Log delivery attempt
export async function logDeliveryAttempt(
  tenantId: string,
  requestId: string,
  channel: string,
  status: 'SENT' | 'FAILED' | 'PENDING' | 'RETRYING',
  attempt: number,
  latencyMs?: number,
  errorMessage?: string,
  errorDetails?: any
) {
  try {
    const result = await supabase
      .from('notification_logs')
      .insert({
        tenant_id: tenantId,
        request_id: requestId,
        channel,
        status,
        retry_attempt: attempt,
        provider_latency_ms: latencyMs,
        error_message: errorMessage,
        error_details: errorDetails,
      });

    if (status === 'FAILED' && !errorMessage?.includes('retrying')) {
      // Move to DLQ
      await supabase
        .from('failed_notifications')
        .insert({
          tenant_id: tenantId,
          request_id: requestId,
          channel,
          error_code: errorDetails?.code,
          error_details: errorDetails,
        });
    }

    return result;
  } catch (error) {
    console.error('Error logging delivery:', error);
  }
}

// Process notification with worker pattern
export async function processNotificationMessage(
  message: any,
  headers: KafkaMessageHeaders
) {
  const { correlationId, tenantId, retryCount, originalTopic, requestId } = headers;

  try {
    // Get retry policy
    const retryPolicy = await getRetryPolicy(tenantId, message.eventType);

    // Get channel fallback order
    const channels = await getChannelFallbackOrder(tenantId, message.eventType);

    // Process each channel
    for (const channel of channels) {
      try {
        // Check if channel is enabled for user
        const pref = await supabase
          .from('user_channel_preferences')
          .select('is_enabled')
          .eq('tenant_id', tenantId)
          .eq('user_id', message.userId)
          .eq('channel', channel)
          .single();

        if (pref.data && !pref.data.is_enabled) {
          console.log(`Channel ${channel} disabled for user ${message.userId}`);
          continue;
        }

        // Attempt delivery (this would call actual channel providers)
        const startTime = Date.now();
        await deliverToChannel(tenantId, requestId, channel, message);
        const latency = Date.now() - startTime;

        // Log success
        await logDeliveryAttempt(tenantId, requestId, channel, 'SENT', retryCount + 1, latency);
      } catch (error: any) {
        const isRetryable = error.retryable ?? true;

        if (isRetryable && retryCount < retryPolicy.max_attempts) {
          // Schedule retry
          await logDeliveryAttempt(
            tenantId,
            requestId,
            channel,
            'RETRYING',
            retryCount + 1,
            undefined,
            error.message,
            error
          );

          // Publish to retry topic
          const nextTopic = getRetryTopic(retryCount + 1);
          await publishNotification(
            tenantId,
            requestId,
            message,
            correlationId,
            retryCount + 1,
            nextTopic
          );
        } else {
          // Log final failure
          await logDeliveryAttempt(
            tenantId,
            requestId,
            channel,
            'FAILED',
            retryCount + 1,
            undefined,
            error.message,
            error
          );
        }
      }
    }

    // Mark outbox as sent
    await supabase
      .from('notification_outbox')
      .update({ status: 'SENT', sent_at: new Date().toISOString() })
      .eq('aggregate_id', requestId);
  } catch (error) {
    console.error('Error processing notification:', error);
  }
}

// Placeholder for actual channel delivery logic
async function deliverToChannel(
  tenantId: string,
  requestId: string,
  channel: string,
  message: any
) {
  // Implementation would call actual providers (SendGrid, Twilio, Firebase, etc.)
  console.log(`Delivering ${channel} notification: ${requestId}`);

  // Simulated delivery
  if (Math.random() > 0.9) {
    throw {
      retryable: true,
      message: 'Simulated delivery failure',
      code: 'DELIVERY_FAILED',
    };
  }
}

// Audit logging
export async function logAuditEvent(
  tenantId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  changes?: any,
  ipAddress?: string,
  userAgent?: string
) {
  try {
    await supabase
      .from('admin_audit_logs')
      .insert({
        tenant_id: tenantId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        changes,
        ip_address: ipAddress,
        user_agent: userAgent,
      });
  } catch (error) {
    console.error('Error logging audit event:', error);
  }
}

// Export utilities
export { supabase, redis };
