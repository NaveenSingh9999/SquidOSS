#!/bin/bash
# SquidOSS — one-command installer
# Usage:
#   Linux/macOS: curl -fsSL https://raw.githubusercontent.com/NaveenSingh9999/SquidOSS/main/install.sh | bash
#   Windows (PowerShell as Admin):
#     Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; iex ((New-Object Net.WebClient).DownloadString('https://raw.githubusercontent.com/NaveenSingh9999/SquidOSS/main/scripts/install.ps1'))

set -e

# Detect if this script is being run on Windows (e.g. via Git Bash / MSYS2)
case "$(uname -s)" in
  CYGWIN*|MINGW*|MSYS*)
    echo "Windows detected via Git Bash / MSYS2."
    echo "For best results, open PowerShell as Administrator and run:"
    echo ""
    echo "  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass"
    echo "  iex ((New-Object Net.WebClient).DownloadString('https://raw.githubusercontent.com/NaveenSingh9999/SquidOSS/main/scripts/install.ps1'))"
    echo ""
    echo "Continuing with bash installer (Git Bash)..."
    ;;
esac

exec bash <(curl -fsSL https://raw.githubusercontent.com/NaveenSingh9999/SquidOSS/main/scripts/install.sh) "$@"
