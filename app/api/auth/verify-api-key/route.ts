import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey } from '@/lib/notification-service';

/**
 * POST /api/auth/verify-api-key
 * Verify API key and return tenant information
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { message: 'Invalid authorization header' },
        { status: 400 }
      );
    }

    const token = authHeader.substring(7);
    const [prefix, ...rest] = token.split('.');

    if (!prefix || rest.length === 0) {
      return NextResponse.json(
        { message: 'Invalid API key format' },
        { status: 400 }
      );
    }

    const keyHash = rest.join('.');
    const auth = await verifyApiKey(prefix, keyHash);

    if (!auth) {
      return NextResponse.json(
        { message: 'Invalid API key' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      tenantId: auth.tenantId,
    });
  } catch (error) {
    console.error('API key verification error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
