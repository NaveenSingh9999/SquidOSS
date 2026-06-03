# SquidOSS Frontend

The frontend is a **React 18** single-page application built with **Vite**,
**TypeScript**, and **Tailwind CSS**.

## Dev Server

```bash
npm run dev   # http://localhost:5173
```

## Page Structure

### Public Pages
| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `Index` | Redirects to /setup, /auth, or /dashboard |
| `/auth` | `Auth` | Login page (email/password + passkey) |
| `/setup` | `Setup` | 7-step setup wizard (first boot) |
| `/auth/callback` | `OAuthCallback` | OAuth callback handler |
| `/cc/api/status` | `APIStatus` | API status page |

### Protected Pages (require auth)
| Route | Component | Description |
|-------|-----------|-------------|
| `/dashboard` | `Dashboard` | Main dashboard |
| `/profile` | `Profile` | User profile |
| `/settings` | `Settings` | App settings |
| `/settings/account` | `AccountSettings` | Account settings |
| `/storage` | `StoragePage` | File browser |
| `/analytics` | `AnalyticsDashboard` | Usage analytics |
| `/security` | `SecurityCenter` | Security settings |
| `/developer-api` | `DeveloperAPI` | API key management |
| `/extensions` | `ExtensionLab` | Extensions marketplace |

## Key Components

### Authentication
- **AuthContext** — JWT-based auth, no Supabase dependency
- **usePasskey** — WebAuthn registration/authentication hook (raw Web API)
- **PINAuthContext** — PIN-protected content
- **ProtectedRoute** — redirects unauthenticated users

### File Management
- **FileManager** / **EnhancedFileManager** — file browser with grid/list views
- **FileCard** / **EnhancedFileCard** — individual file display
- **DragDropUpload** — drag-and-drop uploads
- **UploadDialog** — upload progress dialog
- **FilePreview** / **EnhancedFilePreview** — inline file previews
- **EnhancedShareDialog** — file sharing dialog

### UI System
- **MainHeader** — top navigation bar
- **DashboardSidebar** / **MobileBottomNav** — navigation
- **SquidsetThemeToggle** — dark/light theme toggle
- **CommandPalette** — keyboard shortcut command palette
- **QuickJumpModal** — quick file navigation
- **Toaster** — toast notifications (via sonner)

## Hooks (`src/hooks/`)

| Hook | Purpose |
|------|---------|
| `usePasskey` | WebAuthn register/login |
| `usePINAuth` | PIN authentication |
| `useBYOK` | Bring Your Own Key |
| `use-animation-config` | Page transition animations |
| `use-mobile` | Responsive mobile detection |
| `use-toast` | Toast notifications |
| `useKeyboardShortcut` | Keyboard shortcuts |
| `useQuickLook` | Quick file preview (Space key) |
| `useVideoAnalytics` | Video playback analytics |
| `useTransferIntegrity` | Upload integrity checks |

## Context Providers (`src/contexts/`)

| Provider | Purpose |
|----------|---------|
| `AuthProvider` | JWT auth state |
| `PINAuthProvider` | PIN-based access control |
| `BYOKProvider` | Client-side encryption keys |
| `ThemeProvider` | Dark/light theme |
| `SquidsetThemeToggle` | SquidOSS theme toggle |

## Client SDK (`src/lib/`)

The **SquidOSS Client** (`src/lib/squidoss-client.ts`) is a drop-in
replacement for `@supabase/supabase-js`:

```typescript
import { createClient } from '@/lib/squidoss-client'

const client = createClient('http://localhost:3000')

// Auth
await client.auth.signInWithPassword({ email, password })
await client.auth.signUp({ email, password })
await client.auth.signOut()
await client.auth.getUser()
await client.auth.getSession()

// Query
const { data } = await client.from('files').select('*').eq('user_id', userId)

// RPC
await client.rpc('delete_file_secure', { file_uuid })

// Storage
await client.storage.from('bucket').upload('path', file)
await client.storage.from('bucket').download('path')

// Legacy edge functions
await client.functions.invoke('verify-admin', { secret })
```

## Styling

- **Tailwind CSS** with custom theme
- Dark theme defaults:
  - `--background: hsl(222 47% 9.5%)`
  - `--card: hsl(222 35% 11.5%)`
  - `--muted: hsl(220 20% 17%)`
- **Framer Motion** for page transitions
- **Lucide Icons** for UI icons
