# Notifly - Distributed Notification Platform

## System Architecture Overview

Notifly is a production-ready, enterprise-grade notification orchestration system built with:

- **Database**: PostgreSQL (Supabase) with Row Level Security
- **Message Queue**: Apache Kafka with retry topics and DLQ
- **Caching**: Redis for rate limiting and API key caching
- **Frontend**: React with Next.js 16, Tailwind CSS, shadcn/ui
- **Authentication**: JWT and API Key-based auth

## Database Schema

### Core Tables

#### `tenants` - Multi-tenant isolation
```sql
- id: UUID (PRIMARY KEY)
- name: VARCHAR (UNIQUE)
- slug: VARCHAR (UNIQUE)
- created_at, updated_at: TIMESTAMPS
```
Root table for all multi-tenancy operations. Every record in other tables has `tenant_id` foreign key.

#### `api_keys` - API authentication
```sql
- id: UUID
- tenant_id: UUID (FK)
- key_hash: VARCHAR (bcrypt)
- key_prefix: VARCHAR (for display)
- role: ENUM ('ADMIN', 'SERVICE')
- revoked: BOOLEAN
- last_used_at: TIMESTAMP
- UNIQUE(tenant_id, key_prefix)
```
Stores API keys with bcrypt hashing. Keys are never returned in logs, only prefix shown.

#### `admin_users` - User management
```sql
- id: UUID
- tenant_id: UUID (FK)
- email: VARCHAR (UNIQUE per tenant)
- password_hash: VARCHAR (bcrypt)
- role: ENUM ('ADMIN', 'EDITOR', 'VIEWER')
- is_active: BOOLEAN
- UNIQUE(tenant_id, email)
```
Admin users for dashboard access. Passwords are bcrypt hashed.

#### `notification_requests` - Main notification table
```sql
- id: UUID
- tenant_id: UUID (FK)
- request_id: UUID (from client)
- idempotency_key: VARCHAR (for deduplication)
- event_type: VARCHAR
- payload: JSONB
- payload_hash: VARCHAR (SHA256)
- status: ENUM ('PENDING', 'ACCEPTED', 'PROCESSING', 'SENT', 'FAILED')
- created_at, updated_at: TIMESTAMPS
- UNIQUE(tenant_id, request_id)
- UNIQUE(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
```
Tracks all notification requests with idempotency support.

#### `notification_outbox` - Transactional Outbox Pattern
```sql
- id: UUID
- tenant_id: UUID (FK)
- aggregate_id: UUID (request_id)
- event_payload: JSONB
- status: ENUM ('PENDING', 'SENT', 'FAILED')
- retry_count: INT
- last_error: TEXT
- created_at, updated_at, sent_at: TIMESTAMPS
```
Guarantees exactly-once delivery using the outbox pattern. Polled by Kafka producer.

#### `notification_logs` - Delivery tracking
```sql
- id: UUID
- tenant_id: UUID (FK)
- request_id: UUID (FK)
- channel: ENUM ('EMAIL', 'SMS', 'PUSH', 'WEBHOOK')
- status: ENUM ('PENDING', 'SENT', 'FAILED', 'RETRYING')
- retry_attempt: INT
- provider_latency_ms: BIGINT
- error_message: TEXT
- error_details: JSONB
- created_at, updated_at: TIMESTAMPS
- UNIQUE(tenant_id, request_id, channel, retry_attempt)
```
Per-channel delivery tracking with latency metrics.

#### `retry_attempts` - Retry orchestration
```sql
- id: UUID
- tenant_id: UUID (FK)
- notification_log_id: UUID (FK)
- attempt_number: INT
- retry_count: INT
- max_retries: INT
- next_retry_at: TIMESTAMP
- error_code: VARCHAR
- error_message: TEXT
- created_at, updated_at: TIMESTAMPS
- INDEX on next_retry_at for polling
```
Tracks retry scheduling with exponential backoff.

#### `failed_notifications` - Dead Letter Queue
```sql
- id: UUID
- tenant_id: UUID (FK)
- request_id: UUID (FK)
- channel: VARCHAR
- error_code: VARCHAR
- error_details: JSONB
- manual_retry_attempted: BOOLEAN
- manual_retry_count: INT
- created_at, updated_at: TIMESTAMPS
```
Contains notifications that exceeded max retries and require manual intervention.

#### `notification_templates` - Template management
```sql
- id: UUID
- tenant_id: UUID (FK)
- name: VARCHAR
- version: INT
- channel: ENUM ('EMAIL', 'SMS', 'PUSH', 'WEBHOOK')
- subject: VARCHAR (for EMAIL)
- content: TEXT
- variables: JSONB (template variables)
- is_active: BOOLEAN
- created_by: UUID (FK to admin_users)
- created_at, updated_at: TIMESTAMPS
- UNIQUE(tenant_id, name, version)
```
Versioned templates with variable substitution.

