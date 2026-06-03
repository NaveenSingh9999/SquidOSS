# Getting Started with SquidOSS

SquidOSS is a self-hosted cloud storage platform — a complete drop-in replacement for
CloudBliss Storage (v11.0.44) with zero external API dependencies.

## Prerequisites

| Requirement | Minimum |
|-------------|---------|
| Node.js     | 18.x    |
| PostgreSQL  | 14.x    |
| Redis       | 6.x     |
| npm / pnpm / yarn / bun | any |

## One-Command Install

```bash
git clone <repo-url> SquidOSS && cd SquidOSS && ./crd build && ./crd start
```

This single command:
1. Clones the repository
2. Installs all backend & frontend dependencies
3. Generates `.env` with a random `JWT_SECRET`
4. Runs the 74-table database migration
5. Starts PostgreSQL and Redis (if not running)
6. Starts the backend on `http://localhost:3000`
7. Starts the frontend dev server on `http://localhost:5173`

## First-Time Setup

After starting, open `http://localhost:5173` in your browser.
You will be greeted by the **7-step Setup Wizard**:

1. **Welcome** — project introduction
2. **Admin Account** — create the first admin user
3. **Additional Users** — optionally invite team members
4. **Storage Provider** — choose between local/MinIO, S3, or Cloudflare R2
5. **Provider Configuration** — enter credentials for the chosen provider
6. **Name Your Instance** — give your SquidOSS a friendly name
7. **Ready!** — animated completion screen

Once setup completes, you can sign in with your admin credentials
and start using the full storage platform.

## Quick Start (No Wizard)

If you prefer to skip the wizard, register directly via the API:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}'

# Then login to get a JWT
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}'
```

## Directory Layout

```
SquidOSS/
├── backend/          # Fastify API server (src/server.ts)
│   ├── src/
│   │   ├── routes/   # 14 route modules (auth, files, shares, …)
│   │   ├── plugins/  # Auth, rate-limit plugins
│   │   ├── services/ # Redis pub/sub, caching
│   │   ├── db/       # PostgreSQL connection (slonik)
│   │   ├── middleware/# requireAuth hook
│   │   └── utils/    # Error classes, hashing
│   └── migrations/   # 001_schema.sql (74 tables)
├── src/              # React + Vite frontend
│   ├── pages/        # Route pages (Auth, Setup, Dashboard, …)
│   ├── components/   # 120+ UI components
│   ├── hooks/        # Custom React hooks
│   ├── contexts/     # Auth, PIN, BYOK, Theme contexts
│   └── lib/          # Client SDK, utilities, encryption
├── crd               # CLI shell wrapper
├── crd.js            # CLI Node.js script
└── read-first/       # This documentation directory
```

## Next Steps

Read the other guides in `read-first/` for detailed information:

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design
- [BACKEND.md](BACKEND.md) — API reference
- [FRONTEND.md](FRONTEND.md) — frontend guide
- [CLI.md](CLI.md) — `./crd` command reference
- [AUTHENTICATION.md](AUTHENTICATION.md) — auth & passkeys
- [DATABASE.md](DATABASE.md) — schema & queries
- [STORAGE.md](STORAGE.md) — file storage providers
- [SETUP.md](SETUP.md) — setup wizard details
- [DEPLOYMENT.md](DEPLOYMENT.md) — production deployment
