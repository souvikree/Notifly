# Notifly - Production-Ready Distributed Notification Platform

A complete, enterprise-grade notification orchestration system built with Next.js, React, PostgreSQL (Supabase), Apache Kafka, and Redis. Designed for reliability, scalability, and compliance.

## Features

### Core Capabilities
- **Multi-tenant architecture** with complete data isolation via Row Level Security
- **Exactly-once delivery** using transactional outbox pattern
- **Idempotency support** for safe request retries
- **Exponential backoff retry logic** with configurable policies
- **Channel fallback** - automatically retry failed notifications on alternative channels
- **Dead Letter Queue (DLQ)** for manual intervention on failed notifications
- **Rate limiting** via Redis with per-minute and per-hour controls
- **Kafka-based** message routing with retry topics (1s, 5s, 30s delays)
- **Complete audit logging** for compliance and debugging

### Frontend Features
- **Real-time dashboard** with 24h metrics and channel performance
- **API key management** with secure creation and revocation
- **Notification logs** with search, filtering, and export
- **Dead Letter Queue explorer** with manual retry capability
- **Settings page** for retry policy and rate limit configuration
- **Responsive SaaS UI** using shadcn/ui components
- **Authentication** via JWT and API keys

### Security & Compliance
- **bcrypt password hashing** (cost factor 12)
- **API key encryption** with revocation support
- **Row-level security** in PostgreSQL
- **Audit trail** of all administrative actions
- **GDPR-ready** user preferences and consent management
- **SQL injection prevention** via parameterized queries
- **CORS and rate limiting** protection

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         React Frontend                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Dashboard    │  │ API Keys Mgmt│  │ DLQ Explorer / Logs  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└──────────────────┬──────────────────────────────────────────────┘
                   │ HTTPS
