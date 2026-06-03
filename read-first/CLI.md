# SquidOSS CLI (`./crd`)

The `./crd` command is the single entry point for managing SquidOSS.
It wraps a Node.js script (`crd.js`) that handles building, starting,
stopping, and diagnosing the system.

## Usage

```bash
./crd <command>
```

## Commands

### `build`

Install all dependencies, generate `.env`, and run the database migration.

```bash
./crd build
```

This runs:
1. `./crd configure` — creates `.env` from `.env.example`
2. `npm install` (or pnpm/yarn/bun) in both `backend/` and root
3. `psql` migration — imports `backend/migrations/001_schema.sql`

### `start`

Start the backend and optionally the frontend dev server.

```bash
./crd start
# Or backend only
./crd start --backend-only
```

This:
1. Auto-starts PostgreSQL if it is not running
2. Auto-starts Redis if it is not running
3. Launches the backend server (`node tsx src/server.ts`) in the background
4. Launches the Vite dev server in the background
5. Saves PIDs to `.crd-pids.json` for clean shutdown

### `stop`

Stop all running SquidOSS processes (backend + frontend).

```bash
./crd stop
```

Sends `SIGTERM` to saved PIDs and also kills any orphaned `tsx.*server`
or `vite` processes.

### `status`

Show the status of all SquidOSS services.

```bash
./crd status
```

Displays:
- Backend process (running/stopped + health check)
- Frontend dev server (running/stopped)
- PostgreSQL (running/stopped)
- Redis (running/stopped)

### `doctor`

Run diagnostics on the SquidOSS environment.

```bash
./crd doctor
```

Checks:
- Node.js version (≥ 18)
- PostgreSQL connectivity
- Redis connectivity
- Backend dependencies installed
- Frontend dependencies installed
- `.env` file exists

### `configure`

Generate a `backend/.env` file from `.env.example`.

```bash
./crd configure
```

- Reads `backend/.env.example`
- Sets `DATABASE_URL` to `postgres://postgres@localhost:5432/squidoss`
- Sets `REDIS_URL` to `redis://localhost:6379`
- Generates a **random 256-bit JWT_SECRET**
- Writes to `backend/.env`

## Manual Control

### Start Backend Only
```bash
cd backend && node ./node_modules/tsx/dist/cli.mjs src/server.ts
```

### Start Frontend Only
```bash
npm run dev
```

### Run Migrations Manually
```bash
psql -h localhost -U postgres -d squidoss -f backend/migrations/001_schema.sql
```

## How PID Management Works

`crd.js` stores process IDs in `.crd-pids.json` at the project root:

```json
{
  "backend": 12345,
  "frontend": 12346,
  "timestamp": 1700000000000
}
```

The `stop` command reads this file and sends `SIGTERM` to each PID.
If a process died unexpectedly, `status` will detect it.

## Package Manager Auto-Detection

The CLI auto-detects which package manager to use by checking lock files:

1. `bun.lockb` → `bun`
2. `pnpm-lock.yaml` → `pnpm`
3. `yarn.lock` → `yarn`
4. (default) → `npm`
