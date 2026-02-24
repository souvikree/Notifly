import type {
  DashboardMetrics,
  NotificationLog,
  FailedNotification,
  NotificationTemplate,
  ApiKey,
  SettingsData,
  PaginatedResponse,
} from "./types";

// === Dashboard ===
export const mockDashboardMetrics: DashboardMetrics = {
  totalNotifications: 284572,
  successRate: 97.3,
  failureRate: 2.7,
  avgDeliveryTimeMs: 142,
  p99LatencyMs: 890,
  dlqCount: 47,
  channelBreakdown: [
    { channel: "EMAIL", total: 156000, success: 152100, failed: 3900 },
    { channel: "SMS",   total: 89000,  success: 86500,  failed: 2500 },
    { channel: "PUSH",  total: 39572,  success: 38200,  failed: 1372 },
  ],
  dailyStats: [
    { date: "2026-02-15", total: 41200, success: 40100, failed: 1100 },
    { date: "2026-02-16", total: 38900, success: 37800, failed: 1100 },
    { date: "2026-02-17", total: 42100, success: 41000, failed: 1100 },
    { date: "2026-02-18", total: 39500, success: 38500, failed: 1000 },
    { date: "2026-02-19", total: 40800, success: 39700, failed: 1100 },
    { date: "2026-02-20", total: 43100, success: 42000, failed: 1100 },
    { date: "2026-02-21", total: 38972, success: 37700, failed: 1272 },
  ],
};

