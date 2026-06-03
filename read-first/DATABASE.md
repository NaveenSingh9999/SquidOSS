# SquidOSS Database

SquidOSS uses **PostgreSQL** as its primary database with an exact copy of
the Supabase schema (74 tables).

## Connection

Connection is managed via **slonik** (type-safe PostgreSQL client) in
`backend/src/db/index.ts`. Configuration comes from the `DATABASE_URL`
environment variable.

```
DATABASE_URL=postgres://user:password@host:5432/squidoss
```

## Schema

The full schema is at `backend/migrations/001_schema.sql` (8,582 lines,
74 tables). Key tables include:

### Core Tables
| Table | Purpose |
|-------|---------|
| `users` | User accounts and profiles |
| `files` | File metadata (name, size, type, path) |
| `folders` | Folder hierarchy |
| `storage_providers` | External storage provider credentials |
| `shares` | File share links (with passwords, expiry) |
| `workspaces` | Collaborative workspaces |
| `workspace_members` | Workspace membership and roles |

### Security Tables
| Table | Purpose |
|-------|---------|
| `user_passkeys` | WebAuthn credential IDs and public keys |
| `api_keys` | Salted SHA-256 API keys |
| `keyring_secrets` | Encrypted encryption keys |
| `audit_logs` | Security audit trail |

### App Tables
| Table | Purpose |
|-------|---------|
| `app_settings` | Application configuration |
| `extension_registry` | Extension metadata |
| `patch_notes` | Version release notes |
| `file_requests` | File upload requests |

## Schema Migration

The migration is run automatically by `./crd build`:

```bash
psql -h localhost -U postgres -d squidoss -f backend/migrations/001_schema.sql
```

## Dynamic Query Route

SquidOSS exposes a **dynamic query API** for table access
(`/api/v1/query/:table`) with a restricted allow-list for security.

### Allow-Listed Tables
```
files, folders, shares, storage_providers, workspaces,
workspace_members, api_keys, app_settings, extension_registry,
patch_notes, file_requests, keyring_secrets, audit_logs,
video_metadata, analytics_events, user_preferences, tags,
file_tags, bookmarks, recent_files
```

### Query Operations

**SELECT** with filters:
```bash
GET /api/v1/query/files?select=id,name,size&user_id=eq.abc123
```

**INSERT** a record:
```bash
curl -X POST http://localhost:3000/api/v1/query/files \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name":"file.txt","size":1024,"type":"text/plain"}'
```

**UPDATE** a record:
```bash
curl -X PUT http://localhost:3000/api/v1/query/files/123 \
  -H "Content-Type: application/json" \
  -d '{"name":"renamed.txt"}'
```

**DELETE** a record:
```bash
curl -X DELETE http://localhost:3000/api/v1/query/files/123
```

## RPC (Stored-Procedure Equivalents)

| RPC Name | Purpose |
|----------|---------|
| `delete_file_secure` | Soft-delete a file |
| `create_file_share` | Create a share link |
| `revoke_file_share` | Revoke a share |
| `get_shared_file_info` | Get share metadata |
| `get_or_create_default_workspace` | Ensure a default workspace |
| `get_workspace_role` | Check workspace permissions |
| `cleanup_trashed_files` | Permanently delete trashed files |
| `restore_from_trash` | Restore a file from trash |
| `encrypt_keyring_secret` | Store an encrypted secret |

## Redis

Redis is used alongside PostgreSQL for:

- **Query caching** — frequently accessed data
- **Rate limiting** — per-IP request tracking
- **Pub/Sub** — real-time events
- **Session cache** — temporary session data

Configuration:
```
REDIS_URL=redis://localhost:6379
```
