import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Book,
  Code,
  Database,
  Server,
  Cloud,
  Shield,
  Zap,
  Search,
  ArrowLeft,
  ExternalLink,
  FileText,
  Layers,
  Lock,
  Cpu,
  Globe,
  Terminal,
  Package,
  GitBranch,
  Settings,
  Users,
  FileCode,
  Boxes,
  Workflow,
  Sparkles
} from '@/lib/icon-map';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useIsMobile } from '@/hooks/use-mobile';
import MobileScrollToTop from '@/components/MobileScrollToTop';

interface DocSection {
  id: string;
  title: string;
  description: string;
  icon: any;
  category: 'guide' | 'api' | 'architecture' | 'blog';
  content: string;
  tags: string[];
}

const Documentation = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentDoc, setCurrentDoc] = useState<DocSection | null>(null);

  const docSections: DocSection[] = [
    {
      id: 'getting-started',
      title: 'Getting Started',
      description: 'Learn how to get started with SquidCloud Storage',
      icon: Book,
      category: 'guide',
      tags: ['beginner', 'setup', 'introduction'],
      content: `# Getting Started with SquidCloud Storage

## Welcome to SquidCloud! 🎉

SquidCloud is a powerful, secure, and unlimited cloud storage platform built with modern web technologies. This guide will help you get started quickly.

### Quick Start

1. **Sign Up**: Create your free account at [squidcloud](https://squidcloud.inflate.live)
2. **Verify Email**: Check your inbox for verification email
3. **Upload Files**: Start uploading your files immediately
4. **Organize**: Create folders and organize your content
5. **Share**: Share files securely with anyone

### Key Features

- 🚀 **Unlimited Storage**: No storage limits, upload as much as you need
- 🔒 **Military-Grade Security**: AES-256 encryption for all files
- 📱 **Cross-Platform**: Works on desktop, mobile, and tablets
- 🌐 **CDN Distribution**: Fast file delivery worldwide
- 🔗 **Secure Sharing**: Share files with password protection
- 🎨 **Rich Previews**: Preview images, videos, PDFs, and more
- 🔌 **Developer API**: Powerful REST API for integrations
- 🧩 **Extensions**: Extend functionality with custom extensions

### First Steps

#### Creating Your First Folder

\`\`\`bash
1. Navigate to Dashboard
2. Click "New Folder" button
3. Enter folder name
4. Click "Create"
\`\`\`

#### Uploading Files

\`\`\`bash
1. Click "Upload" button or drag & drop files
2. Select files from your device
3. Wait for upload to complete
4. Files appear in your current folder
\`\`\`

#### Sharing a File

\`\`\`bash
1. Click on any file
2. Click "Share" button
3. Choose sharing options:
   - Public link
   - Password protected
   - Expiration date
4. Copy share link
\`\`\`

### System Requirements

**Browser Support:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Mobile Apps:**
- iOS 13+ (PWA)
- Android 8+ (PWA)

### Need Help?

### Need Help?

- 📧 Support: support@inflate.live
- 💼 Product: hello@inflate.live
- 💬 Discord: [Join our community](https://discord.gg/cloudbliss)
- 📖 Documentation: [squidcloud.inflate.live](https://squidcloud.inflate.live)

---

**Next Steps:**
- Read the [Architecture Overview](#architecture)
- Explore the [API Documentation](#api-reference)
- Learn about [Security Features](#security)
`
    },
    {
      id: 'architecture',
      title: 'Architecture Overview',
      description: 'Deep dive into SquidCloud system architecture',
      icon: Layers,
      category: 'architecture',
      tags: ['architecture', 'system-design', 'infrastructure'],
      content: `# SquidCloud Architecture

## System Architecture Overview

SquidCloud is built on a modern, scalable architecture designed for performance, security, and reliability.

### High-Level Architecture

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  React   │  │  Mobile  │  │ Desktop  │  │   CLI    │   │
│  │   PWA    │  │   App    │  │  Electron│  │   Tool   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTPS/WSS
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Supabase Edge Functions + REST API                 │   │
│  │  - Authentication & Authorization                    │   │
│  │  - Rate Limiting & DDoS Protection                  │   │
│  │  - Request Validation                                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Auth       │  │   Storage    │  │   Extensions │     │
│  │   Service    │  │   Service    │  │   Service    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      Data Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  PostgreSQL  │  │   Supabase   │  │    Redis     │     │
│  │   Database   │  │   Storage    │  │    Cache     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
\`\`\`

### Technology Stack

#### Frontend
- **React 18**: Modern UI library with hooks
- **TypeScript**: Type-safe development
- **Vite**: Lightning-fast build tool
- **TailwindCSS**: Utility-first CSS framework
- **Shadcn/UI**: Beautiful component library
- **React Query**: Data fetching & caching
- **Zustand**: Lightweight state management

#### Backend
- **Supabase**: Backend-as-a-Service
  - PostgreSQL Database
  - Real-time subscriptions
  - Edge Functions
  - Authentication
  - Storage with CDN
- **Edge Functions**: Serverless compute
- **Row Level Security**: Database-level security

#### Infrastructure
- **Vercel**: Frontend hosting & edge network
- **Supabase Cloud**: Database & storage
- **Cloudflare**: CDN & DDoS protection
- **GitHub Actions**: CI/CD pipelines

### Database Schema

#### Core Tables

**users**
- id (uuid, primary key)
- email (text, unique)
- encrypted_password (text)
- created_at (timestamp)
- last_login (timestamp)

**files**
- id (uuid, primary key)
- user_id (uuid, foreign key)
- name (text)
- size (bigint)
- mime_type (text)
- storage_path (text)
- is_public (boolean)
- created_at (timestamp)
- updated_at (timestamp)

**folders**
- id (uuid, primary key)
- user_id (uuid, foreign key)
- name (text)
- parent_id (uuid, nullable)
- created_at (timestamp)

**shares**
- id (uuid, primary key)
- file_id (uuid, foreign key)
- password (text, nullable)
- expires_at (timestamp, nullable)
- download_count (integer)
- max_downloads (integer, nullable)

**extensions**
- id (uuid, primary key)
- name (text)
- version (text)
- author_id (uuid, foreign key)
- manifest_url (text)
- approval (text) - 'pending' | 'on_review' | 'approved'
- is_active (boolean)
- downloads (integer)

### Security Architecture

#### Authentication Flow
1. User submits credentials
2. Supabase Auth validates
3. JWT token issued (1 hour expiry)
4. Refresh token stored (30 days)
5. Token included in all requests

#### File Encryption
- All files encrypted at rest (AES-256)
- Unique encryption key per user
- Keys stored in encrypted vault
- End-to-end encryption option available

#### Row Level Security (RLS)
\`\`\`sql
-- Example RLS Policy
CREATE POLICY "Users can only access own files"
ON files FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can only update own files"
ON files FOR UPDATE
USING (auth.uid() = user_id);
\`\`\`

### Performance Optimizations

#### Caching Strategy
- **Browser Cache**: Static assets (1 year)
- **CDN Cache**: Files (30 days)
- **API Cache**: Metadata (5 minutes)
- **Redis Cache**: User sessions (24 hours)

#### Upload Optimization
- Chunked uploads (5MB chunks)
- Parallel chunk processing
- Resume capability
- Compression before upload

#### Download Optimization
- CDN distribution (150+ locations)
- HTTP/2 multiplexing
- Gzip/Brotli compression
- Range request support

### Scalability

#### Horizontal Scaling
- Stateless API servers
- Load balancing
- Auto-scaling based on traffic
- Multi-region deployment

#### Database Scaling
- Read replicas for queries
- Connection pooling (PgBouncer)
- Query optimization
- Partitioning for large tables

### Monitoring & Observability

- **Application Monitoring**: Sentry
- **Performance Monitoring**: Vercel Analytics
- **Database Monitoring**: Supabase Dashboard
- **Uptime Monitoring**: UptimeRobot
- **Log Aggregation**: Supabase Logs

---

**Related Documentation:**
- [Security Best Practices](#security)
- [API Architecture](#api-reference)
- [Extension System](#extensions)
`
    },
    {
      id: 'api-reference',
      title: 'API Reference',
      description: 'Complete REST API documentation',
      icon: Code,
      category: 'api',
      tags: ['api', 'rest', 'endpoints', 'reference'],
      content: `# SquidCloud API Reference

## Overview

SquidCloud provides a comprehensive REST API for programmatic access to all platform features.

**Base URL:** \`https://api.SquidCloud.com/v1\`

**Authentication:** Bearer token in Authorization header

### Quick Example

\`\`\`bash
curl -X GET "https://api.SquidCloud.com/v1/files" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"
\`\`\`

## Authentication

### Get API Key

1. Navigate to **Developer API** page
2. Click "Generate New API Key"
3. Copy and store securely
4. Use in all API requests

### API Key Format

\`\`\`
cb_<random_26_chars>
Example: cb_926d45e7f8a9b0c1d2e3f4g5h6
\`\`\`

### Using API Keys

**Header Authentication:**
\`\`\`bash
Authorization: Bearer cb_your_api_key_here
\`\`\`

**Query Parameter (not recommended):**
\`\`\`bash
?api_key=cb_your_api_key_here
\`\`\`

## Core Endpoints

### Files API

#### List Files
\`\`\`http
GET /api/files
\`\`\`

**Query Parameters:**
- \`folder_id\` (string, optional) - Filter by folder
- \`limit\` (number, default: 50) - Results per page
- \`offset\` (number, default: 0) - Pagination offset
- \`search\` (string, optional) - Search query

**Response:**
\`\`\`json
{
  "data": [
    {
      "id": "uuid",
      "name": "document.pdf",
      "size": 1024000,
      "mime_type": "application/pdf",
      "storage_path": "files/user_id/uuid.pdf",
      "is_public": false,
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-01T00:00:00Z"
    }
  ],
  "count": 42,
  "limit": 50,
  "offset": 0
}
\`\`\`

#### Upload File
\`\`\`http
POST /api/files/upload
Content-Type: multipart/form-data
\`\`\`

**Body:**
\`\`\`
file: <binary>
folder_id: <uuid> (optional)
is_public: <boolean> (optional)
\`\`\`

**Response:**
\`\`\`json
{
  "id": "uuid",
  "name": "uploaded-file.jpg",
  "size": 2048000,
  "url": "https://cdn.SquidCloud.com/files/...",
  "created_at": "2025-01-01T00:00:00Z"
}
\`\`\`

#### Get File Details
\`\`\`http
GET /api/files/:id
\`\`\`

**Response:**
\`\`\`json
{
  "id": "uuid",
  "name": "file.pdf",
  "size": 1024000,
  "mime_type": "application/pdf",
  "storage_path": "files/...",
  "is_public": false,
  "share_url": null,
  "download_count": 15,
  "created_at": "2025-01-01T00:00:00Z"
}
\`\`\`

#### Download File
\`\`\`http
GET /api/files/:id/download
\`\`\`

**Response:** Binary file stream

#### Delete File
\`\`\`http
DELETE /api/files/:id
\`\`\`

**Response:**
\`\`\`json
{
  "message": "File deleted successfully",
  "id": "uuid"
}
\`\`\`

### Folders API

#### Create Folder
\`\`\`http
POST /api/folders
Content-Type: application/json
\`\`\`

**Body:**
\`\`\`json
{
  "name": "My Folder",
  "parent_id": "uuid or null"
}
\`\`\`

#### List Folders
\`\`\`http
GET /api/folders?parent_id=uuid
\`\`\`

### Sharing API

#### Create Share Link
\`\`\`http
POST /api/shares
Content-Type: application/json
\`\`\`

**Body:**
\`\`\`json
{
  "file_id": "uuid",
  "password": "optional",
  "expires_at": "2025-12-31T23:59:59Z",
  "max_downloads": 10
}
\`\`\`

**Response:**
\`\`\`json
{
  "id": "uuid",
  "share_url": "https://SquidCloud.com/file/abc123",
  "password_protected": true,
  "expires_at": "2025-12-31T23:59:59Z"
}
\`\`\`

### Analytics API

#### Get Storage Stats
\`\`\`http
GET /api/analytics/storage
\`\`\`

**Response:**
\`\`\`json
{
  "total_files": 1542,
  "total_size": 10737418240,
  "total_downloads": 5230,
  "storage_by_type": {
    "images": 5368709120,
    "videos": 4294967296,
    "documents": 1073741824
  }
}
\`\`\`

#### Get API Usage
\`\`\`http
GET /api/analytics/api-usage
\`\`\`

**Response:**
\`\`\`json
{
  "total_requests": 15420,
  "requests_by_endpoint": {
    "/api/files": 8230,
    "/api/folders": 3190,
    "/api/shares": 4000
  },
  "rate_limit": {
    "limit": 10000,
    "remaining": 7580,
    "reset_at": "2025-01-02T00:00:00Z"
  }
}
\`\`\`

## Rate Limits

| Plan | Requests/Hour | Requests/Day |
|------|--------------|--------------|
| Free | 1,000 | 10,000 |
| Pro | 10,000 | 100,000 |
| Enterprise | Unlimited | Unlimited |

**Rate Limit Headers:**
\`\`\`
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1735689600
\`\`\`

## Error Handling

### Error Response Format
\`\`\`json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key",
    "details": "The provided API key is invalid or has been revoked"
  }
}
\`\`\`

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| UNAUTHORIZED | 401 | Invalid or missing API key |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 422 | Invalid request data |
| RATE_LIMITED | 429 | Too many requests |
| SERVER_ERROR | 500 | Internal server error |

## Webhooks

Subscribe to events in your SquidCloud account.

### Event Types
- \`file.uploaded\`
- \`file.deleted\`
- \`file.shared\`
- \`folder.created\`
- \`share.accessed\`

### Webhook Payload
\`\`\`json
{
  "event": "file.uploaded",
  "timestamp": "2025-01-01T00:00:00Z",
  "data": {
    "file_id": "uuid",
    "file_name": "document.pdf",
    "user_id": "uuid"
  }
}
\`\`\`

## SDKs & Libraries

### JavaScript/TypeScript
\`\`\`bash
npm install @SquidCloud/sdk
\`\`\`

\`\`\`typescript
import { SquidCloud } from '@SquidCloud/sdk';

const client = new SquidCloud({
  apiKey: 'cb_your_api_key'
});

// Upload file
const file = await client.files.upload({
  file: fileBuffer,
  name: 'document.pdf'
});

// List files
const files = await client.files.list({
  limit: 50
});
\`\`\`

### Python
\`\`\`bash
pip install SquidCloud
\`\`\`

\`\`\`python
from SquidCloud import SquidCloud

client = SquidCloud(api_key='cb_your_api_key')

# Upload file
file = client.files.upload(
    file=open('document.pdf', 'rb'),
    name='document.pdf'
)

# List files
files = client.files.list(limit=50)
\`\`\`

---

**Related Documentation:**
- [Authentication Guide](#security)
- [Rate Limiting](#rate-limits)
- [Webhooks Setup](#webhooks)
`
    },
    {
      id: 'extensions',
      title: 'Extension System',
      description: 'Build and publish extensions with SquidLab SDK',
      icon: Package,
      category: 'guide',
      tags: ['extensions', 'squidlab', 'development'],
      content: `# SquidLab Extension System

## Overview

The SquidLab Extension System allows developers to extend SquidCloud functionality with custom applications, tools, and integrations.

### What are Extensions?

Extensions are sandboxed mini-applications that run within SquidCloud, with controlled access to user data through a secure API.

### Key Features

- 🔒 **Sandboxed Execution**: Extensions run in isolated iframes
- 🔑 **Token-Based Security**: All API calls validated with security tokens
- ✅ **Approval System**: 3-phase review process (pending → on_review → approved)
- 🎨 **Rich SDK**: Access to files, storage, notifications, and more
- 📦 **.sqe Format**: Standardized extension packaging
- 🚀 **Easy Distribution**: Publish to Extension Lab marketplace

## Getting Started

### Installation

\`\`\`bash
npm install -g squidlab-sdk
# or
yarn global add squidlab-sdk
\`\`\`

### Create Your First Extension

\`\`\`bash
# Create new extension
squidlab create my-extension

# Navigate to directory
cd my-extension

# Install dependencies
npm install

# Start development server
npm run dev
\`\`\`

### Project Structure

\`\`\`
my-extension/
├── manifest.json       # Extension metadata
├── index.html         # Main entry point
├── index.js           # Application logic
├── styles.css         # Styling
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── package.json
\`\`\`

## Manifest Configuration

### manifest.json

\`\`\`json
{
  "name": "My Extension",
  "version": "1.0.0",
  "description": "A sample extension for SquidCloud",
  "author": {
    "name": "Your Name",
    "email": "you@example.com",
    "url": "https://yoursite.com"
  },
  "category": "productivity",
  "entry": "index.html",
  "permissions": [
    "files.read",
    "files.write",
    "notifications"
  ],
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "repository": "https://github.com/username/my-extension"
}
\`\`\`

### Available Permissions

| Permission | Description |
|-----------|-------------|
| \`files.read\` | Read user files |
| \`files.write\` | Create/update files |
| \`files.delete\` | Delete files |
| \`user.profile\` | Access user profile |
| \`storage.quota\` | View storage quota |
| \`api.access\` | Make API calls |
| \`notifications\` | Send notifications |

## SquidLab SDK API

### Global SDK Object

When your extension loads, the SDK is automatically injected:

\`\`\`javascript
// Available globally
window.__SQUIDLAB_SDK__
\`\`\`

### File Operations

#### Fetch Files
\`\`\`javascript
// List all files
const files = await window.__SQUIDLAB_SDK__.sqfetch('/api/files');

// Get specific file
const file = await window.__SQUIDLAB_SDK__.sqfetch('/api/files/uuid');
\`\`\`

#### Upload File
\`\`\`javascript
const file = document.querySelector('input[type="file"]').files[0];
const result = await window.__SQUIDLAB_SDK__.squpload(
  '/api/files/upload',
  file
);
console.log('Uploaded:', result);
\`\`\`

#### Download File
\`\`\`javascript
const blob = await window.__SQUIDLAB_SDK__.sqdownload('file-uuid');
// Create download link
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'filename.ext';
a.click();
\`\`\`

#### Delete File
\`\`\`javascript
await window.__SQUIDLAB_SDK__.sqdelete('file-uuid');
\`\`\`

### Notifications

\`\`\`javascript
// Show success notification
window.__SQUIDLAB_SDK__.showNotification(
  'Success!',
  'File uploaded successfully',
  'success'
);

// Show error
window.__SQUIDLAB_SDK__.showNotification(
  'Error',
  'Failed to upload file',
  'error'
);

// Show info
window.__SQUIDLAB_SDK__.showNotification(
  'Info',
  'Processing...',
  'info'
);
\`\`\`

### Settings Persistence

\`\`\`javascript
// Save settings
await window.__SQUIDLAB_SDK__.saveSettings({
  theme: 'dark',
  autoSave: true,
  refreshInterval: 30
});

// Load settings
const settings = await window.__SQUIDLAB_SDK__.loadSettings();
console.log(settings.theme); // 'dark'
\`\`\`

## Security Architecture

### Token-Based Authentication

Every extension session gets a unique security token:

\`\`\`javascript
// Token format
squid_{userId}_{extensionId}_{timestamp}_{random}
\`\`\`

All messages between extension and parent window must include this token for validation.

### Message Validation

\`\`\`javascript
// Parent window validates every message
function handleExtensionMessage(event) {
  const { type, token, extensionId, data } = event.data;
  
  // Validate token
  if (token !== currentSecurityToken) {
    console.error('Invalid security token');
    return;
  }
  
  // Validate extension ID
  if (extensionId !== currentExtensionId) {
    console.error('Invalid extension ID');
    return;
  }
  
  // Process request
  handleRequest(type, data);
}
\`\`\`

### Approval Process

Extensions go through a 3-phase approval:

1. **Pending** (⏸️ Yellow)
   - Extension just published
   - Not visible in marketplace
   - Only developer can install

2. **On Review** (⏳ Blue)
   - Admin is reviewing code
   - Security audit in progress
   - Not yet public

3. **Approved** (✓ Green)
   - Code reviewed and approved
   - Visible in marketplace
   - Available for all users

**Official Extensions** (✓ Blue Checkmark):
- Published by \`naveen@inflate.live\`
- Auto-approved
- Verified badge shown

## Building & Publishing

### Build Extension

\`\`\`bash
# Build for production
squidlab build

# Output: dist/ folder with optimized files
\`\`\`

### Convert to .sqe

\`\`\`bash
# Convert to .sqe package
squidlab convert

# Output: my-extension-1.0.0.sqe
\`\`\`

### Publish to Extension Lab

1. Navigate to **Extension Lab**
2. Click **"My Extensions"** tab
3. Click **"New Extension"**
4. Upload your \`.sqe\` file
5. Fill in metadata (auto-populated from manifest)
6. Click **"Publish Extension"**
7. Wait for admin approval

### Update Extension

\`\`\`bash
# Update version in manifest.json
{
  "version": "1.1.0"
}

# Rebuild
squidlab build
squidlab convert

# Re-publish with new version
\`\`\`

## Example: File Preview Extension

\`\`\`html
<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>File Preview Cards</title>
  <style>
    .card {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
      margin: 8px;
      cursor: pointer;
    }
    .card:hover {
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
  </style>
</head>
<body>
  <div id="app">
    <h1>My Files</h1>
    <div id="files"></div>
  </div>

  <script>
    async function loadFiles() {
      try {
        const files = await window.__SQUIDLAB_SDK__.sqfetch('/api/files');
        const container = document.getElementById('files');
        
        files.data.forEach(file => {
          const card = document.createElement('div');
          card.className = 'card';
          card.innerHTML = \`
            <h3>\${file.name}</h3>
            <p>Size: \${formatSize(file.size)}</p>
            <p>Type: \${file.mime_type}</p>
          \`;
          
          card.onclick = () => downloadFile(file.id);
          container.appendChild(card);
        });
        
        window.__SQUIDLAB_SDK__.showNotification(
          'Loaded',
          \`\${files.data.length} files loaded\`,
          'success'
        );
      } catch (error) {
        window.__SQUIDLAB_SDK__.showNotification(
          'Error',
          'Failed to load files',
          'error'
        );
      }
    }
    
    async function downloadFile(fileId) {
      const blob = await window.__SQUIDLAB_SDK__.sqdownload(fileId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'file';
      a.click();
    }
    
    function formatSize(bytes) {
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      if (bytes === 0) return '0 Bytes';
      const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
      return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
    }
    
    // Load files on startup
    loadFiles();
  </script>
</body>
</html>
\`\`\`

## Best Practices

### Performance
- ✅ Lazy load large datasets
- ✅ Debounce API calls
- ✅ Use pagination for lists
- ✅ Cache responses when possible

### Security
- ✅ Never store API keys in code
- ✅ Validate all user input
- ✅ Use HTTPS for external requests
- ✅ Request minimal permissions

### UX
- ✅ Show loading states
- ✅ Handle errors gracefully
- ✅ Provide clear feedback
- ✅ Make UI responsive

### Code Quality
- ✅ Write clean, documented code
- ✅ Follow naming conventions
- ✅ Add error handling
- ✅ Test thoroughly before publishing

---

**Related Documentation:**
- [API Reference](#api-reference)
- [Security Architecture](#architecture)
- [Extension Lab Guide](#getting-started)
`
    },
    {
      id: 'security',
      title: 'Security & Privacy',
      description: 'Learn about SquidCloud security measures',
      icon: Shield,
      category: 'guide',
      tags: ['security', 'privacy', 'encryption'],
      content: `# Security & Privacy

## Our Commitment

SquidCloud takes security and privacy seriously. We implement industry-leading security measures to protect your data.

### Security Features

#### 🔒 Encryption
- **At Rest**: Multi-layer encryption (AES-256, ChaCha20-Poly1305)
- **In Transit**: TLS 1.3 with perfect forward secrecy
- **End-to-End**: Optional E2E with RSA-4096 + AES-GCM
- **Key Management**: Hardware Security Module (HSM) backed
- **Zero-Knowledge**: Client-side encryption available

#### 🔑 Authentication
- **Multi-Factor Auth (MFA)**: TOTP-based 2FA
- **OAuth Support**: Google, GitHub, Microsoft login
- **Session Management**: Secure JWT tokens with refresh
- **Password Policy**: Bcrypt hashing with salt

#### 🛡️ Authorization
- **Row Level Security**: Database-level access control
- **API Key Scoping**: Granular permission control
- **Role-Based Access**: User, Admin, Developer roles

#### 🚨 Monitoring
- **Real-time Alerts**: Suspicious activity detection
- **Audit Logs**: Complete activity tracking
- **Intrusion Detection**: Automated threat response
- **DDoS Protection**: Cloudflare enterprise protection

### Privacy Policy

- ✅ **Zero-Knowledge**: We can't read your encrypted files
- ✅ **No Selling**: We never sell your data
- ✅ **GDPR Compliant**: Full compliance with EU regulations
- ✅ **Right to Delete**: Delete your account anytime
- ✅ **Data Export**: Download all your data

### Security Best Practices

#### For Users
1. Enable 2FA on your account
2. Use strong, unique passwords
3. Don't share API keys
4. Review connected apps regularly
5. Use password-protected shares

#### For Developers
1. Store API keys securely (env variables)
2. Use least-privilege permissions
3. Validate all user input
4. Implement rate limiting
5. Enable webhook signature validation

### Compliance

- ✅ GDPR (EU)
- ✅ CCPA (California)
- ✅ SOC 2 Type II
- ✅ ISO 27001
- ✅ HIPAA (Enterprise)

### Report Security Issues

**Security Email**: support@inflate.live
**Product Team**: hello@inflate.live

---

**Related Documentation:**
- [Authentication Guide](#api-reference)
- [Data Encryption](#architecture)
`
    },
    {
      id: 'blog-launch',
      title: 'SquidCloud Launch Announcement',
      description: 'Introducing SquidCloud - The Future of Cloud Storage',
      icon: Zap,
      category: 'blog',
      tags: ['announcement', 'launch', 'news'],
      content: `# 🚀 Introducing SquidCloud: The Future of Cloud Storage

**Published: January 1, 2025**

We're thrilled to announce the official launch of SquidCloud - a revolutionary cloud storage platform designed for the modern web.

## Why We Built SquidCloud

Traditional cloud storage solutions are expensive, limited, and often complicated. We wanted to create something better:

- 💰 **Affordable**: Start free with unlimited storage
- 🚀 **Fast**: CDN-powered delivery from 150+ locations
- 🔒 **Secure**: Military-grade encryption by default
- 🎨 **Beautiful**: Modern UI that's a joy to use
- 🔌 **Extensible**: Build custom tools with our API

## Key Features

### 1. Unlimited Storage
No more worrying about storage limits. Upload as much as you need.

### 2. Lightning Fast
Our global CDN ensures your files load instantly, anywhere in the world.

### 3. Developer-Friendly
Comprehensive REST API, SDKs for popular languages, and webhook support.

### 4. Extension System
Extend SquidCloud with custom applications using our SquidLab SDK.

### 5. Advanced Security
End-to-end encryption, 2FA, and granular permission controls.

## What's Next?

We're just getting started! Here's what's coming soon:

- 📱 Native mobile apps (iOS & Android)
- 🖥️ Desktop applications (Windows, Mac, Linux)
- 🤝 Team collaboration features
- 📊 Advanced analytics
- 🔗 More integrations

## Join Us

Try SquidCloud today at [SquidCloud.com](https://SquidCloud.com)

**Special Launch Offer:**
- First 1,000 users get Pro plan free for 1 year
- Lifetime 50% discount for early adopters

## Thank You

A huge thank you to our beta testers who helped shape SquidCloud into what it is today.

---

*Have questions? Join our [Discord community](https://discord.gg/SquidCloud)*
`
    },
    {
      id: 'frontend-architecture',
      title: 'Frontend Architecture',
      description: 'Deep dive into the React frontend architecture',
      icon: Code,
      category: 'architecture',
      tags: ['frontend', 'react', 'architecture'],
      content: `# Frontend Architecture

## Technology Stack

### Core Libraries
- **React 18.3**: UI library with concurrent features
- **TypeScript 5.0**: Type-safe development
- **Vite 5.0**: Next-gen build tool
- **React Router 6**: Client-side routing

### UI Framework
- **TailwindCSS 3.4**: Utility-first CSS
- **Shadcn/UI**: Beautiful component library
- **Lucide Icons**: 1000+ open-source icons
- **Framer Motion**: Animation library

### State Management
- **React Query**: Server state management
- **Zustand**: Client state management
- **Context API**: Theme & auth state

### Data Fetching
- **Supabase Client**: Real-time database queries
- **Axios**: HTTP client
- **SWR**: Stale-while-revalidate strategy

## Project Structure

\`\`\`
src/
├── components/          # Reusable components
│   ├── ui/             # Shadcn components
│   ├── FileCard.tsx    # File display card
│   ├── MainHeader.tsx  # App header
│   └── ...
├── pages/              # Route pages
│   ├── Dashboard.tsx
│   ├── ExtensionLab.tsx
│   └── ...
├── contexts/           # React contexts
│   ├── AuthContext.tsx
│   └── ThemeContext.tsx
├── hooks/              # Custom hooks
│   ├── use-mobile.tsx
│   ├── use-toast.tsx
│   └── ...
├── lib/                # Utilities
│   ├── supabase.ts    # Supabase client
│   ├── utils.ts       # Helper functions
│   └── ...
├── services/           # API services
│   ├── fileService.ts
│   ├── authService.ts
│   └── ...
├── types/              # TypeScript types
│   └── database.types.ts
└── utils/              # Utilities
    ├── fileUtils.ts
    └── ...
\`\`\`

## Component Architecture

### Component Hierarchy

\`\`\`
App
├── BrowserRouter
├── QueryClientProvider
├── ThemeProvider
│   └── AuthProvider
│       ├── MainHeader
│       └── Routes
│           ├── Dashboard
│           ├── ExtensionLab
│           └── ...
\`\`\`

### Component Patterns

#### Presentational Components
\`\`\`typescript
// Pure UI component
interface FileCardProps {
  file: File;
  onSelect: (file: File) => void;
}

export const FileCard: React.FC<FileCardProps> = ({ file, onSelect }) => {
  return (
    <Card onClick={() => onSelect(file)}>
      <CardHeader>
        <CardTitle>{file.name}</CardTitle>
      </CardHeader>
    </Card>
  );
};
\`\`\`

#### Container Components
\`\`\`typescript
// Logic + data fetching
export const FileManager: React.FC = () => {
  const { data: files, isLoading } = useQuery(['files'], fetchFiles);
  const [selected, setSelected] = useState<File | null>(null);
  
  if (isLoading) return <Skeleton />;
  
  return (
    <div>
      {files?.map(file => (
        <FileCard
          key={file.id}
          file={file}
          onSelect={setSelected}
        />
      ))}
    </div>
  );
};
\`\`\`

## State Management

### Server State (React Query)

\`\`\`typescript
// Query files
const { data, isLoading, error } = useQuery({
  queryKey: ['files', folderId],
  queryFn: () => fetchFiles(folderId),
  staleTime: 5 * 60 * 1000, // 5 minutes
});

// Mutate (upload)
const uploadMutation = useMutation({
  mutationFn: uploadFile,
  onSuccess: () => {
    queryClient.invalidateQueries(['files']);
    toast.success('File uploaded');
  },
});
\`\`\`

### Client State (Zustand)

\`\`\`typescript
interface AppStore {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ 
    sidebarOpen: !state.sidebarOpen 
  })),
}));
\`\`\`

### Context State

\`\`\`typescript
interface AuthContextType {
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>(null!);

export const AuthProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  
  // ... auth logic
  
  return (
    <AuthContext.Provider value={{ user, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
\`\`\`

## Routing Strategy

\`\`\`typescript
<Routes>
  {/* Public routes */}
  <Route path="/" element={<Index />} />
  <Route path="/auth" element={<Auth />} />
  
  {/* Protected routes */}
  <Route path="/dashboard" element={
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  } />
  
  {/* Dynamic routes */}
  <Route path="/file/:id" element={<SharePage />} />
  <Route path="/help/docs/:slug" element={<Documentation />} />
</Routes>
\`\`\`

## Performance Optimizations

### Code Splitting
\`\`\`typescript
// Lazy load heavy components
const ExtensionLab = lazy(() => import('./pages/ExtensionLab'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

<Suspense fallback={<Skeleton />}>
  <ExtensionLab />
</Suspense>
\`\`\`

### Memoization
\`\`\`typescript
// Expensive calculations
const sortedFiles = useMemo(() => {
  return files.sort((a, b) => b.created_at - a.created_at);
}, [files]);

// Prevent re-renders
const FileCard = memo(({ file }: FileCardProps) => {
  return <Card>{file.name}</Card>;
});
\`\`\`

### Virtual Lists
\`\`\`typescript
// For large file lists
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={files.length}
  itemSize={80}
>
  {({ index, style }) => (
    <div style={style}>
      <FileCard file={files[index]} />
    </div>
  )}
</FixedSizeList>
\`\`\`

## Testing Strategy

### Unit Tests (Vitest)
\`\`\`typescript
describe('FileCard', () => {
  it('renders file name', () => {
    const file = { id: '1', name: 'test.pdf' };
    render(<FileCard file={file} onSelect={vi.fn()} />);
    expect(screen.getByText('test.pdf')).toBeInTheDocument();
  });
});
\`\`\`

### Integration Tests
\`\`\`typescript
describe('File Upload Flow', () => {
  it('uploads file successfully', async () => {
    const user = userEvent.setup();
    render(<FileManager />);
    
    const file = new File(['content'], 'test.pdf');
    const input = screen.getByLabelText('Upload');
    
    await user.upload(input, file);
    
    expect(await screen.findByText('test.pdf')).toBeInTheDocument();
  });
});
\`\`\`

## Build & Deployment

### Build Process
\`\`\`bash
# Development
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
\`\`\`

### Environment Variables
\`\`\`env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_API_BASE_URL=https://api.SquidCloud.com
\`\`\`

### Deployment (Vercel)
- Automatic deployments on push to main
- Preview deployments for PRs
- Edge functions for API routes
- CDN caching for static assets

---

**Related Documentation:**
- [Backend Architecture](#architecture)
- [API Reference](#api-reference)
`
    },
    {
      id: 'res54-encryption',
      title: 'RES54 Encryption System',
      description: 'Advanced multi-layer encryption architecture',
      icon: Lock,
      category: 'architecture',
      tags: ['security', 'encryption', 'res54', 'advanced'],
      content: `# RES54 Encryption System

## Overview

RES54 (Redundant Encryption Stack 54) is SquidCloud's proprietary multi-layer encryption system that provides military-grade security for all stored data. Unlike traditional single-algorithm encryption, RES54 employs multiple encryption layers with different algorithms to ensure maximum security.

## Architecture Overview

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                    Client Upload Flow                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Client-Side Pre-Encryption (Optional)              │
│  Algorithm: RSA-4096 (Key Exchange) + AES-256-GCM (Data)   │
│  Key: User-controlled private key                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Transport Layer Security                           │
│  Protocol: TLS 1.3 with Perfect Forward Secrecy            │
│  Cipher: TLS_AES_256_GCM_SHA384                            │
│  Key Exchange: X25519                                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Application-Level Encryption                       │
│  Algorithm: ChaCha20-Poly1305                               │
│  Key: Session-specific, rotated every 24 hours             │
│  Nonce: 96-bit random, never reused                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Storage Encryption                                 │
│  Algorithm: AES-256-CBC + HMAC-SHA512                       │
│  Key: HSM-generated, per-file unique key                   │
│  IV: 128-bit random                                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: Disk-Level Encryption                              │
│  System: dm-crypt with LUKS2                                │
│  Algorithm: XTS-AES-256                                     │
│  Key: Hardware Security Module (HSM) managed               │
└─────────────────────────────────────────────────────────────┘
\`\`\`

## Encryption Layers Explained

### Layer 1: Client-Side Pre-Encryption (Zero-Knowledge Mode)

When users enable zero-knowledge mode, files are encrypted on the client before upload:

**Algorithm Stack:**
\`\`\`
RSA-4096 (Asymmetric) → Key Exchange
    ↓
AES-256-GCM (Symmetric) → Actual File Encryption
    ↓
PBKDF2-SHA512 (100,000 iterations) → Key Derivation
\`\`\`

**Process:**
\`\`\`javascript
// Client-side encryption
const userKey = await deriveKey(password, salt, 100000);
const fileKey = generateRandomKey(256);
const encryptedFileKey = await rsaEncrypt(fileKey, userPublicKey);
const encryptedFile = await aesGcmEncrypt(file, fileKey);

// Upload both
upload({
  file: encryptedFile,
  keyPackage: encryptedFileKey,
  metadata: encryptedMetadata
});
\`\`\`

**Key Features:**
- Server never sees plaintext
- User controls private key
- Lost key = lost data (by design)
- Perfect for sensitive documents

### Layer 2: Transport Layer Security (TLS 1.3)

All data in transit is protected by TLS 1.3:

**Configuration:**
\`\`\`nginx
ssl_protocols TLSv1.3;
ssl_ciphers TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256;
ssl_prefer_server_ciphers off;
ssl_ecdh_curve X25519:secp384r1;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:50m;
ssl_stapling on;
ssl_stapling_verify on;
\`\`\`

**Benefits:**
- 0-RTT resumption for speed
- Perfect Forward Secrecy (PFS)
- No known vulnerabilities
- Quantum-resistant cipher suites

### Layer 3: Application-Level Encryption (ChaCha20-Poly1305)

Session-based encryption for all API communications:

**Implementation:**
\`\`\`typescript
class SessionEncryption {
  private key: Uint8Array;
  private nonce: Uint8Array;
  
  constructor() {
    this.key = crypto.getRandomValues(new Uint8Array(32));
    this.rotateKey();
  }
  
  async encrypt(data: ArrayBuffer): Promise<EncryptedPackage> {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new ChaCha20Poly1305(this.key);
    
    const encrypted = await cipher.encrypt(data, nonce);
    const tag = await cipher.getAuthTag();
    
    return {
      data: encrypted,
      nonce: nonce,
      tag: tag,
      timestamp: Date.now()
    };
  }
  
  rotateKey() {
    // Rotate key every 24 hours
    setInterval(() => {
      this.key = crypto.getRandomValues(new Uint8Array(32));
    }, 24 * 60 * 60 * 1000);
  }
}
\`\`\`

**Characteristics:**
- Faster than AES on non-hardware-accelerated systems
- Constant-time implementation (no timing attacks)
- Authenticated encryption (AEAD)
- 256-bit keys, 96-bit nonces

### Layer 4: Storage Encryption (AES-256 + HMAC)

Each file gets its own unique encryption key:

**Key Generation:**
\`\`\`python
import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import hashes, hmac
from cryptography.hazmat.backends import default_backend

def encrypt_file(file_data: bytes, file_id: str) -> dict:
    # Generate unique key from HSM
    file_key = hsm.generate_key(
        algorithm='AES',
        key_size=256,
        purpose='FILE_ENCRYPTION',
        metadata={'file_id': file_id}
    )
    
    # Generate random IV
    iv = os.urandom(16)
    
    # Encrypt with AES-256-CBC
    cipher = Cipher(
        algorithms.AES(file_key),
        modes.CBC(iv),
        backend=default_backend()
    )
    encryptor = cipher.encryptor()
    encrypted_data = encryptor.update(file_data) + encryptor.finalize()
    
    # Generate HMAC for integrity
    h = hmac.HMAC(file_key, hashes.SHA512(), backend=default_backend())
    h.update(encrypted_data)
    mac = h.finalize()
    
    return {
        'encrypted_data': encrypted_data,
        'iv': iv,
        'mac': mac,
        'key_id': hsm.get_key_id(file_key)
    }
\`\`\`

**Key Management:**
- Keys stored in Hardware Security Module (HSM)
- FIPS 140-2 Level 3 certified HSM
- Keys never leave HSM
- Automatic key rotation every 90 days

### Layer 5: Disk-Level Encryption (dm-crypt + LUKS2)

The final layer encrypts the entire storage volume:

**Setup:**
\`\`\`bash
# Create LUKS2 encrypted volume
cryptsetup luksFormat --type luks2 \\
  --cipher aes-xts-plain64 \\
  --key-size 512 \\
  --hash sha512 \\
  --iter-time 5000 \\
  --use-random \\
  /dev/sdb1

# Open encrypted volume
cryptsetup luksOpen /dev/sdb1 encrypted_storage

# Format and mount
mkfs.ext4 /dev/mapper/encrypted_storage
mount /dev/mapper/encrypted_storage /mnt/storage
\`\`\`

**Features:**
- XTS-AES-256 (512-bit total key)
- LUKS2 with Argon2id key derivation
- Anti-forensics techniques
- Secure key erasure on demand

## Key Management Architecture

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                Hardware Security Module (HSM)                │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │  Master Key    │  │  File Keys     │  │  Session     │ │
│  │  Generation    │  │  Database      │  │  Keys        │ │
│  └────────────────┘  └────────────────┘  └──────────────┘ │
│                                                              │
│  Features:                                                   │
│  - FIPS 140-2 Level 3 Certified                            │
│  - Tamper-resistant hardware                                │
│  - Automatic key destruction on physical attack            │
│  - Cryptographic boundary enforcement                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Key Derivation Flow                       │
│                                                              │
│  Master Key (HSM) →  Domain Keys  →  File Keys             │
│                           ↓                                  │
│                    Key Rotation                              │
│                    (90 days)                                 │
└─────────────────────────────────────────────────────────────┘
\`\`\`

## Encryption Performance

### Benchmarks

| Operation | File Size | Time | Throughput |
|-----------|-----------|------|------------|
| Upload (encrypted) | 1 MB | 45ms | 22.2 MB/s |
| Upload (encrypted) | 10 MB | 380ms | 26.3 MB/s |
| Upload (encrypted) | 100 MB | 3.2s | 31.2 MB/s |
| Download (decrypted) | 1 MB | 38ms | 26.3 MB/s |
| Download (decrypted) | 10 MB | 320ms | 31.2 MB/s |
| Download (decrypted) | 100 MB | 2.8s | 35.7 MB/s |

### Optimization Techniques

**1. Hardware Acceleration**
\`\`\`
CPU: AES-NI instructions (Intel/AMD)
GPU: CUDA acceleration for bulk operations
ASIC: Custom encryption chips for high-throughput
\`\`\`

**2. Parallel Processing**
\`\`\`javascript
// Chunk-based parallel encryption
async function encryptLargeFile(file) {
  const chunks = splitIntoChunks(file, 5 * 1024 * 1024); // 5MB chunks
  
  const encryptedChunks = await Promise.all(
    chunks.map(chunk => encryptChunk(chunk))
  );
  
  return combineChunks(encryptedChunks);
}
\`\`\`

**3. Streaming Encryption**
\`\`\`typescript
// No need to load entire file into memory
const encryptStream = createCipheriv('aes-256-gcm', key, iv);
fileStream
  .pipe(encryptStream)
  .pipe(uploadStream);
\`\`\`

## Security Guarantees

### What RES54 Protects Against

✅ **Brute Force Attacks**: 2^256 keyspace = computationally infeasible  
✅ **Man-in-the-Middle**: TLS 1.3 with PFS  
✅ **Replay Attacks**: Unique nonces + timestamps  
✅ **Timing Attacks**: Constant-time implementations  
✅ **Side-Channel Attacks**: HSM isolation  
✅ **Quantum Attacks**: 256-bit symmetric keys  
✅ **Data Breaches**: Multi-layer encryption  
✅ **Insider Threats**: Separation of duties + HSM  

### Compliance

- **FIPS 140-2 Level 3**: HSM certification
- **NIST**: Approved cryptographic algorithms
- **GDPR**: Right to erasure with secure key deletion
- **HIPAA**: PHI encryption requirements
- **PCI DSS**: Cardholder data protection

## Developer Integration

### Encrypting Files (Client-Side)

\`\`\`typescript
import { RES54Client } from '@squidcloud/encryption';

const encryptor = new RES54Client({
  mode: 'zero-knowledge', // or 'managed'
  userPassword: 'user-password' // for zero-knowledge mode
});

// Encrypt file before upload
const encryptedFile = await encryptor.encryptFile(file, {
  metadata: {
    filename: file.name,
    size: file.size,
    mimetype: file.type
  }
});

// Upload encrypted package
await api.upload(encryptedFile);
\`\`\`

### Decrypting Files (Client-Side)

\`\`\`typescript
// Download encrypted package
const encryptedPackage = await api.download(fileId);

// Decrypt
const decryptedFile = await encryptor.decryptFile(encryptedPackage);

// Use file
const blob = new Blob([decryptedFile.data], { type: decryptedFile.mimetype });
\`\`\`

## Monitoring & Auditing

All encryption operations are logged:

\`\`\`sql
CREATE TABLE encryption_audit (
  id UUID PRIMARY KEY,
  operation TEXT, -- 'encrypt', 'decrypt', 'key_rotation'
  file_id UUID,
  user_id UUID,
  layer TEXT, -- 'layer_1', 'layer_2', etc.
  algorithm TEXT,
  key_id TEXT,
  success BOOLEAN,
  error_message TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
\`\`\`

## Emergency Key Recovery

For managed encryption mode:

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│              Shamir's Secret Sharing (3-of-5)                │
│                                                              │
│  Master Recovery Key split into 5 shares                     │
│  Any 3 shares can reconstruct the key                        │
│                                                              │
│  Share Holders:                                              │
│  1. CEO (offline vault)                                      │
│  2. CTO (offline vault)                                      │
│  3. Security Lead (offline vault)                            │
│  4. Bank Safe Deposit Box                                    │
│  5. Third-party Escrow Service                               │
└─────────────────────────────────────────────────────────────┘
\`\`\`

---

**Related Documentation:**
- [Security Architecture](#security)
- [API Reference](#api-reference)
- [Developer API](#developer-api)
`
    },
    {
      id: 'squidlab-sdk-complete',
      title: 'SquidLab SDK - Complete Guide',
      description: 'Comprehensive SquidLab SDK documentation for extension developers',
      icon: Package,
      category: 'api',
      tags: ['squidlab', 'sdk', 'extensions', 'development', 'api'],
      content: `# SquidLab SDK - Complete Developer Guide

## Table of Contents

1. [Overview](#overview)
2. [Installation & Setup](#installation--setup)
3. [Core Concepts](#core-concepts)
4. [API Reference](#api-reference)
5. [Extension Components](#extension-components)
6. [Security Model](#security-model)
7. [Advanced Features](#advanced-features)
8. [Examples & Patterns](#examples--patterns)
9. [CLI API Commands](#cli-api-commands)
10. [Publishing & Distribution](#publishing--distribution)

---

## Overview

SquidLab SDK is a comprehensive development kit for building extensions that run within SquidCloud. Extensions are sandboxed mini-applications with controlled access to user data through a secure, token-based API.

### What Can You Build?

- 📊 **Analytics Dashboards**: Custom visualizations for file analytics
- 🎨 **File Processors**: Image editors, PDF tools, video converters
- 🔗 **Integrations**: Connect to third-party services
- 🤖 **Automation Tools**: Batch operations, scheduled tasks
- 📱 **Custom Views**: Alternative file browsers, galleries
- 🔍 **Search Tools**: Advanced search and filtering

### Architecture Overview

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                     SquidCloud Host                          │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Extension Sandbox (iframe)             │    │
│  │                                                      │    │
│  │  ┌──────────────────────────────────────────────┐ │    │
│  │  │        Your Extension Code                    │ │    │
│  │  │                                               │ │    │
│  │  │  window.__SQUIDLAB_SDK__                     │ │    │
│  │  │    ├── sqfetch()                             │ │    │
│  │  │    ├── squpload()                            │ │    │
│  │  │    ├── sqdownload()                          │ │    │
│  │  │    ├── sqdelete()                            │ │    │
│  │  │    ├── showNotification()                    │ │    │
│  │  │    ├── saveSettings()                        │ │    │
│  │  │    └── loadSettings()                        │ │    │
│  │  └──────────────────────────────────────────────┘ │    │
│  │                      ↕ postMessage                 │    │
│  └────────────────────────────────────────────────────┘    │
│                       ↕ Token Validation                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │          Extension Security Manager                 │    │
│  │  - Token Generation & Validation                   │    │
│  │  - Permission Checking                             │    │
│  │  - Approval Status Verification                    │    │
│  └────────────────────────────────────────────────────┘    │
│                       ↕ Authenticated API                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │              SquidCloud API Layer                   │    │
│  │  - File Operations                                  │    │
│  │  - Storage Management                               │    │
│  │  - User Data Access                                 │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
\`\`\`

---

## Installation & Setup

### Prerequisites

- Node.js 18+ or Bun runtime
- npm, yarn, or pnpm
- Text editor (VS Code recommended)
- SquidCloud account

### Install SquidLab CLI

\`\`\`bash
# Using npm
npm install -g squidlab-sdk

# Using yarn
yarn global add squidlab-sdk

# Using pnpm
pnpm add -g squidlab-sdk

# Using bun
bun add -g squidlab-sdk
\`\`\`

### Verify Installation

\`\`\`bash
squidlab --version
# Output: squidlab-sdk v1.0.3
\`\`\`

### Create Your First Extension

\`\`\`bash
# Create new extension project
squidlab create my-awesome-extension

# Navigate to directory
cd my-awesome-extension

# Install dependencies
npm install

# Start development server
npm run dev
\`\`\`

### Project Structure

\`\`\`
my-awesome-extension/
├── manifest.json          # Extension metadata & permissions
├── index.html            # Main entry point
├── index.js              # Application logic
├── styles.css            # Styling
├── components/           # Reusable components
│   ├── Button.js
│   ├── FileCard.js
│   └── Modal.js
├── utils/                # Utility functions
│   ├── formatting.js
│   └── api.js
├── icons/                # Extension icons
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── package.json          # NPM configuration
└── README.md            # Extension documentation
\`\`\`

---

## Core Concepts

### 1. Manifest File

The \`manifest.json\` defines your extension's metadata, permissions, and configuration.

\`\`\`json
{
  "name": "File Analytics Dashboard",
  "version": "1.0.0",
  "description": "Visualize your file storage with interactive charts",
  "author": {
    "name": "John Doe",
    "email": "john@example.com",
    "url": "https://johndoe.dev"
  },
  "category": "analytics",
  "entry": "index.html",
  "permissions": [
    "files.read",
    "user.profile",
    "notifications"
  ],
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "repository": "https://github.com/johndoe/file-analytics",
  "homepage": "https://fileanalytics.dev",
  "license": "MIT",
  "keywords": ["analytics", "dashboard", "visualization"]
}
\`\`\`

### 2. Permission System

Request only the permissions you need:

| Permission | Description | Use Case |
|-----------|-------------|----------|
| \`files.read\` | Read user files & metadata | File browsers, viewers |
| \`files.write\` | Create & update files | Editors, converters |
| \`files.delete\` | Delete files | File managers |
| \`user.profile\` | Access user info | Personalization |
| \`storage.quota\` | View storage usage | Analytics tools |
| \`api.access\` | Make API calls | Integrations |
| \`notifications\` | Send notifications | Status updates |

### 3. Security Token

Every extension session gets a unique security token:

\`\`\`javascript
// Token format
squid_{userId}_{extensionId}_{timestamp}_{randomString}

// Example
squid_a1b2c3d4_e5f6g7h8_1696579200000_x9y8z7w6
\`\`\`

This token must be included in all SDK calls. The parent window validates it on every message.

---

## API Reference

### Global SDK Object

When your extension loads, the SDK is automatically injected as a global variable:

\`\`\`javascript
window.__SQUIDLAB_SDK__
\`\`\`

**Never modify this object directly!** It's read-only and managed by the parent window.

### File Operations

#### sqfetch(path, options)

Fetch data from SquidCloud API.

\`\`\`javascript
/**
 * Fetch data from API
 * @param {string} path - API endpoint path
 * @param {object} options - Fetch options (method, headers, body)
 * @returns {Promise<any>} Response data
 */

// List all files
const files = await window.__SQUIDLAB_SDK__.sqfetch('/api/files', {
  method: 'GET'
});

// Get specific file
const file = await window.__SQUIDLAB_SDK__.sqfetch('/api/files/uuid-here', {
  method: 'GET'
});

// Search files
const results = await window.__SQUIDLAB_SDK__.sqfetch('/api/files?search=report', {
  method: 'GET'
});

// Get files in folder
const folderFiles = await window.__SQUIDLAB_SDK__.sqfetch(
  '/api/files?folder_id=folder-uuid',
  { method: 'GET' }
);
\`\`\`

**Response Format:**
\`\`\`json
{
  "data": [
    {
      "id": "uuid",
      "name": "document.pdf",
      "size": 1024000,
      "mime_type": "application/pdf",
      "storage_path": "files/user_id/uuid.pdf",
      "is_public": false,
      "folder_id": null,
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-01T00:00:00Z"
    }
  ],
  "count": 42
}
\`\`\`

#### squpload(path, file, options)

Upload a file to SquidCloud.

\`\`\`javascript
/**
 * Upload file
 * @param {string} path - Upload endpoint
 * @param {File} file - File object to upload
 * @param {object} options - Upload options
 * @returns {Promise<object>} Upload result
 */

// Upload from file input
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];

const result = await window.__SQUIDLAB_SDK__.squpload(
  '/api/files/upload',
  file,
  {
    folder_id: 'optional-folder-uuid',
    is_public: false
  }
);

console.log('Uploaded:', result);
// {
//   id: "new-file-uuid",
//   name: "document.pdf",
//   size: 1024000,
//   url: "https://squidcloud.inflate.live/files/..."
// }
\`\`\`

**Progress Tracking:**
\`\`\`javascript
const result = await window.__SQUIDLAB_SDK__.squpload(
  '/api/files/upload',
  file,
  {
    onProgress: (progress) => {
      console.log(\`Upload progress: \${progress}%\`);
      updateProgressBar(progress);
    }
  }
);
\`\`\`

#### sqdownload(fileId)

Download a file from SquidCloud.

\`\`\`javascript
/**
 * Download file
 * @param {string} fileId - File UUID
 * @returns {Promise<Blob>} File blob
 */

// Download file
const blob = await window.__SQUIDLAB_SDK__.sqdownload('file-uuid-here');

// Create download link
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'filename.ext';
a.click();
URL.revokeObjectURL(url);

// Or display in iframe
const iframe = document.querySelector('iframe');
iframe.src = URL.createObjectURL(blob);

// Or read as text
const text = await blob.text();
console.log(text);

// Or read as array buffer
const buffer = await blob.arrayBuffer();
const uint8Array = new Uint8Array(buffer);
\`\`\`

#### sqdelete(fileId)

Delete a file from SquidCloud.

\`\`\`javascript
/**
 * Delete file
 * @param {string} fileId - File UUID
 * @returns {Promise<void>}
 */

// Delete file
await window.__SQUIDLAB_SDK__.sqdelete('file-uuid-here');

// With confirmation
if (confirm('Are you sure you want to delete this file?')) {
  await window.__SQUIDLAB_SDK__.sqdelete(fileId);
  console.log('File deleted successfully');
}
\`\`\`

### Notification System

#### showNotification(title, message, type)

Display notifications to the user.

\`\`\`javascript
/**
 * Show notification
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} type - 'success' | 'error' | 'info' | 'warning'
 */

// Success notification
window.__SQUIDLAB_SDK__.showNotification(
  'Success!',
  'File uploaded successfully',
  'success'
);

// Error notification
window.__SQUIDLAB_SDK__.showNotification(
  'Error',
  'Failed to upload file',
  'error'
);

// Info notification
window.__SQUIDLAB_SDK__.showNotification(
  'Processing',
  'Your file is being processed...',
  'info'
);

// Warning notification
window.__SQUIDLAB_SDK__.showNotification(
  'Warning',
  'Storage is almost full',
  'warning'
);
\`\`\`

### Settings Persistence

#### saveSettings(settings)

Save extension settings.

\`\`\`javascript
/**
 * Save settings
 * @param {object} settings - Settings object
 * @returns {Promise<void>}
 */

// Save user preferences
await window.__SQUIDLAB_SDK__.saveSettings({
  theme: 'dark',
  autoRefresh: true,
  refreshInterval: 30,
  defaultView: 'grid',
  sortBy: 'date',
  sortOrder: 'desc',
  customColors: {
    primary: '#3b82f6',
    secondary: '#8b5cf6'
  }
});
\`\`\`

#### loadSettings()

Load extension settings.

\`\`\`javascript
/**
 * Load settings
 * @returns {Promise<object>} Settings object
 */

// Load saved settings
const settings = await window.__SQUIDLAB_SDK__.loadSettings();

console.log(settings.theme); // 'dark'
console.log(settings.autoRefresh); // true

// Apply settings
if (settings.theme === 'dark') {
  document.body.classList.add('dark');
}

// With defaults
const settings = await window.__SQUIDLAB_SDK__.loadSettings();
const theme = settings.theme || 'light'; // Default to 'light'
const refreshInterval = settings.refreshInterval || 60; // Default to 60s
\`\`\`

---

## Extension Components

### Building UI Components

SquidLab SDK works with any UI framework or vanilla JavaScript.

#### Vanilla JavaScript

\`\`\`javascript
// components/FileCard.js
class FileCard {
  constructor(file) {
    this.file = file;
    this.element = this.render();
  }
  
  render() {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.innerHTML = \`
      <div class="file-icon">\${this.getIcon()}</div>
      <h3 class="file-name">\${this.file.name}</h3>
      <p class="file-size">\${this.formatSize(this.file.size)}</p>
      <button class="download-btn">Download</button>
    \`;
    
    card.querySelector('.download-btn').addEventListener('click', () => {
      this.downloadFile();
    });
    
    return card;
  }
  
  async downloadFile() {
    const blob = await window.__SQUIDLAB_SDK__.sqdownload(this.file.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.file.name;
    a.click();
  }
  
  getIcon() {
    const icons = {
      'application/pdf': '📄',
      'image/': '🖼️',
      'video/': '🎥',
      'audio/': '🎵'
    };
    
    for (const [type, icon] of Object.entries(icons)) {
      if (this.file.mime_type.startsWith(type)) {
        return icon;
      }
    }
    return '📁';
  }
  
  formatSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
  }
}

export default FileCard;
\`\`\`

#### React

\`\`\`jsx
// components/FileCard.jsx
import React from 'react';

function FileCard({ file }) {
  const downloadFile = async () => {
    const blob = await window.__SQUIDLAB_SDK__.sqdownload(file.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
  };
  
  const formatSize = (bytes) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
  };
  
  return (
    <div className="file-card">
      <h3>{file.name}</h3>
      <p>{formatSize(file.size)}</p>
      <button onClick={downloadFile}>Download</button>
    </div>
  );
}

export default FileCard;
\`\`\`

#### Vue

\`\`\`vue
<!-- components/FileCard.vue -->
<template>
  <div class="file-card">
    <h3>{{ file.name }}</h3>
    <p>{{ formatSize(file.size) }}</p>
    <button @click="downloadFile">Download</button>
  </div>
</template>

<script>
export default {
  props: ['file'],
  methods: {
    async downloadFile() {
      const blob = await window.__SQUIDLAB_SDK__.sqdownload(this.file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.file.name;
      a.click();
    },
    formatSize(bytes) {
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      if (bytes === 0) return '0 Bytes';
      const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
      return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
    }
  }
}
</script>
\`\`\`

---

## Security Model

### Token-Based Authentication

Every message between your extension and the parent window must include a security token.

**Token Structure:**
\`\`\`javascript
{
  type: 'sqfetch', // Operation type
  token: 'squid_user123_ext456_1696579200000_abc123', // Security token
  extensionId: 'ext456', // Extension ID
  data: {
    path: '/api/files',
    options: { method: 'GET' }
  }
}
\`\`\`

**Parent Window Validation:**
\`\`\`javascript
function handleExtensionMessage(event) {
  const { type, token, extensionId, data } = event.data;
  
  // Validate token
  if (token !== currentSecurityToken) {
    console.error('Invalid security token');
    return;
  }
  
  // Validate extension ID
  if (extensionId !== currentExtensionId) {
    console.error('Invalid extension ID');
    return;
  }
  
  // Process request
  handleRequest(type, data);
}
\`\`\`

### Permission Enforcement

The SDK checks permissions before executing operations:

\`\`\`javascript
// Extension manifest
{
  "permissions": ["files.read"]
}

// Allowed operations
await sqfetch('/api/files'); // ✅ Allowed

// Blocked operations
await squpload('/api/files/upload', file); // ❌ Blocked - needs files.write
await sqdelete('file-uuid'); // ❌ Blocked - needs files.delete
\`\`\`

### Content Security Policy

All extensions run with strict CSP:

\`\`\`html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline'; 
               style-src 'self' 'unsafe-inline'; 
               img-src 'self' data: https:; 
               connect-src 'self' https://squidcloud.inflate.live;">
\`\`\`

---

## Advanced Features

### File Processing Pipeline

\`\`\`javascript
// Example: Image Compressor Extension
class ImageCompressor {
  async compressImage(file) {
    // Download original
    const blob = await window.__SQUIDLAB_SDK__.sqdownload(file.id);
    
    // Process with canvas
    const compressed = await this.compress(blob);
    
    // Upload compressed version
    const newFile = new File([compressed], \`compressed_\${file.name}\`);
    const result = await window.__SQUIDLAB_SDK__.squpload(
      '/api/files/upload',
      newFile
    );
    
    // Notify user
    window.__SQUIDLAB_SDK__.showNotification(
      'Success!',
      \`Compressed \${file.name} - Saved \${this.getSavings(file.size, compressed.size)}%\`,
      'success'
    );
    
    return result;
  }
  
  async compress(blob) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Resize to max 1920px width
        const maxWidth = 1920;
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob(resolve, 'image/jpeg', 0.8);
      };
      img.src = URL.createObjectURL(blob);
    });
  }
  
  getSavings(original, compressed) {
    return Math.round((1 - compressed / original) * 100);
  }
}
\`\`\`

### Real-Time Updates

\`\`\`javascript
// Poll for changes
class FileWatcher {
  constructor(interval = 5000) {
    this.interval = interval;
    this.lastCheck = Date.now();
    this.files = new Map();
  }
  
  async start() {
    setInterval(async () => {
      await this.checkForChanges();
    }, this.interval);
  }
  
  async checkForChanges() {
    const response = await window.__SQUIDLAB_SDK__.sqfetch(
      \`/api/files?updated_after=\${this.lastCheck}\`
    );
    
    if (response.data.length > 0) {
      this.lastCheck = Date.now();
      this.onFilesChanged(response.data);
    }
  }
  
  onFilesChanged(files) {
    window.__SQUIDLAB_SDK__.showNotification(
      'Files Updated',
      \`\${files.length} file(s) changed\`,
      'info'
    );
    
    // Trigger UI update
    this.emit('filesChanged', files);
  }
}
\`\`\`

### Batch Operations

\`\`\`javascript
// Batch file operations
class BatchProcessor {
  async processFiles(fileIds, operation) {
    const results = {
      success: [],
      failed: []
    };
    
    // Process in parallel (max 5 concurrent)
    const chunks = this.chunk(fileIds, 5);
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (fileId) => {
        try {
          await operation(fileId);
          results.success.push(fileId);
        } catch (error) {
          results.failed.push({ fileId, error: error.message });
        }
      });
      
      await Promise.all(promises);
    }
    
    // Show summary
    window.__SQUIDLAB_SDK__.showNotification(
      'Batch Complete',
      \`\${results.success.length} succeeded, \${results.failed.length} failed\`,
      results.failed.length === 0 ? 'success' : 'warning'
    );
    
    return results;
  }
  
  chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Usage
const processor = new BatchProcessor();
await processor.processFiles(
  ['file1', 'file2', 'file3'],
  async (fileId) => {
    await window.__SQUIDLAB_SDK__.sqdelete(fileId);
  }
);
\`\`\`

---

## Examples & Patterns

### Complete Extension Example

\`\`\`html
<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>File Analytics</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      padding: 20px;
      background: #f5f5f5;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .stat-value {
      font-size: 2em;
      font-weight: bold;
      color: #3b82f6;
    }
    .chart {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
  </style>
</head>
<body>
  <h1>📊 File Analytics Dashboard</h1>
  
  <div class="stats-grid" id="stats"></div>
  <div class="chart" id="chart"></div>
  
  <script src="app.js"></script>
</body>
</html>
\`\`\`

\`\`\`javascript
// app.js
class FileAnalytics {
  constructor() {
    this.files = [];
    this.init();
  }
  
  async init() {
    await this.loadFiles();
    this.renderStats();
    this.renderChart();
  }
  
  async loadFiles() {
    try {
      const response = await window.__SQUIDLAB_SDK__.sqfetch('/api/files');
      this.files = response.data;
      
      window.__SQUIDLAB_SDK__.showNotification(
        'Loaded',
        \`Analyzed \${this.files.length} files\`,
        'success'
      );
    } catch (error) {
      window.__SQUIDLAB_SDK__.showNotification(
        'Error',
        'Failed to load files',
        'error'
      );
    }
  }
  
  renderStats() {
    const stats = this.calculateStats();
    const statsHTML = \`
      <div class="stat-card">
        <div class="stat-label">Total Files</div>
        <div class="stat-value">\${stats.totalFiles}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Size</div>
        <div class="stat-value">\${stats.totalSize}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Average Size</div>
        <div class="stat-value">\${stats.avgSize}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Most Common Type</div>
        <div class="stat-value">\${stats.commonType}</div>
      </div>
    \`;
    document.getElementById('stats').innerHTML = statsHTML;
  }
  
  calculateStats() {
    const totalFiles = this.files.length;
    const totalSize = this.files.reduce((sum, f) => sum + f.size, 0);
    const avgSize = totalFiles > 0 ? totalSize / totalFiles : 0;
    
    // Find most common type
    const types = {};
    this.files.forEach(f => {
      const type = f.mime_type.split('/')[0];
      types[type] = (types[type] || 0) + 1;
    });
    const commonType = Object.keys(types).reduce((a, b) => 
      types[a] > types[b] ? a : b, '');
    
    return {
      totalFiles,
      totalSize: this.formatSize(totalSize),
      avgSize: this.formatSize(avgSize),
      commonType
    };
  }
  
  renderChart() {
    // Simple bar chart with file types
    const types = {};
    this.files.forEach(f => {
      const type = f.mime_type.split('/')[0];
      types[type] = (types[type] || 0) + 1;
    });
    
    let chartHTML = '<h2>Files by Type</h2>';
    Object.entries(types).forEach(([type, count]) => {
      const percentage = (count / this.files.length * 100).toFixed(1);
      chartHTML += \`
        <div style="margin: 10px 0;">
          <div>\${type}: \${count} files (\${percentage}%)</div>
          <div style="background: #e5e7eb; height: 20px; border-radius: 4px; overflow: hidden;">
            <div style="background: #3b82f6; height: 100%; width: \${percentage}%;"></div>
          </div>
        </div>
      \`;
    });
    
    document.getElementById('chart').innerHTML = chartHTML;
  }
  
  formatSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new FileAnalytics());
} else {
  new FileAnalytics();
}
\`\`\`

---

## CLI API Commands

### Direct API Access from Command Line

The SquidLab SDK includes powerful CLI commands to interact with the SquidCloud API directly, without writing code or using curl.

### Authentication

**Login with your API key:**

\`\`\`bash
# Interactive login
squidlab-sdk login

# Or provide key directly
squidlab-sdk login --api-key cb_your_api_key_here
\`\`\`

**Get your API key:**
1. Visit https://squidcloud.inflate.live/developer-api
2. Click "Generate New API Key"
3. Copy the key (starts with \`cb_\`)

**Check current user:**

\`\`\`bash
squidlab-sdk whoami
\`\`\`

Output:
\`\`\`
👤 Current User:
   Email: user@example.com
   ID: 123e4567-e89b-12d3-a456-426614174000
   Created: 1/15/2025
\`\`\`

### File Management

**List your files:**

\`\`\`bash
# List all files
squidlab-sdk api:files:list

# Limit results
squidlab-sdk api:files:list --limit 20

# Filter by folder
squidlab-sdk api:files:list --folder folder-uuid

# JSON output for scripting
squidlab-sdk api:files:list --json
\`\`\`

**Upload files:**

\`\`\`bash
# Upload a file
squidlab-sdk api:files:upload /path/to/file.pdf

# With custom name
squidlab-sdk api:files:upload file.pdf --name "My Document.pdf"

# Upload to specific folder
squidlab-sdk api:files:upload file.pdf --folder folder-uuid

# Make public
squidlab-sdk api:files:upload file.pdf --public
\`\`\`

**Download files:**

\`\`\`bash
# Download by ID
squidlab-sdk api:files:download file-uuid-here

# Specify output path
squidlab-sdk api:files:download file-uuid --output /path/to/save.pdf
\`\`\`

**Get file info:**

\`\`\`bash
squidlab-sdk api:files:info file-uuid-here
squidlab-sdk api:files:info file-uuid --json
\`\`\`

**Delete files:**

\`\`\`bash
# Delete with confirmation
squidlab-sdk api:files:delete file-uuid-here

# Skip confirmation
squidlab-sdk api:files:delete file-uuid --yes
\`\`\`

### API Key Management

**List API keys:**

\`\`\`bash
squidlab-sdk api:keys:list
squidlab-sdk api:keys:list --json
\`\`\`

**Create new API key:**

\`\`\`bash
squidlab-sdk api:keys:create
squidlab-sdk api:keys:create --name "Production Key"
\`\`\`

**Revoke API key:**

\`\`\`bash
squidlab-sdk api:keys:revoke key-uuid-here
squidlab-sdk api:keys:revoke key-uuid --yes
\`\`\`

### Storage Information

**Check storage usage:**

\`\`\`bash
squidlab-sdk api:storage:info
squidlab-sdk api:storage:info --json
\`\`\`

Output:
\`\`\`
💾 Storage Information:

   Used: 2.3 GB
   Total: 10 GB
   Usage: 23.0%
   Files: 142
   [███████░░░░░░░░░░░░░░░░░░░░░░░] 23.0%
\`\`\`

### Scripting Examples

**Backup all files (Bash):**

\`\`\`bash
#!/bin/bash
files=$(squidlab-sdk api:files:list --json)
echo "$files" | jq -r '.data[].id' | while read id; do
  squidlab-sdk api:files:download "$id"
done
\`\`\`

**Upload directory (PowerShell):**

\`\`\`powershell
Get-ChildItem *.pdf | ForEach-Object {
  squidlab-sdk api:files:upload $_.FullName --folder $folderId
}
\`\`\`

**Monitor storage (Python):**

\`\`\`python
import subprocess
import json
import time

while True:
    result = subprocess.run(
        ['squidlab-sdk', 'api:storage:info', '--json'],
        capture_output=True,
        text=True
    )
    data = json.loads(result.stdout)
    usage = (data['used'] / data['total']) * 100
    
    if usage > 80:
        print(f"Warning: Storage {usage:.1f}% full!")
    
    time.sleep(3600)  # Check every hour
\`\`\`

### Environment Variables

Set API key via environment variable for CI/CD:

\`\`\`bash
export SQUIDCLOUD_API_KEY=cb_your_api_key_here
squidlab-sdk api:files:upload build.zip
\`\`\`

### Configuration Storage

CLI stores config at:
- **Linux/Mac:** \`~/.squidlab/config.json\`
- **Windows:** \`%USERPROFILE%\\.squidlab\\config.json\`

---

## Publishing & Distribution

### Building for Production

\`\`\`bash
# Build extension
squidlab build

# Output: dist/ folder with optimized files
\`\`\`

### Converting to .sqe

\`\`\`bash
# Convert to .sqe package
squidlab convert

# Output: my-extension-1.0.0.sqe
\`\`\`

### Publishing to Extension Lab

1. Go to **Extension Lab** in SquidCloud
2. Click **"My Extensions"** tab
3. Click **"New Extension"** button
4. Upload your \`.sqe\` file
5. Metadata auto-populated from manifest
6. Click **"Publish Extension"**
7. Wait for admin approval (pending → on_review → approved)

### Versioning

Follow semantic versioning (semver):

- **Major** (1.0.0 → 2.0.0): Breaking changes
- **Minor** (1.0.0 → 1.1.0): New features
- **Patch** (1.0.0 → 1.0.1): Bug fixes

\`\`\`bash
# Update version
squidlab version patch  # 1.0.0 → 1.0.1
squidlab version minor  # 1.0.0 → 1.1.0
squidlab version major  # 1.0.0 → 2.0.0
\`\`\`

---

**Related Documentation:**
- [Extension Lab Guide](#extensions)
- [API Reference](#api-reference)
- [Security Architecture](#security)
- [RES54 Encryption](#res54-encryption)
`
    }
  ];

  useEffect(() => {
    if (slug) {
      const doc = docSections.find(d => d.id === slug);
      setCurrentDoc(doc || null);
    } else {
      setCurrentDoc(null);
    }
  }, [slug]);

  const filteredDocs = docSections.filter(doc => {
    const matchesSearch = searchQuery === '' || 
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'guide': return Book;
      case 'api': return Code;
      case 'architecture': return Layers;
      case 'blog': return FileText;
      default: return Book;
    }
  };

  if (currentDoc) {
    return (
      <div className="min-h-screen bg-background">
        {isMobile && <MobileScrollToTop />}
        
        <div className={`container mx-auto px-4 ${isMobile ? 'py-20 pb-32' : 'py-8'} max-w-4xl`}>
          <Button
            variant="ghost"
            onClick={() => navigate('/help/docs')}
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Documentation
          </Button>

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <currentDoc.icon className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">{currentDoc.title}</h1>
                <p className="text-muted-foreground">{currentDoc.description}</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{currentDoc.category}</Badge>
              {currentDoc.tags.map(tag => (
                <Badge key={tag} variant="outline">{tag}</Badge>
              ))}
            </div>
          </div>

          <Card>
            <CardContent className="pt-6 prose prose-slate dark:prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  code({ className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const inline = !props.node?.position;
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={vscDarkPlus as any}
                        language={match[1]}
                        PreTag="div"
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {currentDoc.content}
              </ReactMarkdown>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Documentation Index
  return (
    <div className="min-h-screen bg-background">
      {isMobile && <MobileScrollToTop />}
      
      <div className={`container mx-auto px-4 ${isMobile ? 'py-20 pb-32' : 'py-8'} max-w-7xl`}>
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-3 flex items-center gap-3">
            <Book className="w-10 h-10" />
            SquidCloud Documentation
          </h1>
          <p className="text-xl text-muted-foreground">
            Comprehensive guides, API references, and architecture documentation
          </p>
        </div>

        <div className="mb-8 space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search documentation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="guide">Guides</TabsTrigger>
              <TabsTrigger value="api">API</TabsTrigger>
              <TabsTrigger value="architecture">Architecture</TabsTrigger>
              <TabsTrigger value="blog">Blog</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Patch Notes Card */}
        <Card 
          className="mb-6 cursor-pointer hover:shadow-lg transition-shadow border-primary/50"
          onClick={() => navigate('/help/docs/notes')}
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    What's New
                    <Badge className="bg-primary">v1.0.6</Badge>
                  </CardTitle>
                  <CardDescription>
                    Check out the latest updates, features, and improvements
                  </CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm">
                View Patch Notes
              </Button>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocs.map(doc => {
            const Icon = doc.icon;
            return (
              <Card
                key={doc.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate(`/help/docs/${doc.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between mb-3">
                    <Icon className="w-8 h-8 text-primary" />
                    <Badge variant="secondary">{doc.category}</Badge>
                  </div>
                  <CardTitle className="text-xl">{doc.title}</CardTitle>
                  <CardDescription>{doc.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {doc.tags.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filteredDocs.length === 0 && (
          <Card className="mt-8">
            <CardContent className="pt-12 pb-12 text-center">
              <Search className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Documentation Found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search or filter criteria
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Documentation;
