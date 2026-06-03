# SquidOSS Backend

The backend is a **Fastify** server written in TypeScript, running on port `3000`.

## Quick Start

```bash
cd backend && node ./node_modules/tsx/dist/cli.mjs src/server.ts
```

## Configuration (`backend/src/config.ts`)

All settings come from environment variables (`.env` file):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/squidoss` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | `dev-secret-change-in-production` | HMAC key for JWT tokens |
| `JWT_EXPIRES_IN` | `7d` | Token expiry duration |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |

## Route Map

### Public Routes (no auth required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (DB + Redis) |
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login with email + password |
| GET | `/auth/me` | Get current user (requires Bearer token) |
| POST | `/auth/passkey/register/begin` | Start WebAuthn registration |
| POST | `/auth/passkey/register/complete` | Complete WebAuthn registration |
| POST | `/auth/passkey/login/begin` | Start WebAuthn authentication |
| POST | `/auth/passkey/login/complete` | Complete WebAuthn authentication |
| POST | `/api/v1/shares/validate` | Validate a share link |

### Authenticated Routes (require `Authorization: Bearer <jwt>`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/files` | List user files |
| GET | `/files/:id/metadata` | Get file metadata |
| POST | `/files/upload` | Upload a file |
| GET | `/api/v1/keys` | List API keys |
| POST | `/api/v1/keys` | Create API key |
| DELETE | `/api/v1/keys/:id` | Delete API key |
| GET | `/api/v1/trash` | List trashed files |
| POST | `/api/v1/trash/restore` | Restore from trash |
| POST | `/api/v1/trash/cleanup` | Empty trash |
| DELETE | `/api/v1/trash/:id` | Permanently delete file |
| GET | `/api/v1/storage/providers` | List storage providers |
| POST | `/api/v1/storage/providers` | Add storage provider |
| DELETE | `/api/v1/storage/providers/:id` | Remove storage provider |
| POST | `/api/v1/video/stream` | Get signed video stream URL |
| POST | `/api/v1/storage/upload` | Upload to object storage |
| GET | `/api/v1/storage/download/:key` | Download from object storage |
| GET | `/api/v1/storage/list/:prefix` | List objects in storage |
| DELETE | `/api/v1/storage/remove/:key` | Remove object from storage |
| GET | `/api/v1/query/:table` | Query a table (allow-listed) |
| POST | `/api/v1/query/:table` | Insert into a table |
| PUT | `/api/v1/query/:table/:id` | Update a table row |
| DELETE | `/api/v1/query/:table/:id` | Delete from a table |
| POST | `/api/v1/rpc/:name` | Call a stored-procedure equivalent |

### Admin Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/auth` | 4-step admin authentication |
| GET | `/admin/users` | List all users |
| POST | `/admin/query` | Run read-only SQL queries |

### Edge Function Fallback

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/edge/:functionName` | Legacy Supabase edge function stub |

Registered edge functions: `github-storage`, `gemini-api`, `squid-ai-chat`,
`download-manager`, `download-shared-file`, `hls-generation`, `create-repos`,
`secure-file-metadata`, `send-workspace-invite`, `migration-oauth`,
`migration-oauth-callback`, `start-cloud-import`, `ink-ai`,
`start-migration`, `cli-operations`, `verify-admin`, `check-admin-status`,
`api-key-management`, `cloud-file-browser`, `admin-data-access`,
`github-cluster`, `get-app-updates`, `add-app-update`, `file-key`,
`video-stream-url`, `media-manifest`.

## Plugins

### Auth Plugin (`backend/src/plugins/auth.ts`)
- Verifies JWT from `Authorization: Bearer` header
- Attaches `request.user` (sub, email, role)
- Provides `fastify.authenticate` preHandler

### Rate Limit Plugin (`backend/src/plugins/rate-limit.ts`)
- Redis-backed rate limiting
- Per-IP with configurable window and max requests
- Falls back to in-memory if Redis is unavailable

## Middleware

### `requireAuth` (`backend/src/middleware/auth.ts`)
- Used by routes that need authentication
- Returns 401 if no valid JWT

## Source Map

```
backend/src/
├── app.ts          # Application builder (route registration)
├── server.ts       # Entry point (starts Fastify)
├── config.ts       # Environment config
├── db/
│   └── index.ts    # PostgreSQL connection (slonik)
├── middleware/
│   └── auth.ts     # requireAuth hook
├── plugins/
│   ├── auth.ts     # JWT verification plugin
│   └── rate-limit.ts # Rate limiting plugin
├── routes/
│   ├── admin.ts
│   ├── auth.ts
│   ├── file-operations.ts
│   ├── files.ts
│   ├── health.ts
│   ├── keys.ts
│   ├── passkey.ts
│   ├── query.ts
│   ├── rpc.ts
│   ├── shares.ts
│   ├── storage-providers.ts
│   ├── storage.ts
│   ├── trash.ts
│   └── video.ts
├── services/
│   └── redis.ts    # Redis connection & utilities
└── utils/
    ├── errors.ts   # AppError, NotFoundError, etc.
    └── hash.ts     # SHA-256 salt for API keys
```
