import crypto from 'crypto';
import { supabase, redis } from './notification-service';

/**
 * Authentication Service Module
 * Handles user login, registration, password hashing, JWT generation, and session management
 * Fully integrated with Supabase PostgreSQL backend
 */

// Authentication Constants
export const AUTH_CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-key-change-in-production',
  JWT_EXPIRATION_HOURS: 24 * 7, // 7 days
  PASSWORD_MIN_LENGTH: 10,
  PASSWORD_REQUIRE_UPPERCASE: true,
  PASSWORD_REQUIRE_NUMBERS: true,
  PASSWORD_REQUIRE_SPECIAL: true,
  SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes
};

// Error types for authentication
export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_INACTIVE = 'USER_INACTIVE',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  PASSWORD_INVALID = 'PASSWORD_INVALID',
  PASSWORD_WEAK = 'PASSWORD_WEAK',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  SESSION_INVALID = 'SESSION_INVALID',
}

export interface AuthError {
  code: AuthErrorCode;
  message: string;
  statusCode: number;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: 'ADMIN' | 'EDITOR' | 'VIEWER';
  tenantId: string;
  iat: number;
  exp: number;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'EDITOR' | 'VIEWER';
  tenantId: string;
  isActive: boolean;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: AuthUser;
  expiresIn: number;
}

export interface RegisterRequest {
  tenantId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface RegisterResponse {
  user: AuthUser;
  token: string;
  refreshToken: string;
}

/**
 * Password validation utility
 * Ensures passwords meet security requirements
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < AUTH_CONFIG.PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${AUTH_CONFIG.PASSWORD_MIN_LENGTH} characters long`);
  }

  if (AUTH_CONFIG.PASSWORD_REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (AUTH_CONFIG.PASSWORD_REQUIRE_NUMBERS && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (AUTH_CONFIG.PASSWORD_REQUIRE_SPECIAL && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Hash password using Node.js crypto with PBKDF2
 * Production systems should use bcrypt library for additional security
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const parts = hash.split(':');
    const salt = parts[0];
    const key = parts[1];

    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      resolve(key === derivedKey.toString('hex'));
    });
  });
}

/**
 * Generate JWT token
 */
export function generateJWTToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + AUTH_CONFIG.JWT_EXPIRATION_HOURS * 3600,
  };

  // Create JWT manually (in production, use jsonwebtoken library)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUTH_CONFIG.JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify JWT token
 */
export function verifyJWTToken(token: string): { valid: boolean; payload?: JWTPayload; error?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [headerB64, bodyB64, signatureB64] = parts;
    const signature = crypto
      .createHmac('sha256', AUTH_CONFIG.JWT_SECRET)
      .update(`${headerB64}.${bodyB64}`)
      .digest('base64url');

    if (signature !== signatureB64) {
      return { valid: false, error: 'Invalid signature' };
    }

    const payload: JWTPayload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString());

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: String(error) };
  }
}

/**
 * Store refresh token in Redis with TTL
 */
export async function storeRefreshToken(userId: string, tenantId: string, token: string): Promise<void> {
  const key = `refresh_token:${tenantId}:${userId}`;
  const ttl = 30 * 24 * 60 * 60; // 30 days
  await redis.setex(key, ttl, token);
}

/**
 * Verify refresh token
 */
export async function verifyRefreshToken(userId: string, tenantId: string, token: string): Promise<boolean> {
  const key = `refresh_token:${tenantId}:${userId}`;
  const stored = await redis.get(key);
  return stored === token;
}

/**
 * Check if account is locked due to failed login attempts
 */
export async function isAccountLocked(tenantId: string, email: string): Promise<boolean> {
  const key = `lockout:${tenantId}:${email}`;
  const attempts = await redis.get(key);
  return Number(attempts) >= AUTH_CONFIG.MAX_LOGIN_ATTEMPTS;
}

/**
 * Record failed login attempt
 */
export async function recordFailedLoginAttempt(tenantId: string, email: string): Promise<void> {
  const key = `lockout:${tenantId}:${email}`;
  const attempts = await redis.incr(key);
  if (attempts === 1) {
    await redis.expire(key, Math.floor(AUTH_CONFIG.LOCKOUT_DURATION_MS / 1000));
  }
}

/**
 * Clear failed login attempts
 */
export async function clearFailedLoginAttempts(tenantId: string, email: string): Promise<void> {
  const key = `lockout:${tenantId}:${email}`;
  await redis.del(key);
}

/**
 * Login user with email and password
 */
