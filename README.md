<p align="center">
  <img src="public/icon.png" alt="SquidOSS" width="80" height="80" style="border-radius: 12px;">
</p>

<h1 align="center">SquidOSS</h1>

<p align="center">
  <strong>Self-hosted cloud storage that doesn't bleed you dry.</strong><br>
  <em>Zero API fees. No vendor lock-in. Your infra, your data.</em>
</p>

<p align="center">
  <a href="#-one-command-install"><img src="https://img.shields.io/badge/install-curl_%7C_bash-3B82F6?style=flat-square" alt="Install"></a>
  <a href="#-features"><img src="https://img.shields.io/badge/features-74_tables-10B981?style=flat-square" alt="Features"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-8B5CF6?style=flat-square" alt="License"></a>
  <a href="https://github.com/NaveenSingh9999/SquidOSS"><img src="https://img.shields.io/github/stars/NaveenSingh9999/SquidOSS?style=flat-square&color=F59E0B" alt="Stars"></a>
</p>

---

**SquidOSS** is a production-ready, self-hosted file storage platform that gives you Google Drive / Dropbox-level functionality — without paying per-seat, per-GB, or per-API-call. Built for developers who want control and users who want privacy.

> Based on CloudBliss Storage v11. **Completely rewritten** to remove all third-party dependencies (no Supabase, no Firebase, no Stripe, no Sentry).

---

## ✨ Why SquidOSS?

| Problem | SquidOSS Solution |
|---------|------------------|
| **Supabase costs $25+/month** just to store files | **$0** — bring your own PostgreSQL |
| **Google Drive charges $10/seat** for business | **Unlimited seats** — free |
| **Dropbox limits storage to 2TB** | **Your disk, your limit** |
| **Vendor lock-in** — migrating off Supabase is painful | **74-table exact schema** — portable, standard SQL |
| **Privacy? Your files on someone else's server** | **Self-hosted** — 100% air-gapped capable |
| **API rate limits** — 100 req/s on hobby plans | **Redis-backed rate limiting** — you control the cap |

---

## 🚀 One-Command Install

```bash
curl -fsSL https://raw.githubusercontent.com/NaveenSingh9999/SquidOSS/main/install.sh | bash
```

That's it. The script detects your OS (Linux, macOS, Windows, Termux), installs PostgreSQL + Redis + Node.js, clones the repo, runs the full 74-table schema migration, and creates a desktop launcher.

Or if you already have the repo:

```bash
./crd build    # deps + config + schema — one shot
./crd start    # backend (3000) + frontend (5173) daemons
./crd launcher # macOS .app / Windows .bat / Linux .desktop
```

Open **http://localhost:5173** → 8-step setup wizard → you're live.

<details>
<summary><strong>Per-platform launchers</strong></summary>

- **macOS**: Creates `SquidOSS.app` in `/Applications` — double-click opens Terminal with logs
- **Windows**: Creates `start-squidoss.bat` and `start-squidoss.ps1` — console window, one-click run
- **Linux**: Creates `.desktop` shortcut (only if desktop environment detected)

All use the SquidOSS favicon as the app icon.
</details>

---

## 🎯 Features

### For Users
- **📁 File management** — Upload, download, rename, move, trash, restore
- **📂 Folders** — Nested hierarchy with breadcrumbs
- **🔗 Share links** — Password-protected, expiring shares
- **🔍 Search** — Full-text file name search
- **📦 Compress / Extract** — Create & unpack ZIP archives
- **🖼 Preview** — Images, video, audio, PDF, text — full-screen modal
- **🔄 Version history** — Track file changes
- **🗑 Trash** — Recover or permanently delete

### For Developers
- **🔑 JWT + WebAuthn passkeys** — No OAuth2 complexity, no third-party auth
- **📡 REST API** — Full CRUD via `/api/v1/query/:table` (PostgREST-style)
- **🗄 74 PostgreSQL tables** — Exact Supabase schema replica, portable
- **⚡ Redis caching + rate limiting + pub/sub**
- **🔌 Multiple storage providers** — Local, S3, Cloudflare R2, GitHub repos
- **🔐 BYOK encryption** — Bring your own key for client-side encryption
- **🎬 Video streaming** — Signed URLs, HLS-compatible
- **🔑 API key management** — Salted SHA-256 hashing with usage logs
- **🖥 Admin dashboard** — User management, raw SQL access, audit logs
- **🧩 26 edge function stubs** — Backward compatible with existing CloudBliss code

### Enterprise
- **🏢 Workspaces** — Team collaboration with roles
- **📊 Analytics** — Storage usage, request logs, security events
- **🛡 Audit logging** — Every action logged
- **🔒 Client-side encryption** — Files encrypted before they leave your device
- **🌍 Distributed storage (res54)** — Files chunked across 10 GitHub repos / R2 buckets / S3
- **🔐 PIN auth** — Quick-access PIN for frequently used devices

