# SquidOSS Deployment Guide

## Quick Deploy (Single Server)

```bash
# Prerequisites: Node.js 18+, PostgreSQL 14+, Redis 6+
git clone <repo-url> SquidOSS
cd SquidOSS
./crd build    # Install deps, configure, migrate
./crd start    # Start backend + frontend
```

The backend listens on `http://0.0.0.0:3000` and the frontend dev server
on `http://0.0.0.0:5173`.

## Production Deployment

### 1. Environment Variables

Create `backend/.env` with production values:

```
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
DATABASE_URL=postgres://squidoss:password@db-host:5432/squidoss
REDIS_URL=redis://redis-host:6379
JWT_SECRET=<random-256-bit-hex>
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://your-domain.com
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

### 2. Build Frontend for Production

```bash
npm run build
# Output goes to dist/
```

Serve the `dist/` folder with Nginx, Caddy, or any static file server.

### 3. Run Backend as a Service (systemd)

Create `/etc/systemd/system/squidoss-backend.service`:

```ini
[Unit]
Description=SquidOSS Backend
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=squidoss
WorkingDirectory=/opt/SquidOSS/backend
ExecStart=/usr/bin/node /opt/SquidOSS/backend/node_modules/tsx/dist/cli.mjs /opt/SquidOSS/backend/src/server.ts
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable squidoss-backend
sudo systemctl start squidoss-backend
```

### 4. Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/ssl/certs/your-domain.pem;
    ssl_certificate_key /etc/ssl/private/your-domain.key;

    # Frontend static files
    root /opt/SquidOSS/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Auth & health endpoints
    location /auth/ {
        proxy_pass http://127.0.0.1:3000;
    }

    location /health {
        proxy_pass http://127.0.0.1:3000;
    }

    location /admin/ {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

### 5. Docker Deployment

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: squidoss
      POSTGRES_PASSWORD: squidoss
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://postgres:squidoss@postgres:5432/squidoss
      REDIS_URL: redis://redis:6379
      JWT_SECRET: <random-256-bit-hex>
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis

  frontend:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  pgdata:
```

### 6. Database Backup

```bash
# Daily backup
pg_dump -U postgres squidoss > backup-$(date +%Y%m%d).sql

# Restore
psql -U postgres -d squidoss -f backup-20250101.sql
```

## Hardware Recommendations

| Scale | Users | RAM | CPU | Storage |
|-------|-------|-----|-----|---------|
| Small | 1-10 | 2 GB | 2 cores | 50 GB SSD |
| Medium | 10-100 | 4 GB | 4 cores | 200 GB SSD |
| Large | 100-1000 | 8 GB | 8 cores | 500 GB SSD |

## Monitoring

- Health check: `GET /health` (returns `{"status":"healthy","database":"connected"}`)
- Check logs: `tail -f /var/log/squidoss-backend.log`
- Redis monitoring: `redis-cli info`
- PostgreSQL monitoring: `pg_stat_activity`
