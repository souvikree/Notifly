import { NextRequest, NextResponse } from 'next/server';
import { verifyJWTToken, getUserById } from '@/lib/auth-service';

/**
 * GET /api/auth/validate
 * Validate JWT token and get current user info
 * 
 * Response (200 OK):
 * {
 *   "valid": true,
 *   "user": { ... }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        {
          valid: false,
          error: {
            code: 'NO_TOKEN',
            message: 'Authorization token not provided',
          },
        },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const verification = verifyJWTToken(token);

    if (!verification.valid || !verification.payload) {
      return NextResponse.json(
        {
          valid: false,
          error: {
            code: 'INVALID_TOKEN',
            message: verification.error || 'Invalid or expired token',
          },
        },
        { status: 401 }
      );
    }

    const { userId, tenantId } = verification.payload;

    // Get full user data
    const user = await getUserById(userId, tenantId);
    if (!user) {
      return NextResponse.json(
        {
          valid: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        valid: true,
        user,
        expiresAt: verification.payload.exp * 1000, // Convert to milliseconds
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Token validation error:', error);
    return NextResponse.json(
      {
        valid: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred during token validation',
        },
      },
      { status: 500 }
    );
  }
}
