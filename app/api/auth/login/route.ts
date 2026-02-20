import { NextRequest, NextResponse } from 'next/server';
import { loginUser } from '@/lib/auth-service';

/**
 * POST /api/auth/login
 * Admin user login with email and password
 * 
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "SecurePassword123!",
 *   "tenantId": "tenant-uuid"
 * }
 * 
 * Response (200 OK):
 * {
 *   "token": "jwt-token",
 *   "refreshToken": "refresh-token",
 *   "user": { ... },
 *   "expiresIn": 604800
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, tenantId } = body;

    if (!email || !password || !tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Email, password, and tenantId are required',
          },
        },
        { status: 400 }
      );
    }

    // Call authentication service
    const result = await loginUser(email, password, tenantId);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: result.error?.statusCode || 500 }
      );
    }

    // Set secure HTTP-only cookie for refresh token
    const response = NextResponse.json(
      {
        success: true,
        token: result.data?.token,
        user: result.data?.user,
        expiresIn: result.data?.expiresIn,
      },
      { status: 200 }
    );

    // Set refresh token as HTTP-only cookie
    response.cookies.set('refreshToken', result.data?.refreshToken || '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login endpoint error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred during login',
        },
      },
      { status: 500 }
    );
  }
}
