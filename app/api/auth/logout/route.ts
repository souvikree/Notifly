import { NextRequest, NextResponse } from 'next/server';
import { logoutUser, verifyJWTToken } from '@/lib/auth-service';

/**
 * POST /api/auth/logout
 * Logout user and invalidate refresh token
 * 
 * Response (200 OK):
 * {
 *   "success": true,
 *   "message": "Successfully logged out"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Get token from Authorization header
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
    
    // Try to verify token to get user info
    let userId: string;
    let tenantId: string;

    try {
      const verification = verifyJWTToken(token);
      
      if (verification.valid && verification.payload) {
        userId = verification.payload.userId;
        tenantId = verification.payload.tenantId;
      } else {
        // Try to extract from token payload even if expired
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          userId = payload.userId;
          tenantId = payload.tenantId;
        } else {
          throw new Error('Invalid token format');
        }
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

    // Call logout service
    await logoutUser(userId, tenantId);

    // Clear refresh token cookie
    const response = NextResponse.json(
      {
        success: true,
        message: 'Successfully logged out',
      },
      { status: 200 }
    );

    response.cookies.delete('refreshToken');

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    
    // Still delete the cookie even on error
    const response = NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred during logout',
        },
      },
      { status: 500 }
    );

    response.cookies.delete('refreshToken');
    return response;
  }
}
