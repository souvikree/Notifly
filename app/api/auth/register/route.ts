import { NextRequest, NextResponse } from 'next/server';
import { registerUser, validatePassword, validateEmail } from '@/lib/auth-service';

/**
 * POST /api/auth/register
 * Register new admin user for a tenant
 * 
 * Request body:
 * {
 *   "tenantId": "tenant-uuid",
 *   "email": "user@example.com",
 *   "password": "SecurePassword123!",
 *   "firstName": "John",
 *   "lastName": "Doe"
 * }
 * 
 * Response (201 Created):
 * {
 *   "success": true,
 *   "user": { ... },
 *   "token": "jwt-token",
 *   "refreshToken": "refresh-token"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, email, password, firstName, lastName } = body;

    // Validate required fields
    if (!tenantId || !email || !password || !firstName || !lastName) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'tenantId, email, password, firstName, and lastName are required',
          },
        },
        { status: 400 }
      );
    }

    // Validate email format
    if (!validateEmail(email)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_EMAIL',
            message: 'Invalid email format',
          },
        },
        { status: 400 }
      );
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: 'Password does not meet security requirements',
            details: passwordValidation.errors,
          },
        },
        { status: 400 }
      );
    }

    // Call registration service
    const result = await registerUser({
      tenantId,
      email,
      password,
      firstName,
      lastName,
    });

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
        user: result.data?.user,
        token: result.data?.token,
      },
      { status: 201 }
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
    console.error('Registration endpoint error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred during registration',
        },
      },
      { status: 500 }
    );
  }
}