#### `event_channel_policy` - Channel fallback
```sql
- id: UUID
- tenant_id: UUID (FK)
- event_type: VARCHAR
- fallback_order: JSONB (array of channels)
- created_at, updated_at: TIMESTAMPS
- UNIQUE(tenant_id, event_type)
```
Example: `["EMAIL", "SMS", "PUSH"]` - if EMAIL fails, try SMS, then PUSH.

#### `retry_policy` - Retry configuration
```sql
- id: UUID
- tenant_id: UUID (FK)
- event_type: VARCHAR
- max_attempts: INT (default 5)
- initial_delay_ms: BIGINT (default 1000)
- max_delay_ms: BIGINT (default 60000)
- backoff_multiplier: NUMERIC (default 1.5)
- UNIQUE(tenant_id, event_type)
```
Exponential backoff: delay = min(initial_delay * multiplier^attempt, max_delay)

#### `rate_limit_config` - Rate limiting
```sql
- id: UUID
- tenant_id: UUID (UNIQUE)
- requests_per_minute: INT (default 1000)
- requests_per_hour: INT (default 50000)
- burst_limit: INT (default 5000)
- created_at, updated_at: TIMESTAMPS
```
Enforced via Redis INCR operations.

#### `user_channel_preferences` - User opt-out
```sql
- id: UUID
- tenant_id: UUID (FK)
- user_id: VARCHAR
- channel: ENUM ('EMAIL', 'SMS', 'PUSH', 'WEBHOOK')
- is_enabled: BOOLEAN
- created_at, updated_at: TIMESTAMPS
- UNIQUE(tenant_id, user_id, channel)
```
User-level channel preferences for GDPR compliance.

#### `admin_audit_logs` - Compliance auditing
```sql
- id: UUID
- tenant_id: UUID (FK)
- user_id: UUID (FK to admin_users)
- action: VARCHAR
- resource_type: VARCHAR
- resource_id: VARCHAR
- changes: JSONB
- ip_address: VARCHAR
- user_agent: TEXT
- created_at: TIMESTAMP
```
Complete audit trail of all administrative actions.

### Views

#### `v_notification_stats`
Real-time statistics of notifications in the last 24 hours:
- total_notifications
- sent_count
- failed_count
- avg_latency_ms

#### `v_failed_notification_summary`
Failure summary by channel and error code for the last 7 days.

## Kafka Topics

### Topic Structure

```
notifications                    # Initial notifications (10 partitions, RF=3)
notifications.retry.1s           # 1-second retry delay
notifications.retry.5s           # 5-second retry delay
notifications.retry.30s          # 30-second retry delay
notifications.dlq                # Dead Letter Queue (max 3 attempts)
```

### Message Headers

All Kafka messages include headers for tracing and retry logic:

```json
{
  "correlation-id": "uuid",              // Trace ID across systems
  "tenant-id": "uuid",                   // Multi-tenant isolation
  "retry-count": "0",                    // Attempt counter
  "original-topic": "notifications",     // Source topic
  "timestamp": "1708123456789",          // Message timestamp
  "request-id": "uuid"                   // Request tracking
}
```

## API Endpoints

### Submit Notification

```
POST /api/notifications
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "eventType": "user.signup",
  "payload": {
    "userId": "user123",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "userId": "user123",
  "idempotencyKey": "optional-unique-key"
}

Response (202 Accepted):
{
  "requestId": "uuid",
  "status": "ACCEPTED",
  "correlationId": "uuid"
}
```

### Get Notification Status

```
GET /api/notifications/{requestId}
Authorization: Bearer {API_KEY}

Response (200 OK):
{
  "notification": {
    "id": "uuid",
    "requestId": "uuid",
    "status": "SENT",
    "createdAt": "2024-02-20T10:30:00Z"
  },
  "logs": [
    {
      "channel": "EMAIL",
      "status": "SENT",
      "latencyMs": 234,
      "createdAt": "2024-02-20T10:30:05Z"
    }
  ]
}
```

### Dashboard Endpoints

All dashboard endpoints require JWT or API Key authentication.

```
GET /api/admin/metrics                   # Dashboard metrics
GET /api/admin/logs                      # Notification logs
GET /api/admin/dlq                       # Dead Letter Queue
GET /api/admin/api-keys                  # List API keys
POST /api/admin/api-keys                 # Create API key
DELETE /api/admin/api-keys/{keyId}       # Revoke API key
GET /api/admin/settings                  # Get settings
PUT /api/admin/settings                  # Update settings
```

## Authentication

### API Key Authentication

1. **Generate Key**: `nf_` prefix + random string
2. **Format**: `Bearer nf_live_xxxxx.yyyyy` (prefix.hash)
3. **Storage**: Hash stored in DB, never returned after creation
4. **Caching**: 1-hour Redis cache with hash verification
5. **Revocation**: Instant via DB flag

### JWT Authentication

