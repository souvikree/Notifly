import apiClient from "./api-client";
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  DashboardMetrics,
  NotificationLog,
  NotificationLogFilters,
  PaginatedResponse,
  FailedNotification,
  DlqFilters,
  NotificationTemplate,
  TemplateFilters,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  TemplateVersion,
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  SettingsData,
  ChannelProviderConfig,
  FallbackConfig,
} from "./types";

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authService = {
  // Email + password login
  login: (data: LoginRequest) =>
    apiClient.post<AuthResponse>("/auth/login", data).then((r) => r.data),

  // Email + password registration
  register: (data: RegisterRequest) =>
    apiClient.post<AuthResponse>("/auth/register", data).then((r) => r.data),

  // Google OAuth — send the ID token received from @react-oauth/google
  googleAuth: (idToken: string) =>
    apiClient.post<AuthResponse>("/auth/google", { idToken }).then((r) => r.data),

  // Forgot password — backend always returns 200 (security: don't reveal email existence)
  forgotPassword: (email: string) =>
    apiClient.post("/auth/forgot-password", { email }).then((r) => r.data),

  // Refresh access token
  refreshToken: (refreshToken: string) =>
    apiClient.post<{ accessToken: string; expiresIn: string }>(
      "/auth/refresh", { refreshToken }
    ).then((r) => r.data),

  // Logout — revokes the refresh token server-side
  logout: (refreshToken: string) =>
    apiClient.post("/auth/logout", { refreshToken }).then((r) => r.data),
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboardService = {
  getMetrics: (period?: string) =>
    apiClient.get<DashboardMetrics>("/admin/metrics", { params: { period } }).then((r) => r.data),
};

// ── Notification Logs ─────────────────────────────────────────────────────────
export const notificationService = {
  getLogs: (filters: NotificationLogFilters) =>
    apiClient.get<PaginatedResponse<NotificationLog>>("/admin/logs", { params: filters }).then((r) => r.data),

  getLogById: (id: string) =>
    apiClient.get<NotificationLog>(`/admin/logs/${id}`).then((r) => r.data),

  retryNotification: (id: string) =>
    apiClient.post(`/admin/logs/${id}/retry`).then((r) => r.data),
};

// ── DLQ ──────────────────────────────────────────────────────────────────────
export const dlqService = {
  getFailedNotifications: (filters: DlqFilters) =>
    apiClient.get<PaginatedResponse<FailedNotification>>("/admin/dlq", { params: filters }).then((r) => r.data),

  retryById: (id: string) =>
    apiClient.post(`/admin/dlq/${id}/retry`).then((r) => r.data),

  retryByFilter: (filters: Partial<DlqFilters>) =>
    apiClient.post("/admin/dlq/retry-batch", filters).then((r) => r.data),

  markUnrecoverable: (id: string) =>
    apiClient.patch(`/admin/dlq/${id}/unrecoverable`).then((r) => r.data),
};

// ── Templates ─────────────────────────────────────────────────────────────────
export const templateService = {
  getTemplates: (filters: TemplateFilters) =>
    apiClient.get<PaginatedResponse<NotificationTemplate>>("/admin/templates", { params: filters }).then((r) => r.data),

  getById: (id: string) =>
    apiClient.get<NotificationTemplate>(`/admin/templates/${id}`).then((r) => r.data),

  create: (data: CreateTemplateRequest) =>
    apiClient.post<NotificationTemplate>("/admin/templates", data).then((r) => r.data),

  update: (id: string, data: UpdateTemplateRequest) =>
    apiClient.patch<NotificationTemplate>(`/admin/templates/${id}`, data).then((r) => r.data),

  publish: (id: string) =>
    apiClient.post<NotificationTemplate>(`/admin/templates/${id}/publish`).then((r) => r.data),

  deactivate: (id: string) =>
    apiClient.post<NotificationTemplate>(`/admin/templates/${id}/deactivate`).then((r) => r.data),

  getVersionHistory: (id: string) =>
    apiClient.get<TemplateVersion[]>(`/admin/templates/${id}/versions`).then((r) => r.data),
};

// ── API Keys ──────────────────────────────────────────────────────────────────
export const apiKeyService = {
  getKeys: () =>
    apiClient.get<ApiKey[]>("/admin/api-keys").then((r) => r.data),

  create: (data: CreateApiKeyRequest) =>
    apiClient.post<CreateApiKeyResponse>("/admin/api-keys", data).then((r) => r.data),

  revoke: (id: string) =>
    apiClient.delete(`/admin/api-keys/${id}`).then((r) => r.data),
};

// ── Settings ──────────────────────────────────────────────────────────────────
export const settingsService = {
  getSettings: () =>
    apiClient.get<SettingsData>("/admin/settings").then((r) => r.data),

  updateProvider: (data: ChannelProviderConfig) =>
    apiClient.put("/admin/settings/providers", data).then((r) => r.data),

  updateFallback: (data: FallbackConfig) =>
    apiClient.put("/admin/settings/fallback", data).then((r) => r.data),
};