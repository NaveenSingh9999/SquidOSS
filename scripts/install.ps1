# SquidOSS Windows Installer
# Run in PowerShell as Administrator:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   iex ((New-Object Net.WebClient).DownloadString('https://raw.githubusercontent.com/NaveenSingh9999/SquidOSS/main/scripts/install.ps1'))

$ErrorActionPreference = "Stop"
$REPO = "https://github.com/NaveenSingh9999/SquidOSS.git"
$DIR = "$env:USERPROFILE\SquidOSS"

function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "  - $m" -ForegroundColor Yellow }
function Ok($m)   { Write-Host "  ✓ $m" -ForegroundColor Green }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "WARNING: Not running as Administrator." -ForegroundColor Red
  Write-Host "  Some installs may fail. Restart PowerShell as Admin and try again." -ForegroundColor Yellow
  Write-Host ""
}

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        SquidOSS Installer            ║" -ForegroundColor Cyan
Write-Host "║      Self-Hosted File Storage        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Helper: install via winget or choco ───────────────────────
function Install-Package($name, $wingetId, $chocoId, $manualUrl) {
  try {
    Step "Installing $name via winget..."
    winget install $wingetId --silent --accept-package-agreements | Out-Null
    Ok("$name installed")
    return
  } catch {
    try {
      Step "Installing $name via chocolatey..."
      choco install $chocoId -y | Out-Null
      Ok("$name installed")
      return
    } catch {
      Warn("Install $name manually: $manualUrl")
    }
  }
}

# ── Install dependencies ──────────────────────────────────────
Step "Checking Node.js..."
try { node --version | Out-Null; Ok("Node.js found") }
catch { Install-Package "Node.js" "OpenJS.NodeJS.LTS" "nodejs-lts" "https://nodejs.org" }

# Refresh PATH so newly installed tools are available
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

Step "Checking Git..."
try { git --version | Out-Null; Ok("Git found") }
catch { Install-Package "Git" "Git.Git" "git" "https://git-scm.com" }

Step "Checking PostgreSQL..."
try { psql --version | Out-Null; Ok("PostgreSQL found") }
catch { Install-Package "PostgreSQL" "PostgreSQL.PostgreSQL.16" "postgresql16" "https://postgresql.org/download/windows/" }

Step "Checking Redis..."
try { redis-cli ping 2>$null | Out-Null; Ok("Redis found") }
catch { Install-Package "Redis (Memurai)" "Memurai.Memurai" "redis-64" "https://github.com/microsoftarchive/redis/releases" }

# ── Clone repo ────────────────────────────────────────────────
Step "Setting up SquidOSS..."
if (Test-Path $DIR) {
  Set-Location $DIR
  git pull | Out-Null
  Ok("Updated existing repo at $DIR")
} else {
  git clone $REPO $DIR | Out-Null
  Set-Location $DIR
  Ok("Cloned SquidOSS to $DIR")
}

# ── Install npm deps ──────────────────────────────────────────
Step "Installing npm dependencies..."
Set-Location "$DIR\backend"
npm install | Out-Null
Ok("Backend deps installed")
Set-Location "$DIR"
npm install | Out-Null
Ok("Frontend deps installed")

# ── Configure ─────────────────────────────────────────────────
Step "Configuring environment..."
node crd.js configure
Ok("Environment configured")

# ── Migrate ───────────────────────────────────────────────────
Step "Running database migration..."
node crd.js migrate
Ok("Database migrated")

# ── Launcher ──────────────────────────────────────────────────
Step "Creating desktop shortcuts..."
node crd.js launcher
Ok("Launcher created")

# ── Done ──────────────────────────────────────────────────────
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