// === Notification Logs ===
export const mockNotificationLogs: NotificationLog[] = [
  {
    id: "log-001", requestId: "req-a1b2c3d4", userId: "user-001",
    channel: "EMAIL", status: "DELIVERED", recipient: "john@example.com",
    subject: "Order Confirmation #1234", templateId: "tmpl-001",
    payload: { orderId: "1234", total: "$49.99" }, retryCount: 0, deliveryTimeMs: 120,
    createdAt: "2026-02-21T10:30:00Z", updatedAt: "2026-02-21T10:30:01Z", retryHistory: [],
  },
  {
    id: "log-002", requestId: "req-e5f6g7h8", userId: "user-002",
    channel: "SMS", status: "DELIVERED", recipient: "+1234567890",
    payload: { code: "482910" }, retryCount: 0, deliveryTimeMs: 85,
    createdAt: "2026-02-21T10:28:00Z", updatedAt: "2026-02-21T10:28:00Z", retryHistory: [],
  },
  {
    id: "log-003", requestId: "req-i9j0k1l2", userId: "user-003",
    channel: "PUSH", status: "FAILED", recipient: "device-token-abc",
    subject: "New message from Sarah", payload: { messageId: "msg-789", sender: "Sarah" },
    errorMessage: "Device token expired", retryCount: 3,
    createdAt: "2026-02-21T10:25:00Z", updatedAt: "2026-02-21T10:26:30Z",
    retryHistory: [
      { attempt: 1, timestamp: "2026-02-21T10:25:01Z", status: "RETRYING", errorMessage: "Device token expired", durationMs: 200 },
      { attempt: 2, timestamp: "2026-02-21T10:25:06Z", status: "RETRYING", errorMessage: "Device token expired", durationMs: 180 },
      { attempt: 3, timestamp: "2026-02-21T10:26:30Z", status: "FAILED",   errorMessage: "Device token expired", durationMs: 190 },
    ],
  },
  {
    id: "log-004", requestId: "req-m3n4o5p6", userId: "user-001",
    channel: "EMAIL", status: "RETRYING", recipient: "john@example.com",
    subject: "Password Reset", templateId: "tmpl-003",
    payload: { resetLink: "https://example.com/reset/abc" },
    errorMessage: "SMTP timeout", retryCount: 1,
    createdAt: "2026-02-21T10:20:00Z", updatedAt: "2026-02-21T10:20:05Z",
    retryHistory: [
      { attempt: 1, timestamp: "2026-02-21T10:20:01Z", status: "RETRYING", errorMessage: "SMTP timeout", durationMs: 5000 },
    ],
  },
  {
    id: "log-005", requestId: "req-q7r8s9t0", userId: "user-004",
    channel: "SMS", status: "DELIVERED", recipient: "+9876543210",
    payload: { otp: "371829" }, retryCount: 1, deliveryTimeMs: 340,
    createdAt: "2026-02-21T10:15:00Z", updatedAt: "2026-02-21T10:15:03Z",
    retryHistory: [
      { attempt: 1, timestamp: "2026-02-21T10:15:01Z", status: "RETRYING", errorMessage: "Provider timeout", durationMs: 2000 },
    ],
  },
  {
    id: "log-006", requestId: "req-u1v2w3x4", userId: "user-005",
    channel: "PUSH", status: "DELIVERED", recipient: "device-token-def",
    subject: "Flash Sale!", payload: { saleId: "sale-42", discount: "30%" },
    retryCount: 0, deliveryTimeMs: 65,
    createdAt: "2026-02-21T10:10:00Z", updatedAt: "2026-02-21T10:10:00Z", retryHistory: [],
  },
  {
    id: "log-007", requestId: "req-y5z6a7b8", userId: "user-006",
    channel: "EMAIL", status: "DLQ", recipient: "invalid@",
    subject: "Welcome to Notifly", templateId: "tmpl-002",
    payload: { name: "Unknown" }, errorMessage: "Invalid recipient address", retryCount: 4,
    createdAt: "2026-02-21T10:05:00Z", updatedAt: "2026-02-21T10:06:30Z",
    retryHistory: [
      { attempt: 1, timestamp: "2026-02-21T10:05:01Z", status: "RETRYING", errorMessage: "Invalid recipient", durationMs: 100 },
      { attempt: 2, timestamp: "2026-02-21T10:05:06Z", status: "RETRYING", errorMessage: "Invalid recipient", durationMs: 100 },
      { attempt: 3, timestamp: "2026-02-21T10:05:36Z", status: "RETRYING", errorMessage: "Invalid recipient", durationMs: 100 },
      { attempt: 4, timestamp: "2026-02-21T10:06:30Z", status: "DLQ",      errorMessage: "Max retries exceeded", durationMs: 100 },
    ],
  },
  {
    id: "log-008", requestId: "req-c9d0e1f2", userId: "user-007",
    channel: "EMAIL", status: "PROCESSING", recipient: "alice@corp.com",
    subject: "Weekly Report", templateId: "tmpl-005",
    payload: { reportId: "rpt-100" }, retryCount: 0,
    createdAt: "2026-02-21T10:31:00Z", updatedAt: "2026-02-21T10:31:00Z", retryHistory: [],
  },
];

// === DLQ ===
export const mockDlqItems: FailedNotification[] = [
  {
    id: "dlq-001", requestId: "req-y5z6a7b8", userId: "user-006",
    channel: "EMAIL", recipient: "invalid@", subject: "Welcome to Notifly",
    payload: { name: "Unknown" }, errorCode: "INVALID_RECIPIENT",
    errorMessage: "Email address format is invalid", retryCount: 4,
    isUnrecoverable: false, createdAt: "2026-02-21T10:06:30Z", lastRetryAt: "2026-02-21T10:06:30Z",
  },
  {
    id: "dlq-002", requestId: "req-g3h4i5j6", userId: "user-008",
    channel: "SMS", recipient: "+000000", payload: { code: "999999" },
    errorCode: "PROVIDER_ERROR", errorMessage: "Twilio: Invalid phone number format",
    retryCount: 4, isUnrecoverable: false,
    createdAt: "2026-02-21T09:50:00Z", lastRetryAt: "2026-02-21T09:52:00Z",
  },
  {
    id: "dlq-003", requestId: "req-k7l8m9n0", userId: "user-009",
    channel: "PUSH", recipient: "expired-token-xyz", subject: "You have a new follower",
    payload: { followerId: "user-100" }, errorCode: "DEVICE_UNREGISTERED",
    errorMessage: "Push token is no longer valid", retryCount: 4,
    isUnrecoverable: true, createdAt: "2026-02-20T18:00:00Z", lastRetryAt: "2026-02-20T18:05:00Z",
  },
  {
    id: "dlq-004", requestId: "req-o1p2q3r4", userId: "user-010",
    channel: "EMAIL", recipient: "bob@nonexistent-domain.xyz", subject: "Invoice #5678",
    payload: { invoiceId: "5678", amount: "$120.00" }, errorCode: "DNS_RESOLUTION_FAILED",
    errorMessage: "Could not resolve MX record for domain", retryCount: 4,
    isUnrecoverable: false, createdAt: "2026-02-20T14:30:00Z", lastRetryAt: "2026-02-20T14:33:00Z",
  },
  {
    id: "dlq-005", requestId: "req-s5t6u7v8", userId: "user-011",
    channel: "SMS", recipient: "+1555000000",
    payload: { message: "Your appointment is tomorrow" }, errorCode: "RATE_LIMIT_EXCEEDED",
    errorMessage: "Provider rate limit exceeded for destination", retryCount: 4,
    isUnrecoverable: false, createdAt: "2026-02-19T22:15:00Z", lastRetryAt: "2026-02-19T22:20:00Z",
  },
];

