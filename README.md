# SquidOSS

**Self-hosted cloud storage platform** — based on CloudBliss Storage v11.0.44.
Zero external API dependencies. PostgreSQL + Redis backend, React frontend.

## One-Command Install

```bash
git clone <repo-url> SquidOSS && cd SquidOSS && ./crd build && ./crd start
```

Open **http://localhost:5173** and follow the 7-step setup wizard.

## Features

- **Fully self-hosted** — no Supabase, no Firebase, no third-party APIs
- **JWT authentication** with WebAuthn passkey support
- **74-table PostgreSQL schema** (exact Supabase replica)
- **Redis** for caching, rate limiting, and pub/sub
- **Multiple storage backends**: local, MinIO, S3, Cloudflare R2
- **File management**: upload, download, share (with passwords & expiry), trash, compress
- **Workspaces** for team collaboration
- **Client-side encryption** (BYOK)
- **Video streaming** with signed URLs and HLS
- **API key management** with salted SHA-256 hashing
- **Admin dashboard** with user management and SQL query access
- **26 legacy edge function stubs** for backwards compatibility

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  React + Vite│────▶│ Fastify API  │────▶│  PostgreSQL  │
│  (SPA)       │     │ (Node.js)    │     │  (74 tables) │
└──────────────┘     │              │     └──────────────┘
                     │ + Redis      │
                     └──────────────┘
```

## Quick Links

| Guide | Description |
|-------|-------------|
| [read-first/GETTING_STARTED.md](read-first/GETTING_STARTED.md) | Prerequisites, install, first run |
| [read-first/ARCHITECTURE.md](read-first/ARCHITECTURE.md) | System design overview |
| [read-first/BACKEND.md](read-first/BACKEND.md) | API routes, plugins, config |
| [read-first/FRONTEND.md](read-first/FRONTEND.md) | Frontend structure & components |
| [read-first/SETUP.md](read-first/SETUP.md) | Setup wizard walkthrough |
| [read-first/AUTHENTICATION.md](read-first/AUTHENTICATION.md) | JWT auth & WebAuthn passkeys |
| [read-first/STORAGE.md](read-first/STORAGE.md) | Storage providers & file ops |
| [read-first/DATABASE.md](read-first/DATABASE.md) | Schema, queries, RPC |
| [read-first/CLI.md](read-first/CLI.md) | `./crd` command reference |
| [read-first/DEPLOYMENT.md](read-first/DEPLOYMENT.md) | Production deployment |

## CLI Reference

```bash
./crd build     # Install deps, configure, migrate
./crd start     # Start backend + frontend
./crd stop      # Stop all services
./crd status    # Show running services
./crd doctor    # Diagnose environment
./crd configure # Generate .env
```

## Requirements

- Node.js 18+
- PostgreSQL 14+
- Redis 6+

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Fastify, TypeScript, slonik (PostgreSQL) |
| Frontend | React 18, Vite, Tailwind CSS, Framer Motion |
| Database | PostgreSQL (74 tables), Redis |
| Auth | JWT (jsonwebtoken), WebAuthn (@simplewebauthn/server) |
| Storage | Local filesystem, S3-compatible, Cloudflare R2 |

## License

AGPL-3.0
