import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Calendar,
  GitCommit,
  Package,
  Sparkles,
  Bug,
  Zap,
  Shield,
  FileText,
  Search
} from '@/lib/icon-map';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useIsMobile } from '@/hooks/use-mobile';
import MobileScrollToTop from '@/components/MobileScrollToTop';

interface PatchNote {
  id: string;
  version: string;
  date: string;
  title: string;
  description: string;
  type: 'major' | 'minor' | 'patch' | 'security';
  content: string;
  highlights: string[];
  tags: string[];
}

const PatchNotes: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentNote, setCurrentNote] = useState<PatchNote | null>(null);

  const patchNotes: PatchNote[] = [
    {
      id: 'v1-0-6-cli-auth-fix',
      version: '1.0.6',
      date: '2025-10-07',
      title: 'CLI Authentication System Fix',
      description: 'Fixed critical authentication bugs in SquidLab SDK CLI',
      type: 'patch',
      highlights: [
        'Fixed login accepting fake/invalid API keys',
        'Fixed whoami showing undefined/null values',
        'Fixed api:files:list crashing with forEach error',
        'Added proper API key validation with user confirmation',
        'Fixed config persistence and loading',
        'Added /whoami endpoint to cloudbliss-api'
      ],
      tags: ['bugfix', 'cli', 'authentication', 'critical'],
      content: `# CLI Authentication System Fix v1.0.6

## 🔧 Critical Bug Fixes

**Release Date:** October 7, 2025  
**Version:** 1.0.6  
**Type:** Patch Release (Critical Fixes)

---

## 🐛 Bugs Fixed

### 1. Login Accepted Any API Key ❌

**Problem:** Login command would accept literally any string as valid:
\`\`\`bash
squidlab-sdk login --api-key "fake"
# ✅ Login successful!  (WRONG!)
\`\`\`

**Fix:** ✅
- Added API key format validation (must start with \`cb_\`)
- Makes actual API call to \`/whoami\` endpoint to verify key
- Shows user account information before saving
- Asks "Is this the correct account?" for confirmation

### 2. Whoami Returned Undefined ❌

**Problem:**
\`\`\`bash
squidlab-sdk whoami
# 👤 Current User:
#    Email: undefined
#    ID: undefined
#    Created: Invalid Date
\`\`\`

**Root Cause:**
- Used non-existent endpoint \`/api/v1/user/profile\`
- Wrong authorization headers
- Config not loading properly

**Fix:** ✅
- Created new \`/whoami\` endpoint in cloudbliss-api
- Updated to correct URL: \`/functions/v1/cloudbliss-api/whoami\`
- Fixed headers: \`X-SquidCloud-Key\` instead of \`Bearer\`
- Fixed config loading with error handling

### 3. Files List Crashed ❌

**Problem:**
\`\`\`bash
squidlab-sdk api:files:list
# 📁 Files (undefined total):
# ❌ Error: Cannot read properties of undefined (reading 'forEach')
\`\`\`

**Fix:** ✅
- Fixed API base URL
- Added null/undefined checks
- Shows "No files found" instead of crashing
- Handles different response structures gracefully

### 4. Config Not Persisted ❌

**Problem:** Login succeeded but commands still said "Not logged in"

**Fix:** ✅
- Fixed \`loadConfig()\` to properly read JSON
- Fixed \`saveConfig()\` to create directory recursively
- Saves user info along with API key

---

## ✨ New Features

### Account Confirmation During Login

Login now shows your account details:

\`\`\`bash
squidlab-sdk login

🔐 SquidCloud API Login
? Enter your API key (starts with cb_): [hidden]
🔍 Validating API key...

✅ API Key Valid!

👤 Account Information:
   Email: user@example.com
   Name: John Doe
   User ID: abc123
   Account Created: 10/7/2025

? Is this the correct account? (Y/n)
\`\`\`

### Enhanced Error Messages

Better guidance when login fails:

\`\`\`bash
❌ Login failed!
   Error: Invalid API key

💡 Make sure you:
   1. Have a valid API key from https://squidcloud.inflate.live
   2. The API key starts with cb_
   3. The API key is active and not revoked
\`\`\`

### Better Whoami Output

\`\`\`bash
squidlab-sdk whoami

👤 Current User:
   Email: user@example.com
   Name: John Doe
   ID: abc123
   Created: 10/7/2025
   Storage Used: 0.05 GB

📝 Logged in since: 10/7/2025, 2:30:45 PM
\`\`\`

---

## 🔧 Technical Changes

### Edge Function: New /whoami Endpoint

Added to \`supabase/functions/cloudbliss-api/index.ts\`:

\`\`\`typescript
async function handleUserAPI(req: Request, supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, created_at, storage_used')
    .eq('id', userId)
    .single()

  return new Response(JSON.stringify({ 
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    created_at: profile.created_at,
    storage_used: profile.storage_used,
    success: true 
  }))
}
\`\`\`

### CLI: Fixed API Requests

**Before:**
\`\`\`javascript
const baseURL = 'https://squidcloud.inflate.live/api/v1' // WRONG!
headers: { 'Authorization': \`Bearer \${apiKey}\` } // WRONG!
\`\`\`

**After:**
\`\`\`javascript
const baseURL = 'https://squidcloud.inflate.live/functions/v1/cloudbliss-api' // CORRECT!
headers: { 'X-SquidCloud-Key': apiKey } // CORRECT!
\`\`\`

### CLI: Enhanced Login Flow

1. ✅ Validate format (\`cb_*\`)
2. ✅ Test with real API call
3. ✅ Show account info
4. ✅ Ask for confirmation
5. ✅ Save config with user data
6. ✅ Better error messages

---

## 📊 Impact

| Issue | Severity | Status |
|-------|----------|--------|
| Login accepts fake keys | 🔴 Critical | ✅ Fixed |
| Whoami shows undefined | 🔴 Critical | ✅ Fixed |
| Files list crashes | 🔴 Critical | ✅ Fixed |
| Config not saved | 🟡 High | ✅ Fixed |

---

## 🧪 Testing

All authentication flows now work correctly:

\`\`\`bash
# Test 1: Invalid key (should fail)
squidlab-sdk login --api-key "fake"
# ❌ Login failed! Invalid API key ✓

# Test 2: Valid key (should succeed)
squidlab-sdk login
# ✅ Login successful! ✓

# Test 3: Whoami (should show info)
squidlab-sdk whoami
# 👤 Current User: user@example.com ✓

# Test 4: List files (should work)
squidlab-sdk api:files:list
# 📁 Files (3 total): ✓
\`\`\`

---

## 📚 Documentation

New comprehensive guide: \`squidlab-sdk/CLI_AUTH_FIX.md\`

Covers:
- All bugs fixed
- Technical details
- Testing procedures
- Migration guide
- Breaking changes
- Security notes

---

## ⚠️ Breaking Changes

### For Developers

1. **API endpoint changed:**
   - Old: \`/api/v1/*\`
   - New: \`/functions/v1/cloudbliss-api/*\`

2. **Header name changed:**
   - Old: \`Authorization: Bearer cb_...\`
   - New: \`X-SquidCloud-Key: cb_...\`

3. **Login requires confirmation:**
   - Now shows account info
   - Asks "Is this correct?"
   - Can be automated (TODO: add \`-y\` flag)

### Migration

If you were using old CLI:

\`\`\`bash
# Logout and login again
squidlab-sdk logout
squidlab-sdk login
\`\`\`

---

## 🔒 Security Improvements

✅ **API keys validated** before saving  
✅ **Account confirmation** prevents wrong key usage  
✅ **Better error messages** (no key leakage)  
✅ **Config file protected** (user-only read)  
✅ **Keys hashed on server** (SHA-256)  

---

**All critical authentication bugs have been fixed! 🎉**

The CLI now properly validates API keys, shows user info, and handles all edge cases gracefully.
`
    },
    {
      id: 'v1-1-0-cli-api-commands',
      version: '1.1.0',
      date: '2025-10-07',
      title: 'CLI API Commands',
      description: 'Direct API access from command line without curl',
      type: 'minor',
      highlights: [
        'Direct API access via CLI (no curl needed)',
        'File management commands (list, upload, download, delete)',
        'API key management from terminal',
        'Storage monitoring commands',
        'Scripting support with JSON output',
        'Environment variable support for CI/CD'
      ],
      tags: ['cli', 'api', 'automation', 'developer-tools'],
      content: `# CLI API Commands v1.1.0

## 🚀 New Feature: CLI API Access

**Release Date:** October 7, 2025  
**Version:** 1.1.0  
**Type:** Minor Feature Release

---

## 📋 Overview

Users can now interact with the SquidCloud API directly from the command line without writing code or using curl. This release adds comprehensive CLI commands for file management, API keys, and storage monitoring.

## ✨ New Commands

### Authentication Commands

\`\`\`bash
# Login with API key
squidlab-sdk login
squidlab-sdk login --api-key cb_your_key

# Check current user
squidlab-sdk whoami

# Logout
squidlab-sdk logout
\`\`\`

### File Management Commands

\`\`\`bash
# List files
squidlab-sdk api:files:list
squidlab-sdk api:files:list --limit 20
squidlab-sdk api:files:list --folder folder-uuid
squidlab-sdk api:files:list --json

# Upload files
squidlab-sdk api:files:upload file.pdf
squidlab-sdk api:files:upload file.pdf --name "Custom Name"
squidlab-sdk api:files:upload file.pdf --folder uuid
squidlab-sdk api:files:upload file.pdf --public

# Download files
squidlab-sdk api:files:download file-uuid
squidlab-sdk api:files:download file-uuid --output save.pdf

# File information
squidlab-sdk api:files:info file-uuid
squidlab-sdk api:files:info file-uuid --json

# Delete files
squidlab-sdk api:files:delete file-uuid
squidlab-sdk api:files:delete file-uuid --yes
\`\`\`

### API Key Management

\`\`\`bash
# List API keys
squidlab-sdk api:keys:list
squidlab-sdk api:keys:list --json

# Create new key
squidlab-sdk api:keys:create
squidlab-sdk api:keys:create --name "Production Key"

# Revoke key
squidlab-sdk api:keys:revoke key-uuid
squidlab-sdk api:keys:revoke key-uuid --yes
\`\`\`

### Storage Monitoring

\`\`\`bash
# Check storage usage
squidlab-sdk api:storage:info
squidlab-sdk api:storage:info --json
\`\`\`

## 🎯 Use Cases

### 1. Automated Backups

\`\`\`bash
#!/bin/bash
# Backup all files
files=$(squidlab-sdk api:files:list --json)
echo "$files" | jq -r '.data[].id' | while read id; do
  squidlab-sdk api:files:download "$id"
done
\`\`\`

### 2. CI/CD Integration

\`\`\`bash
# Deploy builds automatically
export SQUIDCLOUD_API_KEY=\${{ secrets.API_KEY }}
squidlab-sdk api:files:upload dist/build.zip --folder deployments
\`\`\`

### 3. Batch Operations

\`\`\`powershell
# Upload entire directory
Get-ChildItem *.pdf | ForEach-Object {
  squidlab-sdk api:files:upload $_.FullName
}
\`\`\`

### 4. Storage Monitoring

\`\`\`python
import subprocess, json

result = subprocess.run(
    ['squidlab-sdk', 'api:storage:info', '--json'],
    capture_output=True, text=True
)
data = json.loads(result.stdout)
usage = (data['used'] / data['total']) * 100

if usage > 80:
    send_alert(f"Storage {usage:.1f}% full!")
\`\`\`

## 📚 Documentation

### New Documentation Files

1. **CLI_API_GUIDE.md** - Complete CLI reference (300+ lines)
   - All commands documented
   - Examples for Bash, PowerShell, Python
   - Error handling guide
   - Best practices

2. **CLI_QUICK_REFERENCE.md** - Quick reference card
   - All commands at a glance
   - Common patterns
   - Configuration info

3. **Updated SquidLab SDK Docs** - Web documentation
   - Added "CLI API Commands" section
   - Integrated into help system
   - Live at: /help/docs/squidlab-sdk-complete

## 🔧 Technical Details

### Configuration Storage

- **Linux/Mac:** ~/.squidlab/config.json
- **Windows:** %USERPROFILE%\\.squidlab\\config.json

### Environment Variables

\`\`\`bash
# Set API key for CI/CD
export SQUIDCLOUD_API_KEY=cb_your_api_key_here
squidlab-sdk api:files:list
\`\`\`

### JSON Output for Scripting

All commands support \`--json\` flag for programmatic access:

\`\`\`bash
squidlab-sdk api:files:list --json | jq '.data[].name'
squidlab-sdk api:storage:info --json | jq '.used'
\`\`\`

## ✨ Key Features

✅ **No curl needed** - Direct API access from CLI  
✅ **Persistent authentication** - Login once, use everywhere  
✅ **JSON output** - Perfect for scripting and automation  
✅ **Environment variables** - CI/CD friendly  
✅ **Interactive prompts** - User-friendly for manual operations  
✅ **Progress indicators** - Visual feedback for uploads  
✅ **Error handling** - Clear error messages  

## 📊 Command Summary

**Total Commands Added:** 15+

### By Category

- **Authentication:** 3 commands (login, logout, whoami)
- **File Operations:** 5 commands (list, upload, download, info, delete)
- **API Keys:** 3 commands (list, create, revoke)
- **Storage:** 1 command (info)
- **Extension Dev:** 4 commands (create, build, convert, publish)

## 🎓 Quick Start

\`\`\`bash
# 1. Install (if not already installed)
npm install -g squidlab-sdk

# 2. Login with API key
squidlab-sdk login --api-key cb_your_key_here

# 3. Try it out
squidlab-sdk api:files:list
squidlab-sdk api:storage:info
squidlab-sdk whoami
\`\`\`

## 🔗 Learn More

- **Full CLI Guide:** /squidlab-sdk/CLI_API_GUIDE.md
- **Quick Reference:** /squidlab-sdk/CLI_QUICK_REFERENCE.md
- **Web Docs:** https://squidcloud.inflate.live/help/docs/squidlab-sdk-complete#cli-api-commands

---

**The SquidLab SDK CLI now provides complete API access without curl! 🎉**
`
    },
    {
      id: 'v1-0-0-documentation-system',
      version: '1.0.0',
      date: '2025-10-06',
      title: 'Complete Documentation System',
      description: 'Comprehensive documentation and help system with advanced features',
      type: 'major',
      highlights: [
        'Full documentation with 9 major sections',
        'RES54 multi-layer encryption system explained',
        'Complete SquidLab SDK component guide',
        'Production-ready URLs and branding',
        'Advanced security documentation'
      ],
      tags: ['documentation', 'security', 'sdk', 'encryption'],
      content: `# Documentation System v1.0.0

## 🎉 Major Release: Complete Documentation System

**Release Date:** October 6, 2025  
**Version:** 1.0.0  
**Type:** Major Feature Release

---

## 📋 Overview

This release introduces a comprehensive documentation and help system for SquidCloud, featuring detailed technical documentation, security guides, API references, and developer resources.

## ✨ New Features

### 1. Documentation Hub

A complete documentation portal with 9 major sections:
- Getting Started Guide
- Architecture Overview  
- API Reference
- Extension Lab Guide
- Security & Compliance
- Blog Launch Announcement
- Frontend Architecture
- **RES54 Encryption System** (NEW)
- **SquidLab SDK Complete Guide** (NEW)

### 2. RES54 Encryption Documentation

Complete technical deep-dive into our multi-layer encryption system with:
- Architecture diagrams and ASCII charts
- Key management system (HSM-backed, FIPS 140-2 Level 3)
- Performance benchmarks
- Security guarantees and compliance info
- Developer integration examples

### 3. SquidLab SDK Complete Guide

Comprehensive SDK documentation for extension developers with:
- Global SDK object documentation
- File Operations API (sqfetch, squpload, sqdownload, sqdelete)
- Notification System
- Settings Persistence
- Security Token System
- Complete examples in Vanilla JS, React, and Vue

### 4. Production Branding Updates

Updated all URLs and email addresses:
- **Domain:** squidcloud.inflate.live
- **Support Email:** support@inflate.live
- **Product Email:** hello@inflate.live

## 🔧 Technical Implementation

### Routes Added

- /help/docs - Documentation index
- /help/docs/:slug - Individual documentation pages
- /help/docs/notes - Patch notes index
- /help/docs/notes/:id - Individual patch notes

### Dependencies Installed

- react-markdown
- react-syntax-highlighter
- @types/react-syntax-highlighter

## 📊 Content Statistics

**Documentation Coverage:**
- 9 major sections
- 50+ code examples
- 10+ architecture diagrams
- 100+ API endpoints documented
- Security compliance for FIPS, NIST, GDPR, HIPAA, PCI DSS

## 📝 Files Created/Modified

### New Files
- src/pages/PatchNotes.tsx
- FULL_DOCUMENTATION.md
- DOCUMENTATION_SUMMARY.md

### Modified Files
- src/pages/Documentation.tsx
- src/App.tsx
- src/components/MainHeader.tsx

---

For detailed documentation, visit: [squidcloud.inflate.live/help/docs](https://squidcloud.inflate.live/help/docs)`
    },
    {
      id: 'v0-9-0-extension-lab',
      version: '0.9.0',
      date: '2025-10-05',
      title: 'Extension Lab Security System',
      description: 'Complete security and approval workflow for extensions',
      type: 'security',
      highlights: [
        'Three-tier approval system (pending → on_review → approved)',
        'Admin security dashboard',
        'Extension sandboxing with token validation',
        'Permission-based access control'
      ],
      tags: ['security', 'extensions', 'admin', 'approval'],
      content: `# Extension Lab Security v0.9.0

## 🔒 Security Release

This release focused on implementing a comprehensive security and approval system for the Extension Lab.

### Security Features

**Approval Workflow:**
- Pending → On Review → Approved status flow
- Admin-only approval capabilities
- Security validation checks
- Malicious code detection

**Extension Sandboxing:**
- iframe-based isolation
- Token-based authentication
- Permission enforcement
- Content Security Policy

**Admin Dashboard:**
- Security metrics
- Extension monitoring
- Approval queue management
- Activity logs

For complete documentation, see [Extension Lab Guide](/help/docs/extensions).`
    }
  ];

  useEffect(() => {
    if (id) {
      const note = patchNotes.find(n => n.id === id);
      setCurrentNote(note || null);
    }
  }, [id]);

  const filteredNotes = patchNotes.filter(note => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      note.title.toLowerCase().includes(query) ||
      note.description.toLowerCase().includes(query) ||
      note.version.includes(query) ||
      note.tags.some(tag => tag.toLowerCase().includes(query))
    );
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'major': return <Sparkles className="h-5 w-5" />;
      case 'minor': return <Zap className="h-5 w-5" />;
      case 'patch': return <Bug className="h-5 w-5" />;
      case 'security': return <Shield className="h-5 w-5" />;
      default: return <Package className="h-5 w-5" />;
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'major': return 'bg-purple-500';
      case 'minor': return 'bg-blue-500';
      case 'patch': return 'bg-green-500';
      case 'security': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  if (currentNote) {
    return (
      <div className="container mx-auto p-4 md:p-8 max-w-7xl">
        {isMobile && <MobileScrollToTop />}
        
        <Button
          variant="ghost"
          onClick={() => {
            setCurrentNote(null);
            navigate('/help/docs/notes');
          }}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Patch Notes
        </Button>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={getTypeBadgeColor(currentNote.type)}>
                    {currentNote.type.toUpperCase()}
                  </Badge>
                  <Badge variant="outline">v{currentNote.version}</Badge>
                </div>
                <CardTitle className="text-3xl mb-2">{currentNote.title}</CardTitle>
                <CardDescription className="text-lg">{currentNote.description}</CardDescription>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <Calendar className="h-4 w-4" />
                  <span>{new Date(currentNote.date).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}</span>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {currentNote.highlights.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Highlights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {currentNote.highlights.map((highlight, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <GitCommit className="h-4 w-4 mt-1 text-primary" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  }
                }}
              >
                {currentNote.content}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex gap-2 flex-wrap">
          {currentNote.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-7xl">
      {isMobile && <MobileScrollToTop />}
      
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold">Patch Notes</h1>
        </div>
        <p className="text-muted-foreground text-lg">
          Stay up to date with the latest features, improvements, and bug fixes
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="text"
              placeholder="Search patch notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {filteredNotes.map((note) => (
          <Card
            key={note.id}
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate(`/help/docs/notes/${note.id}`)}
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className={`p-3 rounded-lg ${getTypeBadgeColor(note.type)} bg-opacity-10`}>
                    {getTypeIcon(note.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge className={getTypeBadgeColor(note.type)}>
                        {note.type.toUpperCase()}
                      </Badge>
                      <Badge variant="outline">v{note.version}</Badge>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(note.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <CardTitle className="mb-2">{note.title}</CardTitle>
                    <CardDescription>{note.description}</CardDescription>
                    {note.highlights.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {note.highlights.slice(0, 3).map((highlight, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <GitCommit className="h-3 w-3" />
                            <span>{highlight}</span>
                          </div>
                        ))}
                        {note.highlights.length > 3 && (
                          <div className="text-sm text-primary">
                            +{note.highlights.length - 3} more highlights
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}

        {filteredNotes.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No patch notes found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search query
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PatchNotes;