// === Templates ===
// MockTemplate uses the old "body"/"status" shape (from before backend alignment).
// Components that use mockTemplates should call adaptMockTemplates() to convert to
// the current NotificationTemplate shape.
export interface MockTemplate {
  id:          string;
  name:        string;
  channel:     string;
  subject?:    string;
  body:        string;        // old field name — use "content" in NotificationTemplate
  status:      "DRAFT" | "PUBLISHED" | "DEACTIVATED";
  version:     number;
  variables:   string[];
  createdAt:   string;
  updatedAt:   string;
  publishedAt?: string;
}

export const mockTemplates: MockTemplate[] = [
  {
    id: "tmpl-001", name: "Order Confirmation", channel: "EMAIL",
    subject: "Your Order #{{orderId}} is Confirmed",
    body: "<h1>Thank you, {{name}}!</h1><p>Your order #{{orderId}} for {{total}} has been confirmed.</p>",
    status: "PUBLISHED", version: 3, variables: ["name", "orderId", "total"],
    createdAt: "2026-01-15T10:00:00Z", updatedAt: "2026-02-10T14:00:00Z", publishedAt: "2026-02-10T14:00:00Z",
  },
  {
    id: "tmpl-002", name: "Welcome Email", channel: "EMAIL",
    subject: "Welcome to {{appName}}!",
    body: "<h1>Welcome, {{name}}!</h1><p>Thanks for joining {{appName}}. Get started by exploring our features.</p>",
    status: "PUBLISHED", version: 2, variables: ["name", "appName"],
    createdAt: "2026-01-10T08:00:00Z", updatedAt: "2026-02-05T09:00:00Z", publishedAt: "2026-02-05T09:00:00Z",
  },
  {
    id: "tmpl-003", name: "Password Reset", channel: "EMAIL",
    subject: "Reset Your Password",
    body: "<p>Hi {{name}}, click <a href='{{resetLink}}'>here</a> to reset your password. This link expires in {{expiry}} minutes.</p>",
    status: "PUBLISHED", version: 1, variables: ["name", "resetLink", "expiry"],
    createdAt: "2026-01-20T12:00:00Z", updatedAt: "2026-01-20T12:00:00Z", publishedAt: "2026-01-20T12:00:00Z",
  },
  {
    id: "tmpl-004", name: "OTP Verification", channel: "SMS",
    body: "Your {{appName}} verification code is: {{otp}}. Expires in {{expiry}} minutes.",
    status: "PUBLISHED", version: 1, variables: ["appName", "otp", "expiry"],
    createdAt: "2026-01-22T10:00:00Z", updatedAt: "2026-01-22T10:00:00Z", publishedAt: "2026-01-22T10:00:00Z",
  },
  {
    id: "tmpl-005", name: "Weekly Report", channel: "EMAIL",
    subject: "Your Weekly Report - {{weekRange}}",
    body: "<h2>Weekly Summary</h2><p>Total sent: {{totalSent}}</p><p>Success rate: {{successRate}}%</p>",
    status: "DRAFT", version: 1, variables: ["weekRange", "totalSent", "successRate"],
    createdAt: "2026-02-18T16:00:00Z", updatedAt: "2026-02-18T16:00:00Z",
  },
  {
    id: "tmpl-006", name: "Push Promotion", channel: "PUSH",
    subject: "{{title}}", body: "{{message}}",
    status: "DEACTIVATED", version: 2, variables: ["title", "message"],
    createdAt: "2026-01-05T08:00:00Z", updatedAt: "2026-02-01T10:00:00Z",
  },
];

