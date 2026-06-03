# SquidOSS Storage System

SquidOSS supports multiple **storage backends** for file data. The system is
designed to be flexible — you can use local storage, S3-compatible services,
or Cloudflare R2.

## Storage Providers

### Local / MinIO (Default)
Files are stored on the local filesystem or a MinIO instance.

```bash
# MinIO setup (Docker)
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  quay.io/minio/minio server /data --console-address ":9001"
```

Configure via environment:
```
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_REGION=us-east-1
STORAGE_BUCKET=squidoss-files
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
```

### Amazon S3
Any S3-compatible object store (AWS S3, DigitalOcean Spaces, Wasabi, etc.).

```bash
# Via API
curl -X POST http://localhost:3000/api/v1/storage/providers \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "providerType": "s3",
    "accessKeyId": "YOUR_ACCESS_KEY",
    "secretAccessKey": "YOUR_SECRET_KEY"
  }'
```

### Cloudflare R2
S3-compatible with **no egress fees** and global CDN.

```bash
curl -X POST http://localhost:3000/api/v1/storage/providers \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "providerType": "r2",
    "accountId": "YOUR_ACCOUNT_ID",
    "accessKeyId": "YOUR_ACCESS_KEY",
    "secretAccessKey": "YOUR_SECRET_KEY"
  }'
```

## Storage Routes

### Upload
```
POST /api/v1/storage/upload
Content-Type: multipart/form-data
```

### Download
```
GET /api/v1/storage/download/:key
```

### List Objects
```
GET /api/v1/storage/list/:prefix
```

### Delete Object
```
DELETE /api/v1/storage/remove/:key
```

## File Operations

### File Management
- **Upload** — single and batch uploads with progress tracking
- **Download** — direct downloads or signed URLs
- **Delete** — soft delete to trash, permanent delete from trash
- **Rename** — rename files and folders
- **Move** — move files between folders

### Compression
```
POST /api/v1/file-operations/compress
POST /api/v1/file-operations/extract
```
Supports ZIP, TAR, GZIP formats.

### Sharing
```
POST /api/v1/shares/validate  — validate a share link
```
Shares support:
- Password-protected links
- Expiration dates
- Optional download limits

### Trash
```
GET  /api/v1/trash          — list trashed files
POST /api/v1/trash/restore  — restore from trash
POST /api/v1/trash/cleanup  — empty trash
DELETE /api/v1/trash/:id    — permanently delete
```

## Encryption

SquidOSS supports **client-side encryption** via the BYOK (Bring Your Own Key)
system:

- Files are encrypted before upload using the user's key
- Keys are derived from a master passphrase
- Encrypted files are stored server-side
- The server never has access to the unencrypted content

## Video Streaming

```
POST /api/v1/video/stream
```
Generates signed streaming URLs for:
- HLS (HTTP Live Streaming) manifests
- Direct MP4 playback
- Adaptive bitrate streaming

## Storage Providers API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/storage/providers` | List configured providers |
| POST | `/api/v1/storage/providers` | Add a provider |
| DELETE | `/api/v1/storage/providers/:id` | Remove a provider |

Each provider stores encrypted credentials in the `storage_providers` table.