┌──────────────────▼──────────────────────────────────────────────┐
│                    Next.js API Routes                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ /api/notifications  /api/auth  /api/admin/*               │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────────────────────────┘
                   │
      ┌────────────┼────────────┬──────────────┐
      │            │            │              │
  ┌───▼───┐   ┌───▼────┐   ┌──▼─────┐   ┌───▼────┐
  │ Kafka │   │PostgreSQL  │ Redis  │   │Supabase│
  │Topics │   │(RLS)      │        │   │  Auth  │
  └───┬───┘   └───┬────┘   └──┬─────┘   └────────┘
      │           │            │
      └───┬───────┴────────┬───┘
          │                │
    ┌─────▼──────┐   ┌────▼─────────┐
    │   Workers  │   │ Notification │
    │(Consumers) │   │  Services    │
    └────────────┘   └──────────────┘
```

## Database Schema

### 14 Core Tables
- `tenants` - Multi-tenant root isolation
- `api_keys` - Secure API key management (bcrypt hashed)
- `admin_users` - User account management
- `notification_requests` - Main notification tracking (with idempotency)
- `notification_outbox` - Transactional outbox for guaranteed delivery
- `notification_logs` - Per-channel delivery tracking
- `retry_attempts` - Retry scheduling and orchestration
- `failed_notifications` - Dead Letter Queue
- `notification_templates` - Versioned notification templates
- `event_channel_policy` - Channel fallback configuration
- `retry_policy` - Configurable exponential backoff
- `rate_limit_config` - Per-tenant rate limiting
- `user_channel_preferences` - User opt-out preferences
- `admin_audit_logs` - Compliance audit trail

### Key Features
- **Row Level Security (RLS)** - Tenant isolation at database level
- **30+ Optimized Indexes** - GIN indexes on JSONB, composite indexes on common queries
- **2 Analytical Views** - Real-time stats and failure summaries
- **Foreign Key Constraints** - Data integrity with CASCADE delete

## Kafka Topics

```
notifications              - Initial notification queue
notifications.retry.1s     - 1-second delay retry topic
notifications.retry.5s     - 5-second delay retry topic
notifications.retry.30s    - 30-second delay retry topic
notifications.dlq          - Dead Letter Queue
```

Headers attached to all messages:
- `correlation-id` - Trace ID across systems
- `tenant-id` - Multi-tenant routing
- `retry-count` - Attempt number
- `original-topic` - Source topic tracking
- `timestamp` - Message creation time
- `request-id` - Notification request ID

## API Specification

### Public API

#### Submit Notification
```
POST /api/notifications
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "eventType": "user.signup",
  "payload": { "userId": "123", "email": "user@example.com" },
  "userId": "123",
  "idempotencyKey": "optional-unique-key"
}

Response: 202 Accepted
{
  "requestId": "uuid",
  "status": "ACCEPTED",
  "correlationId": "uuid"
}
```

#### Get Notification Status
```
GET /api/notifications/{requestId}
Authorization: Bearer {API_KEY}

Response: 200 OK
{
  "notification": { ... },
  "logs": [ ... ]
}
```

### Admin Dashboard APIs

All require JWT or API key with ADMIN role:

```
GET /api/admin/metrics                  - Dashboard metrics
GET /api/admin/logs                     - Notification logs
GET /api/admin/dlq                      - Dead Letter Queue
POST /api/admin/dlq/{id}/retry          - Retry failed notification
DELETE /api/admin/dlq/{id}              - Delete from DLQ
GET /api/admin/api-keys                 - List API keys
POST /api/admin/api-keys                - Create API key
DELETE /api/admin/api-keys/{id}         - Revoke API key
GET /api/admin/settings                 - Get configuration
PUT /api/admin/settings                 - Update configuration
```

## Retry Logic

### Exponential Backoff Calculation
```
Initial Delay: 1000ms
Max Delay: 60000ms
Backoff Multiplier: 1.5

Attempt 1: Immediate
Attempt 2: 1000ms
Attempt 3: 1500ms
Attempt 4: 2250ms
Attempt 5: 3375ms (respects max delay cap)
```

### Flow
1. Submit notification → Initial topic
2. On failure, publish to retry topic
3. Worker waits for retry delay
4. Retry from retry topic
5. After max attempts → Dead Letter Queue

## Authentication

### API Key Authentication
- Format: `nf_live_{prefix}.{hash}`
- Prefix stored for display
- Hash stored with bcrypt for verification
- 1-hour Redis cache for performance
- Revocation is instant

### JWT Authentication
- Generated on login with email/password
- 7-day expiration
- Contains: userId, email, role, tenantId
- Stored securely in localStorage

## Rate Limiting

### Redis-Based Implementation
```
Per Minute: 1000 requests (default)
Per Hour: 50000 requests (default)
Burst Limit: 5000 (default)

Returns HTTP 429 when exceeded
Configurable per tenant via settings
```

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 13+ (via Supabase)
- Kafka 3.0+
- Redis 6.0+

### Installation

1. **Clone and install**
```bash
git clone <repo>
cd notifly
npm install
```

2. **Set environment variables**
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
POSTGRES_URL=postgresql://user:pass@localhost/db

# Kafka
KAFKA_BROKERS=localhost:9092

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# API
NEXT_PUBLIC_API_URL=http://localhost:8080/v1
```

3. **Run database migrations**
```bash
npm run db:migrate
```

4. **Initialize Kafka topics**
```bash
npm run kafka:init
```

5. **Start development server**
```bash
npm run dev
```

6. **Access dashboard**
- Navigate to `http://localhost:3000`
- Login with demo credentials (see login page)

## Project Structure

```
app/
  ├── api/
  │   ├── auth/
  │   │   ├── login/route.ts           # Email/password auth
  │   │   └── verify-api-key/route.ts  # API key verification
  │   ├── notifications/route.ts       # Public notification API
  │   └── admin/
  │       ├── metrics/route.ts
  │       ├── logs/route.ts
  │       ├── dlq/route.ts
  │       └── api-keys/route.ts
  ├── dashboard/
  │   ├── layout.tsx                   # Protected layout with sidebar
  │   ├── page.tsx                     # Main dashboard
  │   ├── logs/page.tsx                # Notification logs
  │   ├── api-keys/page.tsx            # API key management
  │   ├── dlq/page.tsx                 # Dead Letter Queue
  │   └── settings/page.tsx            # Configuration
  └── login/page.tsx                   # Authentication page
components/
  ├── dashboard-sidebar.tsx            # Navigation component
  └── ui/                              # shadcn/ui components
lib/
  ├── auth-context.tsx                 # Auth state & logic
  ├── api-client.ts                    # Axios API client
  ├── kafka.ts                         # Kafka configuration
  ├── notification-service.ts          # Core business logic
  └── utils.ts
supabase/
  └── migrations/
      └── 001_create_notification_schema.sql
```

## Key Features Deep Dive

### Multi-Tenancy
- Every table has `tenant_id` primary key
- Row Level Security policies for isolation
- Tenant context extracted from JWT or API key
- Zero cross-tenant data leakage

### Idempotency
- Unique constraint: `(tenant_id, request_id)`
- Redis layer for fast rejection (24h TTL)
- Payload hash for consistency verification
- Safe to retry requests multiple times

### Transactional Outbox
- Notification saved → Outbox entry created → Committed atomically
- No dual-write problem
- Outbox polled and published to Kafka
- Guarantees exactly-once delivery

### Rate Limiting
- Redis sliding window algorithm
- Per-tenant enforcement
- Configurable limits (per-minute, per-hour, burst)
- Returns HTTP 429 with Retry-After header

### Channel Fallback
- Configurable per event type
- Example: EMAIL → SMS → PUSH
- Attempts channels in priority order
- Logs all attempts for debugging

### Dead Letter Queue
- Failed notifications after max retries
- Manual retry capability
- Error details for investigation
- Audit trail of retry attempts

## Monitoring

### Dashboard Metrics
- Total notifications submitted
- Success rate (%)
- Failed notifications count
- Average delivery latency (ms)
- Per-channel metrics
- System health status

### Key Queries
```sql
-- Recent notifications
SELECT * FROM notification_requests 
ORDER BY created_at DESC LIMIT 10;

-- Delivery status by channel
SELECT channel, status, COUNT(*) 
FROM notification_logs 
GROUP BY channel, status;

-- Failed notifications
SELECT * FROM failed_notifications 
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Retry attempts pending
SELECT * FROM retry_attempts 
WHERE next_retry_at <= NOW();
```

## Testing

### Manual Testing Checklist
- [ ] Submit notification via API
- [ ] Check notification status
- [ ] Verify delivery log entries
- [ ] Test rate limiting (exceed limits)
- [ ] Create and revoke API key
- [ ] Manually retry failed notification
- [ ] Check audit logs
- [ ] Verify idempotency (same key twice)

### Example Tests
```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# Load testing
npm run test:load
```

## Deployment

### Production Checklist
- [ ] Use Supabase Pro with automated backups
- [ ] Configure Kafka broker replication
- [ ] Set up Redis Cluster or Elasticache
- [ ] Enable HTTPS everywhere
- [ ] Configure monitoring (Prometheus/Datadog)
- [ ] Set up alerting for DLQ growth
- [ ] Enable log aggregation (ELK/Splunk)
- [ ] Test disaster recovery
- [ ] Document runbooks

### Scaling
- **Horizontal**: Add Kafka consumer instances
- **Vertical**: Increase worker memory/CPU
- **Database**: Use read replicas for queries
- **Cache**: Use Redis Cluster for redundancy

## Documentation

- **[SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)** - Complete technical specifications
- **[IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)** - Step-by-step setup and examples

## Security Best Practices

1. **Secrets Management**
   - Use environment variables
   - Never commit .env files
   - Rotate API keys regularly

2. **Database**
   - Enable RLS on all tables
   - Use parameterized queries
   - Regular backups

3. **API Security**
   - HTTPS only (production)
   - CORS for known origins only
   - Rate limiting enabled
   - Input validation

4. **Compliance**
   - Audit logging enabled
   - User preferences respected
   - GDPR-ready

## Troubleshooting

### Common Issues

**Notifications in DLQ**
- Check error details in `failed_notifications` table
- Verify channel provider credentials
- Review retry policy settings

**Rate Limit Errors**
- Check `rate_limit_config` for current limits
- Verify Redis connectivity
- Review tenant usage patterns

**High Kafka Consumer Lag**
- Scale up consumer instances
- Check provider response times
- Monitor worker CPU/memory

**Failed API Key Validation**
- Verify key format: `nf_live_prefix.hash`
- Check if key is revoked
- Confirm tenant_id matches

## Contributing

1. Create feature branch
2. Follow the architecture patterns
3. Add tests
4. Update documentation
5. Submit PR

## License

Proprietary - Notifly Inc.

## Support

For issues or questions:
- Check documentation in SYSTEM_ARCHITECTURE.md
- Review IMPLEMENTATION_GUIDE.md for setup help
- Examine error logs with correlation IDs
- Contact support@notifly.io

---

**Notifly v1.0** - Built for reliability, scale, and compliance.

