#!/bin/bash
set -e

REPO="https://github.com/NaveenSingh9999/SquidOSS.git"
DIR="${HOME}/SquidOSS"

print_step() { echo "==> $1"; }
print_ok()   { echo "  ✓ $1"; }
print_skip() { echo "  - $1 (skipped)"; }

# ── Detect OS ────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
  Linux)
    if [ -n "$PREFIX" ] && echo "$PREFIX" | grep -q termux; then
      PLATFORM="termux"
    elif command -v apt-get &>/dev/null; then
      PLATFORM="debian"
    elif command -v pacman &>/dev/null; then
      PLATFORM="arch"
    elif command -v dnf &>/dev/null || command -v yum &>/dev/null; then
      PLATFORM="rhel"
    else
      PLATFORM="linux"
    fi
    ;;
  Darwin) PLATFORM="macos" ;;
  CYGWIN*|MINGW*|MSYS*) PLATFORM="windows" ;;
  *) echo "Unsupported: $OS"; exit 1 ;;
esac

echo ""
echo "╔══════════════════════════════════════╗"
echo "║        SquidOSS Installer            ║"
echo "║      Self-Hosted File Storage        ║"
echo "╚══════════════════════════════════════╝"
echo "  Platform: $PLATFORM ($ARCH)"
echo ""

# ── Install system deps ─────────────────────────────────────
install_system_deps() {
  print_step "Installing system dependencies..."

  case "$PLATFORM" in
    termux)
      pkg update -y
      pkg install -y nodejs-lts postgresql redis git python make
      ;;
    debian)
      sudo apt-get update -qq
      sudo apt-get install -y -qq curl git nodejs npm postgresql postgresql-client redis-server
      ;;
    arch)
      sudo pacman -Sy --noconfirm curl git nodejs npm postgresql redis
      ;;
    rhel)
      sudo dnf install -y curl git nodejs npm postgresql-server postgresql-contrib redis
      ;;
    macos)
      if ! command -v brew &>/dev/null; then
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      fi
      brew install node postgresql@16 redis git
      ;;
    windows)
      print_step "Installing Node.js..."
      winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements 2>/dev/null && print_ok "Node.js installed" || print_skip "Install Node.js from https://nodejs.org"
      print_step "Installing Git..."
      winget install Git.Git --silent --accept-package-agreements 2>/dev/null && print_ok "Git installed" || print_skip "Install Git from https://git-scm.com"
      print_step "Installing PostgreSQL..."
      winget install PostgreSQL.PostgreSQL.16 --silent --accept-package-agreements 2>/dev/null && print_ok "PostgreSQL installed" || print_skip "Install PostgreSQL from https://postgresql.org/download/windows/"
      print_step "Installing Redis..."
      winget install Memurai.Memurai --silent --accept-package-agreements 2>/dev/null && print_ok "Redis (Memurai) installed" || print_skip "Install Redis from https://github.com/microsoftarchive/redis/releases"
      ;;
  esac
}

# ── Clone repo ───────────────────────────────────────────────
clone_repo() {
  if [ -d "$DIR" ]; then
    print_skip "Directory $DIR exists"
    cd "$DIR"
    git pull
  else
    print_step "Cloning SquidOSS..."
    git clone "$REPO" "$DIR"
    cd "$DIR"
  fi
}

# ── Setup launchers ─────────────────────────────────────────
setup_launchers() {
  print_step "Creating platform launchers..."
  node crd.js launcher
}

# ── Build ────────────────────────────────────────────────────
build_squidoss() {
  print_step "Running build..."
  node crd.js build
}

# ── Done ─────────────────────────────────────────────────────
print_done() {
  echo ""
  echo "╔══════════════════════════════════════╗"
  echo "║      SquidOSS Installed!             ║"
  echo "╚══════════════════════════════════════╝"
  echo ""
  echo "  cd ${DIR}"
  echo "  ./crd install    # install deps"
  echo "  ./crd build      # full setup"
  echo "  ./crd start      # start services"
  echo "  ./crd stop       # stop services"
  echo "  ./crd launcher   # create app shortcut"
  echo ""
  echo "  Frontend: http://localhost:5173"
  echo "  Backend:  http://localhost:3000"
  echo ""
}

# ── Main ─────────────────────────────────────────────────────
install_system_deps
clone_repo
cd "$DIR"
node crd.js configure
node crd.js migrate
setup_launchers
print_done