1. **Generation**: Email/password login creates JWT
2. **Payload**: userId, email, role, tenantId, iat, exp
3. **Storage**: localStorage with secure flag
4. **Expiration**: 7 days default
5. **Refresh**: Manual re-login (implement refresh tokens in production)

## Retry Logic

### Exponential Backoff

```
Initial Delay: 1000ms
Max Delay: 60000ms
Multiplier: 1.5

Attempt 1: Immediate (0ms)
Attempt 2: 1000ms × 1.5^0 = 1000ms
Attempt 3: 1000ms × 1.5^1 = 1500ms
Attempt 4: 1000ms × 1.5^2 = 2250ms
Attempt 5: 1000ms × 1.5^3 = 3375ms (capped at 60000ms)
```

### Retry Topics

- **notifications**: Initial attempt
- **notifications.retry.1s**: After 1-second wait
- **notifications.retry.5s**: After 5-second wait
- **notifications.retry.30s**: After 30-second wait
- **notifications.dlq**: Moved here after max retries

## Channel Fallback

### Example Policy

```json
{
  "eventType": "user.signup",
  "fallbackOrder": ["EMAIL", "SMS", "PUSH"]
}
```

When EMAIL fails:
1. Log failure to `failed_notifications`
2. Try SMS next (same request)
3. If SMS also fails, try PUSH
4. If all fail and retries exhausted → DLQ

## Rate Limiting

### Redis-based Implementation

```typescript
// Per minute
INCR ratelimit:{tenantId}:minute
EXPIRE ratelimit:{tenantId}:minute 60

// Per hour
INCR ratelimit:{tenantId}:hour
EXPIRE ratelimit:{tenantId}:hour 3600

// If exceeded: return HTTP 429 (Too Many Requests)
```

### Configuration

```json
{
  "requestsPerMinute": 1000,
  "requestsPerHour": 50000,
  "burstLimit": 5000
}
```

## Frontend Features

### Authentication
- Email/password login for admins
- API key login for service accounts
- Auto-logout on 401 responses

### Dashboard
- Real-time metrics (24h view)
- Channel performance breakdown
- Delivery status distribution
- System health indicators

### Notification Logs
- Search by request ID
- Filter by status and channel
- Export functionality
- Auto-refresh every 10 seconds

### API Key Management
- Create/revoke keys
- Display name and role assignment
- Last used tracking
- Usage examples

### Dead Letter Queue
- Manual retry of failed notifications
- Error details view
- Delete option
- Failed notification summary

### Settings
- Retry policy configuration
- Rate limit adjustment
- Backoff calculation preview
- System information

## Error Codes

```
VALIDATION_FAILED         - 400 Bad Request
RATE_LIMIT_EXCEEDED      - 429 Too Many Requests
IDEMPOTENT_CONFLICT      - 409 Conflict
CHANNEL_DISABLED         - 400 Bad Request
TEMPLATE_NOT_FOUND       - 404 Not Found
TENANT_NOT_FOUND         - 404 Not Found
INVALID_API_KEY          - 401 Unauthorized
DELIVERY_FAILED          - 502 Bad Gateway (retryable)
RETRY_EXHAUSTED          - 500 Internal Server Error
INTERNAL_ERROR           - 500 Internal Server Error
```

## Security Features

### Password Security
- bcrypt hashing (cost factor 12)
- No plaintext storage
- Secure comparison checks

### API Key Security
- No key returned after creation
- Hash-based verification
- Revocation support
- Rate limiting per key

### Database Security
- Row Level Security (RLS) enabled
- Tenant isolation at table level
- Parameter queries (no SQL injection)
- Audit logging of all changes

### Network Security
- HTTPS only (in production)
- CORS configuration
- Rate limiting
- Correlation IDs for tracing

## Observability

### Metrics
- Total notifications submitted
- Success rate percentage
- Failed count
- Average provider latency
- Per-channel metrics

### Logging
- Audit trail of all actions
- Delivery logs per channel
- Error details with JSONB
- Request correlation IDs

### Monitoring
- System health status
- API gateway availability
- Kafka consumer health
- PostgreSQL connection status

## Deployment Checklist

- [ ] Database migrations applied
- [ ] Kafka topics created
- [ ] Redis instance available
- [ ] API keys configured
- [ ] Environment variables set
- [ ] HTTPS certificates installed
- [ ] Monitoring configured
- [ ] Backup strategy in place
- [ ] Load balancing setup
- [ ] Rate limits tuned

## Production Considerations

1. **Database**: Use RDS/Supabase with automated backups
2. **Kafka**: Multi-broker cluster with replication
3. **Redis**: Redis Cluster or Elasticache with persistence
4. **Monitoring**: Prometheus + Grafana for metrics
5. **Alerting**: PagerDuty/Opsgenie integration
6. **Scaling**: Auto-scale Kafka consumers based on lag
7. **Security**: Vault for secret management
8. **Testing**: E2E tests for retry scenarios

