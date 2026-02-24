// ============================
// Notifly Type Definitions
// ============================

export type NotificationChannel = "EMAIL" | "SMS" | "PUSH" | "WEBHOOK";
export type NotificationStatus  = "ACCEPTED" | "PROCESSING" | "DELIVERED" | "FAILED" | "RETRYING" | "DLQ";
export type TemplateStatus      = "DRAFT" | "PUBLISHED" | "DEACTIVATED";
export type ApiKeyStatus        = "ACTIVE" | "REVOKED";
export type UserRole            = "ADMIN" | "SERVICE";
export type AuthProvider        = "LOCAL" | "GOOGLE" | "LINKED";

// --- Auth ---
export interface AuthUser {
  id:           string;
  email:        string;
  firstName:    string;
  lastName:     string;
  role:         UserRole;
  tenantId:     string;
  avatarUrl?:   string;
  authProvider: AuthProvider;
}

export interface LoginRequest {
  email:    string;
  password: string;
}

export interface RegisterRequest {
  tenantId:  string;
  firstName: string;
  lastName:  string;
  email:     string;
  password:  string;
}

export interface AuthResponse {
  accessToken:  string;
  refreshToken: string;
  expiresIn:    number;
  userId:       string;
  email:        string;
  firstName:    string;
  lastName:     string;
  role:         UserRole;
  tenantId:     string;
  avatarUrl?:   string;
  authProvider: AuthProvider;
}

// --- Dashboard ---
export interface DashboardMetrics {
  totalNotifications: number;
  successRate:        number;
  failureRate:        number;
  avgDeliveryTimeMs:  number;
  p99LatencyMs:       number;
  dlqCount:           number;
  channelBreakdown:   ChannelBreakdown[];
  dailyStats:         DailyStat[];
}

export interface ChannelBreakdown {
  channel: NotificationChannel;
  total:   number;
  success: number;
  failed:  number;
}

export interface DailyStat {
  date:    string;
  total:   number;
  success: number;
  failed:  number;
}

// --- Notification Logs ---
export interface NotificationLog {
  id:             string;
  requestId:      string;
  userId:         string;
  channel:        NotificationChannel;
  status:         NotificationStatus;
  recipient:      string;
  subject?:       string;
  templateId?:    string;
  payload:        Record<string, unknown>;
  errorMessage?:  string;
  retryCount:     number;
  deliveryTimeMs?: number;
  createdAt:      string;
  updatedAt:      string;
  retryHistory:   RetryAttempt[];
}

export interface RetryAttempt {
  attempt:       number;
  timestamp:     string;
  status:        NotificationStatus;
  errorMessage?: string;
  durationMs?:   number;
}

export interface NotificationLogFilters {
  status?:    NotificationStatus;
  channel?:   NotificationChannel;
  search?:    string;
  startDate?: string;
  endDate?:   string;
  page?:      number;
  size?:      number;
}

export interface PaginatedResponse<T> {
  content:       T[];
  totalElements: number;
  totalPages:    number;
  page:          number;
  size:          number;
}

// --- DLQ ---
export interface FailedNotification {
  id:              string;
  requestId:       string;
  userId:          string;
  channel:         NotificationChannel;
  recipient:       string;
  subject?:        string;
  payload:         Record<string, unknown>;
  errorCode:       string;
  errorMessage:    string;
  retryCount:      number;
  isUnrecoverable: boolean;
  createdAt:       string;
  lastRetryAt?:    string;
}

export interface DlqFilters {
  channel?:         NotificationChannel;
  errorCode?:       string;
  isUnrecoverable?: boolean;
  search?:          string;
  page?:            number;
  size?:            number;
}

// --- Templates ---
// Backend entity fields: name, channel, content (not body), subject
// The frontend uses "content" to match the backend exactly
export interface NotificationTemplate {
  id:         string;
  tenantId?:  string;
  name:       string;
  channel:    string;           // backend returns plain string
  subject?:   string;
  content:    string;           // backend field name is "content", not "body"
  version:    number;
  isActive:   boolean;          // backend field name is "isActive"
  variables?: string[];         // optional — backend doesn't store this as array
  createdAt:  string;
  updatedAt:  string;
}

export interface TemplateVersion {
  version:   number;
  content:   string;            // "content" not "body"
  subject?:  string;
  createdAt: string;
  createdBy: string;
}

// Matches backend AdminController.CreateTemplateRequest exactly:
// { name, channel, content, subject }
export interface CreateTemplateRequest {
  name:     string;
  channel:  string;
  content:  string;             // backend field: content (not body)
  subject?: string;
}

// Matches backend AdminController.UpdateTemplateRequest exactly:
// { content, subject, active }
export interface UpdateTemplateRequest {
  content?: string;
  subject?: string;
  active?:  boolean;
}

export interface TemplateFilters {
  channel?: string;
  active?:  boolean;            // backend uses "active" boolean, not TemplateStatus string
  search?:  string;
  page?:    number;
  size?:    number;
}

// --- API Keys ---
export interface ApiKey {
  id:            string;
  name:          string;
  keyPrefix:     string;
  status:        ApiKeyStatus;
  createdAt:     string;
  lastUsedAt?:   string;
  expiresAt?:    string;
  totalRequests: number;
}

export interface CreateApiKeyRequest {
  name:           string;
  expiresInDays?: number;
}

export interface CreateApiKeyResponse {
  id:        string;
  name:      string;
  key:       string;
  expiresAt?: string;
}

// --- Settings ---
export interface ChannelProviderConfig {
  channel:  NotificationChannel;
  provider: string;
  enabled:  boolean;
  config:   Record<string, string>;
}

export interface FallbackConfig {
  channel:       NotificationChannel;
  fallbackOrder: string[];
}

export interface SettingsData {
  providers:       ChannelProviderConfig[];
  fallbackConfigs: FallbackConfig[];
}