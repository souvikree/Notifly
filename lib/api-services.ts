import apiClient from "./api-client";
import type {
  AuthResponse,
  LoginRequest,
  DashboardMetrics,
  ChannelBreakdown,
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
  NotificationChannel,
} from "./types";
// NOTE: RegisterRequest is now defined in auth-context.tsx (workspaceName replaced tenantId)
import type { RegisterRequest } from "./auth-context";

// ── Auth ──────────────────────────────────────────────────────────────────────

// googleAuth can return either a full AuthResponse (existing user / linked account)
// or a 202 onboarding payload (brand-new Google user who still needs a workspace name).
type GoogleAuthResult =
  | AuthResponse
  | { needsOnboarding: true; profile: { idToken: string; email: string; firstName: string; lastName: string; avatarUrl: string } };

export const authService = {
  login: (data: LoginRequest) =>
    apiClient.post<AuthResponse>("/auth/login", data).then((r) => r.data),

  // Backend now expects workspaceName instead of tenantId — auto-creates the tenant.
  register: (data: RegisterRequest) =>
    apiClient.post<AuthResponse>("/auth/register", data).then((r) => r.data),

  // Returns AuthResponse for existing users, or { needsOnboarding: true, profile } for new ones.
  googleAuth: (idToken: string) =>
    apiClient.post<GoogleAuthResult>("/auth/google", { idToken }).then((r) => r.data),

  forgotPassword: (email: string) =>
    apiClient.post("/auth/forgot-password", { email }).then((r) => r.data),

  refreshToken: (refreshToken: string) =>
    apiClient
      .post<{ accessToken: string; refreshToken: string; expiresIn: string }>(
        "/auth/refresh",
        { refreshToken }
      )
      .then((r) => r.data),

  logout: (refreshToken: string) =>
    apiClient.post("/auth/logout", { refreshToken }).then((r) => r.data),
};

// ── Dashboard ──────────────────────────────────────────────────────────────────
interface BackendChannelStats {
  sent:   number;
  failed: number;
}
interface BackendMetrics {
  totalNotifications?:  number;
  successRate?:         number;
  failureRate?:         number;
  averageLatency?:      number;
  p99Latency?:          number;
  dlqCount?:            number;
  channelMetrics?: {
    email?: BackendChannelStats;
    sms?:   BackendChannelStats;
    push?:  BackendChannelStats;
  };
}

export const dashboardService = {
  getMetrics: (period?: string) =>
    apiClient
      .get<{ metrics: BackendMetrics; timeSeries: unknown[] }>("/admin/metrics", {
        params: { period },
      })
      .then((r) => {
        const m: BackendMetrics = r.data?.metrics ?? {};

        const cm = m.channelMetrics ?? {};
        const channelBreakdown: ChannelBreakdown[] = (
          Object.entries(cm) as [string, BackendChannelStats][]
        ).map(([ch, stats]) => ({
          channel: ch.toUpperCase() as NotificationChannel,
          total:   (stats.sent ?? 0) + (stats.failed ?? 0),
          success: stats.sent   ?? 0,
          failed:  stats.failed ?? 0,
        }));

        const result: DashboardMetrics = {
          totalNotifications: m.totalNotifications  ?? 0,
          successRate:        m.successRate         ?? 0,
          failureRate:        m.failureRate         ?? 0,
          avgDeliveryTimeMs:  m.averageLatency       ?? 0,
          p99LatencyMs:       m.p99Latency          ?? 0,
          dlqCount:           m.dlqCount            ?? 0,
          channelBreakdown,
          dailyStats:         [],
        };
        return result;
      }),
};

