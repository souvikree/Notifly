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
  avatarUrl?:   string;      // populated for Google users
  authProvider: AuthProvider; // "LOCAL" | "GOOGLE" | "LINKED"
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
export interface NotificationTemplate {
  id:          string;
  name:        string;
  channel:     NotificationChannel;
  subject?:    string;
  body:        string;
  status:      TemplateStatus;
  version:     number;
  variables:   string[];
  createdAt:   string;
  updatedAt:   string;
  publishedAt?: string;
}

export interface TemplateVersion {
  version:   number;
  body:      string;
  subject?:  string;
  status:    TemplateStatus;
  createdAt: string;
  createdBy: string;
}

export interface CreateTemplateRequest {
  name:       string;
  channel:    NotificationChannel;
  subject?:   string;
  body:       string;
  variables:  string[];
}

export interface UpdateTemplateRequest {
  name?:      string;
  subject?:   string;
  body?:      string;
  variables?: string[];
}

export interface TemplateFilters {
  channel?: NotificationChannel;
  status?:  TemplateStatus;
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