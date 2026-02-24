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
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  SettingsData,
  ChannelProviderConfig,
  FallbackConfig,
} from "./types";

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authService = {
  login: (data: LoginRequest) =>
    apiClient.post<AuthResponse>("/auth/login", data).then((r) => r.data),

  register: (data: RegisterRequest) =>
    apiClient.post<AuthResponse>("/auth/register", data).then((r) => r.data),

  googleAuth: (idToken: string) =>
    apiClient.post<AuthResponse>("/auth/google", { idToken }).then((r) => r.data),

  forgotPassword: (email: string) =>
    apiClient.post("/auth/forgot-password", { email }).then((r) => r.data),

  refreshToken: (refreshToken: string) =>
    apiClient
      .post<{ accessToken: string; expiresIn: string }>("/auth/refresh", { refreshToken })
      .then((r) => r.data),

  logout: (refreshToken: string) =>
    apiClient.post("/auth/logout", { refreshToken }).then((r) => r.data),
};

// ── Dashboard ─────────────────────────────────────────────────────────────────

// Typed to match what the backend actually returns inside the "metrics" wrapper
interface BackendMetrics {
  totalNotifications?: number;
  successRate?:        number;
  failureRate?:        number;
  averageLatency?:     number;  // backend field name differs from frontend
  p99Latency?:         number;  // backend field name differs from frontend
  dlqCount?:           number;
}

export const dashboardService = {
  getMetrics: (period?: string) =>
    apiClient
      .get<{ metrics: BackendMetrics; timeSeries: unknown[] }>("/admin/metrics", {
        params: { period },
      })
      .then((r) => {
        const m: BackendMetrics = r.data?.metrics ?? {};
        // Remap backend field names to frontend DashboardMetrics shape
        const result: DashboardMetrics = {
          totalNotifications: m.totalNotifications ?? 0,
          successRate:        m.successRate        ?? 0,
          failureRate:        m.failureRate        ?? 0,
          avgDeliveryTimeMs:  m.averageLatency     ?? 0,
          p99LatencyMs:       m.p99Latency         ?? 0,
          dlqCount:           m.dlqCount           ?? 0,
          channelBreakdown:   [],
          dailyStats:         [],
        };
        return result;
      }),
};

// ── Notification Logs ─────────────────────────────────────────────────────────
export const notificationService = {
  // Backend returns { data, total, page, size, totalPages }
  getLogs: (filters: NotificationLogFilters) =>
    apiClient
      .get<{
        data:       NotificationLog[];
        total:      number;
        page:       number;
        size:       number;
        totalPages: number;
      }>("/admin/logs", { params: filters })
      .then((r) => {
        const result: PaginatedResponse<NotificationLog> = {
          content:       r.data.data      ?? [],
          totalElements: r.data.total     ?? 0,
          totalPages:    r.data.totalPages ?? 0,
          page:          r.data.page      ?? 0,
          size:          r.data.size      ?? 20,
        };
        return result;
      }),

  getLogById: (id: string) =>
    apiClient.get<NotificationLog>(`/admin/logs/${id}`).then((r) => r.data),

  retryNotification: (id: string) =>
    apiClient.post(`/admin/logs/${id}/retry`).then((r) => r.data),
};

// ── DLQ ──────────────────────────────────────────────────────────────────────
export const dlqService = {
  // Backend returns { data, total, page, size }
  getFailedNotifications: (filters: DlqFilters) =>
    apiClient
      .get<{
        data:  FailedNotification[];
        total: number;
        page:  number;
        size:  number;
      }>("/admin/dlq", { params: filters })
      .then((r) => {
        const result: PaginatedResponse<FailedNotification> = {
          content:       r.data.data  ?? [],
          totalElements: r.data.total ?? 0,
          totalPages:    Math.ceil((r.data.total ?? 0) / (r.data.size ?? 20)),
          page:          r.data.page  ?? 0,
          size:          r.data.size  ?? 20,
        };
        return result;
      }),

  retryById: (id: string) =>
    apiClient.post(`/admin/dlq/${id}/retry`).then((r) => r.data),

  // No batch endpoint on backend yet
  retryByFilter: (_filters: Partial<DlqFilters>) =>
    Promise.resolve({ message: "Batch retry not yet implemented" }),

  // Backend uses DELETE /dlq/{id} to remove/mark unrecoverable
  markUnrecoverable: (id: string) =>
    apiClient.delete(`/admin/dlq/${id}`).then((r) => r.data),
};

// ── Templates ─────────────────────────────────────────────────────────────────
export const templateService = {
  // Backend returns plain List<NotificationTemplate> — wrap in PaginatedResponse
  getTemplates: (filters: TemplateFilters) =>
    apiClient
      .get<NotificationTemplate[]>("/admin/templates", { params: filters })
      .then((r) => {
        const content = r.data ?? [];
        const result: PaginatedResponse<NotificationTemplate> = {
          content,
          totalElements: content.length,
          totalPages:    1,
          page:          0,
          size:          content.length,
        };
        return result;
      }),

  getById: (id: string) =>
    apiClient.get<NotificationTemplate>(`/admin/templates/${id}`).then((r) => r.data),

  // Backend CreateTemplateRequest: { name, channel, content, subject }
  create: (data: CreateTemplateRequest) =>
    apiClient.post<NotificationTemplate>("/admin/templates", data).then((r) => r.data),

  // Backend UpdateTemplateRequest: { content, subject, active } — uses PUT not PATCH
  update: (id: string, data: UpdateTemplateRequest) =>
    apiClient.put<NotificationTemplate>(`/admin/templates/${id}`, data).then((r) => r.data),

  // No publish endpoint — activate via update
  publish: (id: string) =>
    apiClient
      .put<NotificationTemplate>(`/admin/templates/${id}`, { active: true })
      .then((r) => r.data),

  // No deactivate endpoint — deactivate via update
  deactivate: (id: string) =>
    apiClient
      .put<NotificationTemplate>(`/admin/templates/${id}`, { active: false })
      .then((r) => r.data),

  // No version history endpoint on backend
  getVersionHistory: (_id: string) => Promise.resolve([]),
};

// ── API Keys ──────────────────────────────────────────────────────────────────
export const apiKeyService = {
  getKeys: () =>
    apiClient.get<ApiKey[]>("/admin/api-keys").then((r) => r.data),

  // Backend uses "displayName" not "name"
  create: (data: CreateApiKeyRequest) =>
    apiClient
      .post<CreateApiKeyResponse>("/admin/api-keys", {
        displayName: data.name,
        role: "SERVICE",
      })
      .then((r) => r.data),

  revoke: (id: string) =>
    apiClient.delete(`/admin/api-keys/${id}`).then((r) => r.data),
};

// ── Settings ──────────────────────────────────────────────────────────────────
// No settings endpoints on backend yet — components fall back to mockSettings via isError
export const settingsService = {
  getSettings: () =>
    apiClient.get<SettingsData>("/admin/settings").then((r) => r.data),

  updateProvider: (data: ChannelProviderConfig) =>
    apiClient.put("/admin/settings/providers", data).then((r) => r.data),

  updateFallback: (data: FallbackConfig) =>
    apiClient.put("/admin/settings/fallback", data).then((r) => r.data),
};