---

## 🏗 Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  React 18 + Vite    │────▶│  Fastify API      │────▶│  PostgreSQL  │
│  (SPA, Tailwind)    │     │  (TypeScript)     │     │  (74 tables) │
│  Port 5173          │     │  Port 3000        │     └──────────────┘
└─────────────────────┘     │                  │     ┌──────────────┐
                            │  + Redis 7       │────▶│  Redis       │
                            │  + JWT Auth      │     │  (cache/q)   │
                            │  + WebAuthn      │     └──────────────┘
                            └──────────────────┘
```

**Frontend**: React 18, Vite, Tailwind CSS, React Router — no Framer Motion, no unnecessary dependencies. Minimal, fast, dark-themed.

**Backend**: Fastify + `postgres.js` — 14 route modules, JWT middleware, multipart uploads, Redis integration. No ORM, raw SQL for performance.

---

## 📊 Comparison

| | **SquidOSS** | **Supabase** | **Nextcloud** | **Google Drive** |
|---|---|---|---|---|
| Self-hosted | ✅ | ❌ (self-host = $599/mo) | ✅ | ❌ |
| Price | **$0** (your infra) | $25/mo+ | $0 (your infra) | $10/seat/mo |
| File encryption | ✅ Client-side BYOK | ❌ | ✅ (server-side) | ❌ |
| Storage limit | Your disk | 500GB (free) → 100TB ($599/mo) | Your disk | 2TB |
| API rate limits | You control | 100 req/s | Unlimited | 60 req/min |
| Multi-provider | ✅ S3, R2, GitHub, Local | ❌ | ❌ | ❌ |
| Passkey auth | ✅ WebAuthn | ❌ | ❌ | ✅ (paid) |
| Video streaming | ✅ Signed URLs + HLS | ❌ | ✅ | ✅ |
| Share with password | ✅ + expiry | ✅ | ✅ | ✅ |
| Open source | ✅ AGPL-3.0 | ❌ (modified MIT) | ✅ AGPL-3.0 | ❌ |

---

## 📖 Quick Links

| Guide | What you'll learn |
|-------|-------------------|
| [Getting Started](read-first/GETTING_STARTED.md) | Prerequisites, install, first run |
| [Architecture](read-first/ARCHITECTURE.md) | System design & data flow |
| [Backend](read-first/BACKEND.md) | API routes, plugins, configuration |
| [Frontend](read-first/FRONTEND.md) | Component tree, routing, state |
| [Setup Wizard](read-first/SETUP.md) | 8-step setup walkthrough |
| [Authentication](read-first/AUTHENTICATION.md) | JWT, WebAuthn passkeys |
| [Storage](read-first/STORAGE.md) | Providers, uploads, res54 |
| [Database](read-first/DATABASE.md) | Schema, queries, RPC functions |
| [CLI Reference](read-first/CLI.md) | All `./crd` commands |
| [Deployment](read-first/DEPLOYMENT.md) | Production, Docker, reverse proxy |

---

## 🛠 CLI Reference

```
Usage: ./crd <command>

Commands:
  install     Install system deps (PostgreSQL, Redis, Node)
  build       Configure + deps + migrate — one-shot setup
  start       Start backend + frontend daemons
  stop        Stop all daemons
  restart     Stop then start
  status      Show service status
  doctor      Diagnose environment
  configure   Generate .env from example
  migrate     Run full 74-table schema
  logs        [backend|frontend] Tail recent logs
  reset       Drop & recreate database
  update      Git pull + rebuild
  launcher    Create macOS .app / Windows .bat / Linux .desktop
  run         Run in foreground (Ctrl+C to stop)
```

---

## 💻 For Developers

```bash
git clone https://github.com/NaveenSingh9999/SquidOSS.git
cd SquidOSS
./crd build
./crd start
```

The API is **PostgREST-compatible**: `GET /api/v1/query/files?select=*&filter=is_deleted.false&order=created_at.desc`

All 74 tables are accessible via the query endpoint (whitelisted). Full RPC support for custom functions. The entire Supabase edge function API is mapped to Fastify routes.

Want to contribute? Check the `read-first/` guides and open a PR.

---

## 📜 License

AGPL-3.0 — Free to use, modify, and distribute. If you build a SaaS on top of SquidOSS, you must open-source your changes. Commercial licenses available on request.

---

<p align="center">
  <strong>Built with 🦑 by developers who got tired of cloud bills.</strong><br>
  <sub>No VC funding. No investor pressure. Just good open-source software.</sub>
</p>
