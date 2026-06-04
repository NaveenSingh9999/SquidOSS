#!/bin/bash
# SquidOSS — one-command installer
# Usage:
#   Linux/macOS: curl -fsSL https://raw.githubusercontent.com/NaveenSingh9999/SquidOSS/main/install.sh | bash
#   Windows (cmd.exe / PowerShell):
#     powershell -c "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;iex((New-Object Net.WebClient).DownloadString('https://raw.githubusercontent.com/NaveenSingh9999/SquidOSS/main/scripts/install.ps1'))"

set -e

# Detect if this script is being run on Windows (e.g. via Git Bash / MSYS2)
case "$(uname -s)" in
  CYGWIN*|MINGW*|MSYS*)
    echo "Windows detected via Git Bash / MSYS2."
    echo "For best results, run this ONE command in cmd.exe or PowerShell:"
    echo ""
    echo "  powershell -c \"[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;iex((New-Object Net.WebClient).DownloadString('https://raw.githubusercontent.com/NaveenSingh9999/SquidOSS/main/scripts/install.ps1'))\""
    echo ""
    echo "Continuing with bash installer (Git Bash)..."
    ;;
esac

exec bash <(curl -fsSL https://raw.githubusercontent.com/NaveenSingh9999/SquidOSS/main/scripts/install.sh) "$@"