// ── Notification Logs ─────────────────────────────────────────────────────────
export const notificationService = {
  getLogs: (filters: NotificationLogFilters) =>
    apiClient
      .get<{ data: NotificationLog[]; total: number; page: number; size: number; totalPages: number }>(
        "/admin/logs",
        { params: filters }
      )
      .then((r) => ({
        content:       r.data.data       ?? [],
        totalElements: r.data.total      ?? 0,
        totalPages:    r.data.totalPages ?? 0,
        page:          r.data.page       ?? 0,
        size:          r.data.size       ?? 20,
      } as PaginatedResponse<NotificationLog>)),

  getLogById: (id: string) =>
    apiClient.get<NotificationLog>(`/admin/logs/${id}`).then((r) => r.data),

  retryNotification: (id: string) =>
    apiClient.post(`/admin/logs/${id}/retry`).then((r) => r.data),
};

// ── DLQ ───────────────────────────────────────────────────────────────────────
export const dlqService = {
  getFailedNotifications: (filters: DlqFilters) =>
    apiClient
      .get<{ data: FailedNotification[]; total: number; page: number; size: number }>(
        "/admin/dlq",
        { params: filters }
      )
      .then((r) => ({
        content:       r.data.data  ?? [],
        totalElements: r.data.total ?? 0,
        totalPages:    Math.ceil((r.data.total ?? 0) / (r.data.size ?? 20)),
        page:          r.data.page  ?? 0,
        size:          r.data.size  ?? 20,
      } as PaginatedResponse<FailedNotification>)),

  retryById: (id: string) =>
    apiClient.post(`/admin/dlq/${id}/retry`).then((r) => r.data),

  // FIXED INT-004: Was Promise.resolve() — silently did nothing.
  // Now calls POST /admin/dlq/retry-batch with the filter params.
  retryByFilter: (filters: Partial<DlqFilters>) =>
    apiClient
      .post<{ status: string; queued: number; skipped: number; total: number }>(
        "/admin/dlq/retry-batch",
        {
          channel:   filters.channel   ?? null,
          errorCode: filters.errorCode ?? null,
          search:    filters.search    ?? null,
        }
      )
      .then((r) => r.data),

  markUnrecoverable: (id: string) =>
    apiClient.delete(`/admin/dlq/${id}`).then((r) => r.data),
};

// ── Templates ─────────────────────────────────────────────────────────────────
export const templateService = {
  getTemplates: (filters: TemplateFilters) =>
    apiClient
      .get<NotificationTemplate[]>("/admin/templates", { params: filters })
      .then((r) => {
        const content = r.data ?? [];
        return {
          content,
          totalElements: content.length,
          totalPages:    1,
          page:          0,
          size:          content.length,
        } as PaginatedResponse<NotificationTemplate>;
      }),

  getById: (id: string) =>
    apiClient.get<NotificationTemplate>(`/admin/templates/${id}`).then((r) => r.data),

  create: (data: CreateTemplateRequest) =>
    apiClient.post<NotificationTemplate>("/admin/templates", data).then((r) => r.data),

  update: (id: string, data: UpdateTemplateRequest) =>
    apiClient.put<NotificationTemplate>(`/admin/templates/${id}`, data).then((r) => r.data),

  publish: (id: string) =>
    apiClient.put<NotificationTemplate>(`/admin/templates/${id}`, { active: true }).then((r) => r.data),

  deactivate: (id: string) =>
    apiClient.put<NotificationTemplate>(`/admin/templates/${id}`, { active: false }).then((r) => r.data),

  getVersionHistory: (_id: string) => Promise.resolve([]),
};

// ── API Keys ──────────────────────────────────────────────────────────────────
export const apiKeyService = {
  getKeys: () =>
    apiClient.get<ApiKey[]>("/admin/api-keys").then((r) => r.data),

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
export const settingsService = {
  getSettings: () =>
    apiClient.get<SettingsData>("/admin/settings").then((r) => r.data),

  updateProvider: (data: ChannelProviderConfig) =>
    apiClient.put("/admin/settings/providers", data).then((r) => r.data),

  updateFallback: (data: FallbackConfig) =>
    apiClient.put("/admin/settings/fallback", data).then((r) => r.data),
};