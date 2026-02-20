import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import {
  checkRateLimit,
  verifyApiKey,
  insertNotificationWithOutbox,
  checkIdempotency,
  ERROR_MAP,
  NotificationErrorCode,
  supabase,
  logAuditEvent,
} from '@/lib/notification-service';
import { publishNotification, KAFKA_TOPICS } from '@/lib/kafka';

/**
 * Extract API key from Authorization header
 */
function extractApiKey(authHeader?: string): { prefix: string; hash: string } | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const [prefix, ...rest] = token.split('.');

  if (!prefix || rest.length === 0) {
    return null;
  }

  return {
    prefix,
    hash: rest.join('.'),
  };
}

/**
 * POST /api/notifications
 * Submit a new notification request
 */
export async function POST(request: NextRequest) {
  try {
    // Extract and verify API key
    const authHeader = request.headers.get('Authorization');
    const apiKeyData = extractApiKey(authHeader);

    if (!apiKeyData) {
      return NextResponse.json(
        {
          error: ERROR_MAP[NotificationErrorCode.INVALID_API_KEY],
          requestId: null,
        },
        { status: 401 }
      );
    }

    const { tenantId } = await verifyApiKey(apiKeyData.prefix, apiKeyData.hash) || {};

    if (!tenantId) {
      return NextResponse.json(
        {
          error: ERROR_MAP[NotificationErrorCode.INVALID_API_KEY],
          requestId: null,
        },
        { status: 401 }
      );
    }

    // Check rate limit
    const rateLimitOk = await checkRateLimit(tenantId);
    if (!rateLimitOk) {
      return NextResponse.json(
        {
          error: ERROR_MAP[NotificationErrorCode.RATE_LIMIT_EXCEEDED],
          requestId: null,
        },
        { status: 429 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { eventType, payload, userId, idempotencyKey } = body;

    // Validate required fields
    if (!eventType || !payload) {
      return NextResponse.json(
        {
          error: {
            ...ERROR_MAP[NotificationErrorCode.VALIDATION_FAILED],
            details: 'Missing required fields: eventType, payload',
          },
          requestId: null,
        },
        { status: 400 }
      );
    }

    // Check idempotency
    if (idempotencyKey) {
      const { exists, requestId: existingId } = await checkIdempotency(tenantId, idempotencyKey);
      if (exists) {
        return NextResponse.json(
          {
            requestId: existingId,
            status: 'ACCEPTED',
            message: 'Duplicate request (idempotent)',
          },
          { status: 200 }
        );
      }
    }

    // Generate request ID
    const requestId = uuidv4();
    const correlationId = request.headers.get('X-Correlation-ID') || uuidv4();

    // Insert notification with outbox pattern
    await insertNotificationWithOutbox(
      tenantId,
      requestId,
      eventType,
      payload,
      idempotencyKey,
      userId
    );

    // Publish to Kafka
    await publishNotification(
      tenantId,
      requestId,
      {
        eventType,
        payload,
        userId,
        timestamp: Date.now(),
      },
      correlationId,
      0,
      KAFKA_TOPICS.NOTIFICATIONS
    );

    // Log audit event
    await logAuditEvent(
      tenantId,
      'NOTIFICATION_SUBMITTED',
      'notification_request',
      requestId,
      { eventType, userId },
      request.ip,
      request.headers.get('user-agent') || undefined
    );

    return NextResponse.json(
      {
        requestId,
        status: 'ACCEPTED',
        correlationId,
      },
      { status: 202 }
    );
  } catch (error: any) {
    console.error('Error processing notification request:', error);

    return NextResponse.json(
      {
        error: {
          ...ERROR_MAP[NotificationErrorCode.INTERNAL_ERROR],
          details: error.message,
        },
        requestId: null,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notifications/:requestId
 * Get notification status
 */
export async function GET(request: NextRequest, { params }: { params: { requestId: string } }) {
  try {
    const authHeader = request.headers.get('Authorization');
    const apiKeyData = extractApiKey(authHeader);

    if (!apiKeyData) {
      return NextResponse.json(
        { error: ERROR_MAP[NotificationErrorCode.INVALID_API_KEY] },
        { status: 401 }
      );
    }

    const auth = await verifyApiKey(apiKeyData.prefix, apiKeyData.hash);
    if (!auth) {
      return NextResponse.json(
        { error: ERROR_MAP[NotificationErrorCode.INVALID_API_KEY] },
        { status: 401 }
      );
    }

    const { requestId } = params;

    // Get notification request
    const notifResult = await supabase
      .from('notification_requests')
      .select('*')
      .eq('tenant_id', auth.tenantId)
      .eq('request_id', requestId)
      .single();

    if (!notifResult.data) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    // Get delivery logs
    const logsResult = await supabase
      .from('notification_logs')
      .select('*')
      .eq('tenant_id', auth.tenantId)
      .eq('request_id', requestId)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      notification: notifResult.data,
      logs: logsResult.data,
    });
  } catch (error) {
    console.error('Error fetching notification status:', error);
    return NextResponse.json(
      { error: ERROR_MAP[NotificationErrorCode.INTERNAL_ERROR] },
      { status: 500 }
    );
  }
}