// Adapter: convert MockTemplate → NotificationTemplate (current backend-aligned shape)
export function adaptMockTemplates(templates: MockTemplate[]): NotificationTemplate[] {
  return templates.map((t) => ({
    id:        t.id,
    name:      t.name,
    channel:   t.channel,
    subject:   t.subject,
    content:   t.body,
    version:   t.version,
    isActive:  t.status === "PUBLISHED",
    variables: t.variables,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));
}

// === API Keys ===
export const mockApiKeys: ApiKey[] = [
  {
    id: "key-001", name: "Production API Key", keyPrefix: "nfy_prod_a1b2",
    status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z",
    lastUsedAt: "2026-02-21T10:30:00Z", expiresAt: "2027-01-01T00:00:00Z", totalRequests: 184293,
  },
  {
    id: "key-002", name: "Staging API Key", keyPrefix: "nfy_stg_c3d4",
    status: "ACTIVE", createdAt: "2026-01-15T00:00:00Z",
    lastUsedAt: "2026-02-20T18:00:00Z", totalRequests: 42819,
  },
  {
    id: "key-003", name: "Development Key", keyPrefix: "nfy_dev_e5f6",
    status: "ACTIVE", createdAt: "2026-02-01T00:00:00Z",
    lastUsedAt: "2026-02-21T09:00:00Z", totalRequests: 8912,
  },
  {
    id: "key-004", name: "Legacy Service Key", keyPrefix: "nfy_leg_g7h8",
    status: "REVOKED", createdAt: "2025-06-01T00:00:00Z",
    lastUsedAt: "2025-12-15T00:00:00Z", totalRequests: 291034,
  },
];

// === Settings ===
export const mockSettings: SettingsData = {
  providers: [
    { channel: "EMAIL", provider: "SendGrid",    enabled: true,  config: { apiKey: "sg_***", fromEmail: "noreply@notifly.io" } },
    { channel: "EMAIL", provider: "AWS SES",     enabled: false, config: { region: "us-east-1", fromEmail: "noreply@notifly.io" } },
    { channel: "SMS",   provider: "Twilio",      enabled: true,  config: { accountSid: "AC***", fromNumber: "+15551234567" } },
    { channel: "SMS",   provider: "AWS SNS",     enabled: false, config: { region: "us-east-1" } },
    { channel: "PUSH",  provider: "Firebase FCM",enabled: true,  config: { projectId: "notifly-prod" } },
    { channel: "PUSH",  provider: "APNs",        enabled: false, config: { bundleId: "io.notifly.app" } },
  ],
  fallbackConfigs: [
    { channel: "EMAIL", fallbackOrder: ["SendGrid", "AWS SES"] },
    { channel: "SMS",   fallbackOrder: ["Twilio", "AWS SNS"] },
    { channel: "PUSH",  fallbackOrder: ["Firebase FCM", "APNs"] },
  ],
};

// === Helper to simulate paginated responses ===
export function paginateData<T>(data: T[], page = 0, size = 10): PaginatedResponse<T> {
  const start   = page * size;
  const content = data.slice(start, start + size);
  return {
    content,
    totalElements: data.length,
    totalPages:    Math.ceil(data.length / size),
    page,
    size,
  };
}