export async function loginUser(
  email: string,
  password: string,
  tenantId: string
): Promise<{ success: boolean; data?: LoginResponse; error?: AuthError }> {
  try {
    // Validate input
    if (!email || !password) {
      return {
        success: false,
        error: {
          code: AuthErrorCode.INVALID_CREDENTIALS,
          message: 'Email and password are required',
          statusCode: 400,
        },
      };
    }

    if (!validateEmail(email)) {
      return {
        success: false,
        error: {
          code: AuthErrorCode.INVALID_CREDENTIALS,
          message: 'Invalid email format',
          statusCode: 400,
        },
      };
    }

    // Check account lockout
    if (await isAccountLocked(tenantId, email)) {
      return {
        success: false,
        error: {
          code: AuthErrorCode.ACCOUNT_LOCKED,
          message: 'Account is temporarily locked. Try again later.',
          statusCode: 429,
        },
      };
    }

    // Get user from database
    const result = await supabase
      .from('admin_users')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('email', email)
      .single();

    if (!result.data) {
      // Record failed attempt
      await recordFailedLoginAttempt(tenantId, email);
      return {
        success: false,
        error: {
          code: AuthErrorCode.INVALID_CREDENTIALS,
          message: 'Invalid email or password',
          statusCode: 401,
        },
      };
    }

    const user = result.data;

    // Check if user is active
    if (!user.is_active) {
      return {
        success: false,
        error: {
          code: AuthErrorCode.USER_INACTIVE,
          message: 'User account is inactive',
          statusCode: 403,
        },
      };
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      // Record failed attempt
      await recordFailedLoginAttempt(tenantId, email);
      return {
        success: false,
        error: {
          code: AuthErrorCode.INVALID_CREDENTIALS,
          message: 'Invalid email or password',
          statusCode: 401,
        },
      };
    }

    // Clear failed attempts on successful login
    await clearFailedLoginAttempts(tenantId, email);

    // Generate tokens
    const token = generateJWTToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
    });

    const refreshToken = generateRefreshToken();
    await storeRefreshToken(user.id, tenantId, refreshToken);

    // Log successful login
    await supabase
      .from('admin_audit_logs')
      .insert({
        tenant_id: tenantId,
        user_id: user.id,
        action: 'USER_LOGIN',
        resource_type: 'admin_user',
        resource_id: user.id,
      });

    return {
      success: true,
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          tenantId: user.tenant_id,
          isActive: user.is_active,
        },
        expiresIn: AUTH_CONFIG.JWT_EXPIRATION_HOURS * 3600,
      },
    };
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      error: {
        code: AuthErrorCode.INVALID_CREDENTIALS,
        message: 'An error occurred during login',
        statusCode: 500,
      },
    };
  }
}

/**
 * Register new admin user
 */
export async function registerUser(request: RegisterRequest): Promise<{ success: boolean; data?: RegisterResponse; error?: AuthError }> {
  try {
    // Validate input
    if (!request.email || !request.password || !request.firstName || !request.lastName) {
      return {
        success: false,
        error: {
          code: AuthErrorCode.PASSWORD_INVALID,
          message: 'All fields are required',
          statusCode: 400,
        },
      };
    }

    if (!validateEmail(request.email)) {
      return {
        success: false,
        error: {
          code: AuthErrorCode.PASSWORD_INVALID,
          message: 'Invalid email format',
          statusCode: 400,
        },
      };
    }

    // Validate password
    const passwordValidation = validatePassword(request.password);
    if (!passwordValidation.valid) {
      return {
        success: false,
        error: {
          code: AuthErrorCode.PASSWORD_WEAK,
          message: passwordValidation.errors.join(', '),
          statusCode: 400,
        },
      };
    }

    // Check if tenant exists
    const tenantResult = await supabase
      .from('tenants')
      .select('id')
      .eq('id', request.tenantId)
      .single();

    if (!tenantResult.data) {
      return {
        success: false,
        error: {
          code: AuthErrorCode.TENANT_NOT_FOUND,
          message: 'Tenant does not exist',
          statusCode: 404,
        },
      };
    }

    // Check if email already exists for tenant
    const existingUser = await supabase
      .from('admin_users')
      .select('id')
      .eq('tenant_id', request.tenantId)
      .eq('email', request.email)
      .single();

    if (existingUser.data) {
      return {
        success: false,
        error: {
          code: AuthErrorCode.EMAIL_ALREADY_EXISTS,
          message: 'Email already registered for this tenant',
          statusCode: 409,
        },
      };
    }

    // Hash password
    const passwordHash = await hashPassword(request.password);

    // Create user
    const { data: newUser, error: createError } = await supabase
      .from('admin_users')
      .insert({
        tenant_id: request.tenantId,
        email: request.email,
        password_hash: passwordHash,
        first_name: request.firstName,
        last_name: request.lastName,
        role: 'EDITOR',
        is_active: true,
      })
      .select()
      .single();

    if (createError) {
      console.error('User creation error:', createError);
      return {
        success: false,
        error: {
          code: AuthErrorCode.PASSWORD_INVALID,
          message: 'Failed to create user',
          statusCode: 500,
        },
      };
    }

    // Generate tokens
    const token = generateJWTToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      tenantId: newUser.tenant_id,
    });

    const refreshToken = generateRefreshToken();
    await storeRefreshToken(newUser.id, request.tenantId, refreshToken);

    // Log registration
    await supabase
      .from('admin_audit_logs')
      .insert({
        tenant_id: request.tenantId,
        user_id: newUser.id,
        action: 'USER_REGISTERED',
        resource_type: 'admin_user',
        resource_id: newUser.id,
      });

    return {
      success: true,
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.first_name,
          lastName: newUser.last_name,
          role: newUser.role,
          tenantId: newUser.tenant_id,
          isActive: newUser.is_active,
        },
        token,
        refreshToken,
      },
    };
  } catch (error) {
    console.error('Registration error:', error);
    return {
      success: false,
      error: {
        code: AuthErrorCode.PASSWORD_INVALID,
        message: 'An error occurred during registration',
        statusCode: 500,
      },
    };
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string, tenantId: string): Promise<AuthUser | null> {
  try {
    const result = await supabase
      .from('admin_users')
      .select('*')
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .single();

    if (!result.data) return null;

    return {
      id: result.data.id,
      email: result.data.email,
      firstName: result.data.first_name,
      lastName: result.data.last_name,
      role: result.data.role,
      tenantId: result.data.tenant_id,
      isActive: result.data.is_active,
    };
  } catch (error) {
    console.error('Get user error:', error);
    return null;
  }
}

