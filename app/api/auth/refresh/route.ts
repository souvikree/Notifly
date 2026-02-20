import { NextRequest, NextResponse } from 'next/server';
import { refreshAccessToken, verifyJWTToken } from '@/lib/auth-service';

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token cookie
 * 
 * Response (200 OK):
 * {
 *   "success": true,
 *   "token": "new-jwt-token"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Get refresh token from cookie
    const refreshToken = request.cookies.get('refreshToken')?.value;
    
    if (!refreshToken) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_REFRESH_TOKEN',
            message: 'Refresh token not found',
          },
        },
        { status: 401 }
      );
    }

    // Get current token to extract userId and tenantId
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        {
          success: false,
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

    // If token is expired, we can still use the payload
    // In production, store userId and tenantId separately or use cookies
    let userId: string;
    let tenantId: string;

    if (verification.valid && verification.payload) {
      userId = verification.payload.userId;
      tenantId = verification.payload.tenantId;
    } else {
      // Try to extract from potentially expired token
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          userId = payload.userId;
          tenantId = payload.tenantId;
        } else {
          throw new Error('Invalid token format');
        }
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_TOKEN',
              message: 'Could not extract user information from token',
            },
          },
          { status: 401 }
        );
      }
    }

    // Refresh the token
    const result = await refreshAccessToken(userId, tenantId, refreshToken);

    if (!result.success) {
      // Clear refresh token cookie on failure
      const response = NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: result.error?.statusCode || 401 }
      );

      response.cookies.delete('refreshToken');
      return response;
    }

    return NextResponse.json(
      {
        success: true,
        token: result.token,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred during token refresh',
        },
      },
      { status: 500 }
    );
  }
}
