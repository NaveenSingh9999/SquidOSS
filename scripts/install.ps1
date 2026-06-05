# SquidOSS Windows Installer
#
# One-liner (run in cmd.exe):
#   curl -fsSL https://raw.githubusercontent.com/NaveenSingh9999/SquidOSS/main/scripts/install.ps1 -o %TEMP%\squidoss.ps1 && powershell -ExecutionPolicy Bypass -File %TEMP%\squidoss.ps1
#
# Or save as install.ps1 and run in PowerShell:
#   powershell -ExecutionPolicy Bypass -File install.ps1

# Enable TLS 1.2 (required for GitHub downloads on older Windows 10 / PowerShell 5)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Stop on first error — but catch-block handles install failures gracefully
$ErrorActionPreference = "Stop"

$REPO = "https://github.com/NaveenSingh9999/SquidOSS.git"
$DIR = "$env:USERPROFILE\SquidOSS"

function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "  - $m" -ForegroundColor Yellow }
function Ok($m)   { Write-Host "  ✓ $m" -ForegroundColor Green }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host ""
  Write-Host "WARNING: Not running as Administrator." -ForegroundColor Red
  Write-Host "  Winget installs will fail. Continue anyway (manual installs only)." -ForegroundColor Yellow
  Write-Host "  (seriously microsoft, why is this still a thing in 2026?)" -ForegroundColor Gray
  Write-Host ""
}

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        SquidOSS Installer            ║" -ForegroundColor Cyan
Write-Host "║      Self-Hosted File Storage        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Helper: install via winget ────────────────────────────────
function Install-Package($name, $wingetId, $manualUrl) {
  if (-not $isAdmin) { Warn("Install $name manually: $manualUrl"); return }
  Step "Installing $name..."
  try {
    $p = Start-Process -Wait -PassThru -NoNewWindow -FilePath "winget" -ArgumentList "install",$wingetId,"--silent","--accept-package-agreements"
    if ($p.ExitCode -eq 0) { Ok("$name installed") }
    else { throw "winget exit code $($p.ExitCode)" }
  } catch {
    Warn("Install $name manually: $manualUrl (`n  $($_.Exception.Message))")
  }
}

# ── Refresh PATH from registry ────────────────────────────────
function Update-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

# ── Install dependencies ──────────────────────────────────────
Step "Checking Node.js..."
try { node --version | Out-Null; $global:nodeOk = $true; Ok("Node.js found") }
catch { $global:nodeOk = $false; Install-Package "Node.js" "OpenJS.NodeJS.LTS" "https://nodejs.org" }

# Refresh PATH so newly installed tools are available
Update-Path

# If Node was installed but still not found, locate it manually
if (-not $global:nodeOk) {
  try { node --version | Out-Null; $global:nodeOk = $true } catch {}
}
if (-not $global:nodeOk) {
  # Check common install locations
  $paths = @(
    "$env:ProgramFiles\nodejs\node.exe",
    "${env:ProgramFiles(x86)}\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
  )
  foreach ($p in $paths) {
    if (Test-Path $p) {
      $dir = Split-Path $p -Parent
      $env:Path = "$dir;$env:Path"
      try { node --version | Out-Null; $global:nodeOk = $true; Ok("Node.js found at $p"); break } catch {}
    }
  }
}
if (-not $global:nodeOk) { Warn("Node.js not found in PATH — install manually and re-run"); exit 1 }

# Ensure npm is also available
try { npm --version | Out-Null } catch { Warn("npm not found — reinstall Node.js"); exit 1 }

Step "Checking Git..."
try { git --version | Out-Null; Ok("Git found") }
catch {
  Install-Package "Git" "Git.Git" "https://git-scm.com"
  Update-Path
  try { git --version | Out-Null } catch { Warn("Install Git from https://git-scm.com and re-run"); exit 1 }
}

Step "Checking PostgreSQL..."
try { psql --version | Out-Null; Ok("PostgreSQL found") }
catch {
  Install-Package "PostgreSQL" "PostgreSQL.PostgreSQL.16" "https://postgresql.org/download/windows/"
  Update-Path
  try { psql --version | Out-Null } catch { Warn("Install PostgreSQL from https://postgresql.org/download/windows/ and re-run"); exit 1 }
}

Step "Checking Redis..."
$global:redisOk = $false
try { $pong = redis-cli ping 2>$null; if ($pong -eq "PONG") { $global:redisOk = $true; Ok("Redis found") } else { throw } }
catch { }
if (-not $global:redisOk) {
  Install-Package "Redis (Memurai)" "Memurai.Memurai" "https://github.com/microsoftarchive/redis/releases"
  Update-Path
  try { $pong = redis-cli ping 2>$null; if ($pong -eq "PONG") { $global:redisOk = $true; Ok("Memurai/Redis found after install") } else { throw } } catch {
    Warn("Install Redis from https://github.com/microsoftarchive/redis/releases and re-run")
  }
}

# ── Clone repo ────────────────────────────────────────────────
Step "Setting up SquidOSS..."
if (Test-Path $DIR) {
  Push-Location $DIR
  git pull 2>&1 | Out-Null
  Ok("Updated existing repo at $DIR")
} else {
  git clone $REPO $DIR 2>&1 | Out-Null
  Push-Location $DIR
  if (-not (Test-Path "$DIR\crd.js")) { Warn("Clone failed — check git"); exit 1 }
  Ok("Cloned SquidOSS to $DIR")
}

# ── Install npm deps ──────────────────────────────────────────
Step "Installing npm dependencies..."
Write-Host "  (this may take a while on first run...)" -ForegroundColor Gray
Push-Location "$DIR\backend"
npm install --loglevel error 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Warn("Backend npm install failed — run 'cd backend && npm install' manually"); exit 1 }
Ok("Backend deps installed")
Push-Location "$DIR"
npm install --loglevel error 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Warn("Frontend npm install failed — run 'npm install' manually"); exit 1 }
Ok("Frontend deps installed")

# ── Configure ─────────────────────────────────────────────────
Step "Configuring environment..."
node crd.js configure
if ($LASTEXITCODE -ne 0) { Warn("Configure failed"); exit 1 }
Ok("Environment configured")

# ── Migrate ───────────────────────────────────────────────────
Step "Running database migration..."
Write-Host "  (make sure PostgreSQL service is running...)" -ForegroundColor Gray
node crd.js migrate
if ($LASTEXITCODE -ne 0) { Warn("Migration failed — check PostgreSQL is running"); exit 1 }
Ok("Database migrated")

# ── Launcher ──────────────────────────────────────────────────
Step "Creating desktop shortcuts..."
node crd.js launcher
Ok("Launcher created")

# ── Done ──────────────────────────────────────────────────────
Pop-Location
Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║      SquidOSS Installed!             ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  cd $DIR"
Write-Host "  node crd.js start     # start backend (port 3000) + frontend (port 5173)"
Write-Host "  node crd.js stop      # stop all services"
Write-Host "  node crd.js launcher  # re-create desktop shortcut"
Write-Host ""
Write-Host "  Frontend: http://localhost:5173"
Write-Host "  Backend:  http://localhost:3000"
Write-Host ""

$choice = Read-Host "Press Enter to start SquidOSS now (or type N to skip)"
if ($choice -ne "N" -and $choice -ne "n") {
  node "$DIR\crd.js" start
}
