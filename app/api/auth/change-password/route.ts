import { NextRequest, NextResponse } from 'next/server';
import { changePassword, verifyJWTToken } from '@/lib/auth-service';

/**
 * POST /api/auth/change-password
 * Change user password
 * 
 * Request body:
 * {
 *   "currentPassword": "CurrentPassword123!",
 *   "newPassword": "NewPassword456!"
 * }
 * 
 * Response (200 OK):
 * {
 *   "success": true,
 *   "message": "Password changed successfully"
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
            code: 'UNAUTHORIZED',
            message: 'Authorization required',
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
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired token',
          },
        },
        { status: 401 }
      );
    }

    const { userId, tenantId } = verification.payload;
    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Current password and new password are required',
          },
        },
        { status: 400 }
      );
    }

    // Call change password service
    const result = await changePassword(userId, tenantId, currentPassword, newPassword);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: result.error?.statusCode || 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Password changed successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while changing password',
        },
      },
      { status: 500 }
    );
  }
}
