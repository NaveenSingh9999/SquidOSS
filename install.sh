#!/bin/bash
# SquidOSS — one-command installer
# Usage: curl -fsSL https://raw.githubusercontent.com/NaveenSingh9999/SquidOSS/main/install.sh | bash

set -e
exec bash <(curl -fsSL https://raw.githubusercontent.com/NaveenSingh9999/SquidOSS/main/scripts/install.sh) "$@"
