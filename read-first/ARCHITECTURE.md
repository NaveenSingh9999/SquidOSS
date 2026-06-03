# SquidOSS Architecture

SquidOSS is a **self-hosted cloud storage platform** with a clear separation
between backend API, frontend SPA, and data layers.

## High-Level Overview

```
┌──────────────────────────────────────────────────────┐
│                   Browser (SPA)                       │
│         React 18 + TypeScript + Vite                  │
│         http://localhost:5173                          │
└────────────────────────┬─────────────────────────────┘
                         │ HTTP / WebAuthn
                         ▼
┌──────────────────────────────────────────────────────┐
│              Fastify API Server (Node.js)              │
│         http://localhost:3000                          │
│                                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐  │
│  │  Routes   │ │  Plugins │ │  Edge Functions      │  │
│  │  (14)     │ │  (3)     │ │  (26 implementations)│  │
│  └─────┬─────┘ └─────┬────┘ └──────────┬───────────┘  │
│        │              │                 │               │
│        ▼              ▼                 ▼               │
│  ┌────────────────────────────────────────────────┐    │
│  │           PostgreSQL (slonik)                   │    │
│  │           74 tables, exact Supabase schema      │    │
│  └────────────────────────────────────────────────┘    │
│        ▲                                               │
│  ┌─────┴─────┐                                         │
│  │   Redis    │                                         │
│  │ Cache/Pub  │                                         │
│  │ Sub/Rate   │                                         │
│  └───────────┘                                         │
└──────────────────────────────────────────────────────┘
```

## Backend (Fastify)

The backend is a Fastify application with:

- **14 route modules** — one per domain (auth, files, shares, keys, trash,
  storage-providers, video, admin, file-operations, query, rpc, storage,
  passkey, health)
- **3 plugins** — CORS, multipart upload, authentication
- **26 edge-function handlers** — legacy-compatible stubs mapped from
  the original Supabase edge functions
- **Middleware** — JWT verification via `requireAuth` hook

All routes are registered in `backend/src/app.ts` via `await app.register()`.

## Frontend (React + Vite)

The frontend is a single-page application with:

- **30+ pages** — lazy-loaded with `React.lazy()` and route-based splitting
- **120+ components** — organized by domain
- **7 context providers** — Auth, PIN, BYOK, Theme, FileView, Squidset, etc.
- **20+ hooks** — custom React hooks for shared logic
- **SquidOSS Client** — a drop-in `@supabase/supabase-js` replacement in
  `src/lib/squidoss-client.ts`

## Data Layer

### PostgreSQL (Primary Database)

- Exact replica of the Supabase schema: **74 tables**, including users,
  files, folders, shares, workspaces, storage_providers, user_passkeys, etc.
- Connection via **slonik** (type-safe PostgreSQL client)
- Schema migration: `backend/migrations/001_schema.sql`

### Redis (Caching & Pub/Sub)

Used for:
- **Cache** — frequent queries, session data
- **Rate limiting** — per-IP and per-route limits
- **Pub/Sub** — real-time events (file changes, notifications)

### Storage Backends

Supports multiple storage providers:
- **Local filesystem** (via MinIO or direct path)
- **Amazon S3** — any S3-compatible object store
- **Cloudflare R2** — S3-compatible with free egress
- Configurable via the Setup Wizard or Storage Providers API

## Key Design Decisions

1. **No Supabase dependencies** — all functionality is self-hosted
2. **JWT-based authentication** — no third-party auth providers
3. **WebAuthn passkeys** — passwordless auth via browser credentials API
4. **Table allow-list** — the query route restricts access to ~30 safe tables
5. **PID-based process management** — `./crd` tracks backend/frontend PIDs