/**
 * Change password
 */
export async function changePassword(
  userId: string,
  tenantId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: AuthError }> {
  try {
    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return {
        success: false,
        error: {
          code: AuthErrorCode.PASSWORD_WEAK,
          message: passwordValidation.errors.join(', '),
          statusCode: 400,
        },
      };
    }

    // Get user
    const result = await supabase
      .from('admin_users')
      .select('password_hash')
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .single();

    if (!result.data) {
      return {
        success: false,
        error: {
          code: AuthErrorCode.USER_NOT_FOUND,
          message: 'User not found',
          statusCode: 404,
        },
      };
    }

    // Verify current password
    const valid = await verifyPassword(currentPassword, result.data.password_hash);
    if (!valid) {
      return {
        success: false,
        error: {
          code: AuthErrorCode.INVALID_CREDENTIALS,
          message: 'Current password is incorrect',
          statusCode: 401,
        },
      };
    }

    // Hash new password
    const newHash = await hashPassword(newPassword);

    // Update password
    await supabase
      .from('admin_users')
      .update({ password_hash: newHash })
      .eq('id', userId)
      .eq('tenant_id', tenantId);

    // Log change
    await supabase
      .from('admin_audit_logs')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        action: 'PASSWORD_CHANGED',
        resource_type: 'admin_user',
        resource_id: userId,
      });

    return { success: true };
  } catch (error) {
    console.error('Change password error:', error);
    return {
      success: false,
      error: {
        code: AuthErrorCode.PASSWORD_INVALID,
        message: 'Failed to change password',
        statusCode: 500,
      },
    };
  }
}

/**
 * Logout user (invalidate refresh token)
 */
export async function logoutUser(userId: string, tenantId: string): Promise<void> {
  try {
    const key = `refresh_token:${tenantId}:${userId}`;
    await redis.del(key);

    await supabase
      .from('admin_audit_logs')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        action: 'USER_LOGOUT',
        resource_type: 'admin_user',
        resource_id: userId,
      });
  } catch (error) {
    console.error('Logout error:', error);
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  userId: string,
  tenantId: string,
  refreshToken: string
): Promise<{ success: boolean; token?: string; error?: AuthError }> {
  try {
    // Verify refresh token
    const valid = await verifyRefreshToken(userId, tenantId, refreshToken);
    if (!valid) {
      return {
        success: false,
        error: {
          code: AuthErrorCode.SESSION_INVALID,
          message: 'Invalid refresh token',
          statusCode: 401,
        },
      };
    }

    // Get user to include in token
    const user = await getUserById(userId, tenantId);
    if (!user) {
      return {
        success: false,
        error: {
          code: AuthErrorCode.USER_NOT_FOUND,
          message: 'User not found',
          statusCode: 404,
        },
      };
    }

    // Generate new access token
    const token = generateJWTToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });

    return {
      success: true,
      token,
    };
  } catch (error) {
    console.error('Refresh token error:', error);
    return {
      success: false,
      error: {
        code: AuthErrorCode.SESSION_INVALID,
        message: 'Failed to refresh token',
        statusCode: 500,
      },
    };
  }
}

export default {
  loginUser,
  registerUser,
  validatePassword,
  validateEmail,
  hashPassword,
  verifyPassword,
  generateJWTToken,
  generateRefreshToken,
  verifyJWTToken,
  getUserById,
  changePassword,
  logoutUser,
  refreshAccessToken,
  isAccountLocked,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
};
