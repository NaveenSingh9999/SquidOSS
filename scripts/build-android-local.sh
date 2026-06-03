#!/bin/bash
set -euo pipefail

# Build a signed Android release APK locally from Codespaces.
# Usage:
#   bash scripts/build-android-local.sh [keystore_path] [store_password] [key_alias] [key_password]

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

KEYSTORE_PATH="${1:-$ROOT_DIR/squidcloud.keystore}"
STORE_PASSWORD="${2:-${SQUIDCLOUD_STORE_PASSWORD:-fuckyouHACKER@1234}}"
KEY_ALIAS="${3:-${SQUIDCLOUD_KEY_ALIAS:-squidcloud}}"
KEY_PASSWORD="${4:-${SQUIDCLOUD_KEY_PASSWORD:-$STORE_PASSWORD}}"

APT_UPDATED=0

run_as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi

  echo "ERROR: Need sudo/root to install system dependencies."
  exit 1
}

run_as_project_user() {
  if [[ "$(id -u)" -eq 0 && -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
    sudo -u "$SUDO_USER" -H env \
      "PATH=$PATH" \
      "JAVA_HOME=${JAVA_HOME:-}" \
      "SQUIDCLOUD_KEYSTORE_PATH=${SQUIDCLOUD_KEYSTORE_PATH:-}" \
      "SQUIDCLOUD_STORE_PASSWORD=${SQUIDCLOUD_STORE_PASSWORD:-}" \
      "SQUIDCLOUD_KEY_ALIAS=${SQUIDCLOUD_KEY_ALIAS:-}" \
      "SQUIDCLOUD_KEY_PASSWORD=${SQUIDCLOUD_KEY_PASSWORD:-}" \
      "$@"
    return
  fi

  "$@"
}

disable_yarn_repo_entries() {
  local changed=0
  local f

  for f in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
    [[ -e "$f" ]] || continue
    if grep -qi 'dl.yarnpkg.com/debian' "$f"; then
      if [[ "$f" == "/etc/apt/sources.list" ]]; then
        run_as_root sed -i -E '/dl\.yarnpkg\.com\/debian/ s|^|# disabled by build-android-local.sh: |' "$f"
      else
        run_as_root mv "$f" "${f}.disabled-by-build-android-local"
      fi
      changed=1
      echo "==> Disabled broken Yarn apt source: $f"
    fi
  done

  if [[ "$changed" -eq 0 ]]; then
    echo "WARNING: Yarn signature error detected, but no matching source file was found."
  fi
}

apt_update_with_repair() {
  local update_log
  update_log="$(mktemp)"

  if run_as_root apt-get update 2>&1 | tee "$update_log"; then
    rm -f "$update_log"
    return
  fi

  if grep -Eq 'dl\.yarnpkg\.com/debian|NO_PUBKEY 62D54FD4003F6525' "$update_log"; then
    echo "==> Detected broken Yarn apt repo signature, repairing apt sources"
    disable_yarn_repo_entries
    run_as_root apt-get update
    rm -f "$update_log"
    return
  fi

  echo "ERROR: apt-get update failed for a non-recoverable reason."
  rm -f "$update_log"
  exit 1
}

apt_install() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "ERROR: apt-get is not available. Install missing dependencies manually."
    exit 1
  fi

  if [[ "$APT_UPDATED" -eq 0 ]]; then
    echo "==> Updating apt package index"
    apt_update_with_repair
    APT_UPDATED=1
  fi

  echo "==> Installing packages: $*"
  run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
}

ensure_command() {
  local cmd="$1"
  local pkg="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    return
  fi

  apt_install "$pkg"

  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: '$cmd' still missing after installing '$pkg'."
    exit 1
  fi
}

get_java_major() {
  java -version 2>&1 | awk -F '[".]' '/version/ {print $2; exit}'
}

get_node_major() {
  node -p "process.versions.node.split('.')[0]"
}

set_java_home_21() {
  local candidate
  for candidate in /usr/lib/jvm/java-21-openjdk* /usr/lib/jvm/temurin-21* /usr/lib/jvm/msopenjdk-21*; do
    [[ -d "$candidate" ]] || continue
    if [[ -x "$candidate/bin/java" ]]; then
      export JAVA_HOME="$candidate"
      export PATH="$JAVA_HOME/bin:$PATH"
      return
    fi
  done
}

ensure_java_21() {
  local major=0
  if command -v java >/dev/null 2>&1; then
    major="$(get_java_major || echo 0)"
  fi

  if [[ "$major" -lt 21 ]]; then
    apt_install openjdk-21-jdk-headless
  fi

  set_java_home_21

  if ! command -v keytool >/dev/null 2>&1; then
    echo "ERROR: keytool is missing even after installing Java 21."
    exit 1
  fi

  major="$(get_java_major || echo 0)"
  if [[ "$major" -lt 21 ]]; then
    echo "ERROR: Java 21 is required, but active java is version $major."
    exit 1
  fi
}

resolve_apksigner() {
  if command -v apksigner >/dev/null 2>&1; then
    command -v apksigner
    return
  fi

  local sdk_candidates=()
  local sdk
  local candidate

  if [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
    sdk_candidates+=("$ANDROID_SDK_ROOT")
  fi
  if [[ -n "${ANDROID_HOME:-}" ]]; then
    sdk_candidates+=("$ANDROID_HOME")
  fi
  sdk_candidates+=("$HOME/Android/Sdk" "/usr/local/lib/android/sdk" "/opt/android-sdk" "/usr/lib/android-sdk")

  for sdk in "${sdk_candidates[@]}"; do
    [[ -d "$sdk" ]] || continue
    for candidate in "$sdk"/build-tools/*/apksigner; do
      [[ -x "$candidate" ]] || continue
      echo "$candidate"
      return
    done
  done
}

ensure_android_sdk() {
  if [[ -n "${ANDROID_HOME:-}" && -d "$ANDROID_HOME" ]]; then
    return
  fi
  
  local default_sdk="/usr/lib/android-sdk"
  if [[ -d "$default_sdk" ]]; then
    export ANDROID_HOME="$default_sdk"
    export ANDROID_SDK_ROOT="$default_sdk"
    export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
    return
  fi

  local default_sdk2="/usr/local/lib/android/sdk"
  if [[ -d "$default_sdk2" ]]; then
    export ANDROID_HOME="$default_sdk2"
    export ANDROID_SDK_ROOT="$default_sdk2"
    export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
    return
  fi
}

ensure_imagemagick() {
  if command -v convert >/dev/null 2>&1 || command -v magick >/dev/null 2>&1; then
    return
  fi

  apt_install imagemagick

  if ! command -v convert >/dev/null 2>&1 && ! command -v magick >/dev/null 2>&1; then
    echo "ERROR: ImageMagick install completed but neither 'convert' nor 'magick' was found."
    exit 1
  fi
}

cleanup_problematic_npm_paths() {
  run_as_root rm -rf \
    "$ROOT_DIR/node_modules/@capacitor/android/capacitor/.gradle/nb-cache" \
    "$ROOT_DIR/node_modules/@capacitor/android/capacitor/.gradle"
}

npm_ci_with_retry() {
  local attempt
  for attempt in 1 2; do
    if run_as_project_user bash -lc "cd '$ROOT_DIR' && npm ci"; then
      return
    fi

    if [[ "$attempt" -eq 1 ]]; then
      echo "==> npm ci failed, cleaning npm/Capacitor cache paths and retrying"
      cleanup_problematic_npm_paths
      run_as_project_user bash -lc "npm cache clean --force >/dev/null 2>&1 || true"
      continue
    fi
  done

  echo "ERROR: npm ci failed after retry."
  exit 1
}

build_web_assets() {
  local web_build_node_mb="${WEB_BUILD_NODE_MB:-3072}"
  local node_major

  echo "==> Preparing web assets (CI profile)"
  run_as_project_user bash -lc "cd '$ROOT_DIR' && npm run copy:wasm"

  node_major="$(run_as_project_user bash -lc "node -p \"process.versions.node.split('.')[0]\"" | tr -d '[:space:]')"

  if [[ "$node_major" == "20" ]]; then
    run_as_project_user bash -lc "cd '$ROOT_DIR' && NODE_OPTIONS='--max-old-space-size=${web_build_node_mb}' npm run build:production"
    return
  fi

  echo "==> Node ${node_major} detected; CI builds use Node 20. Running web build with Node 20 compatibility runner."
  if run_as_project_user bash -lc "cd '$ROOT_DIR' && NODE_OPTIONS='--max-old-space-size=${web_build_node_mb}' npx -y node@20 scripts/update-version.js && NODE_OPTIONS='--max-old-space-size=${web_build_node_mb}' npx -y node@20 ./node_modules/vite/bin/vite.js build --mode production"; then
    return
  fi

  echo "ERROR: Web build failed using both host Node ${node_major} and Node 20 compatibility runner."
  echo "Install and use Node 20 in this codespace to match CI (actions/setup-node node-version=20)."
  exit 1
}

if [[ ! -f "$KEYSTORE_PATH" ]]; then
  echo "ERROR: Keystore not found at $KEYSTORE_PATH"
  echo "Create one with: bash scripts/create-keystore.sh"
  exit 1
fi

ensure_java_21
ensure_android_sdk
ensure_command node nodejs
ensure_command npm npm
ensure_command npx npm
ensure_command git git
ensure_imagemagick

if ! keytool -list -keystore "$KEYSTORE_PATH" -storepass "$STORE_PASSWORD" -alias "$KEY_ALIAS" >/dev/null 2>&1; then
  echo "ERROR: Keystore validation failed. Check keystore path/alias/password."
  exit 1
fi

export SQUIDCLOUD_KEYSTORE_PATH="$KEYSTORE_PATH"
export SQUIDCLOUD_STORE_PASSWORD="$STORE_PASSWORD"
export SQUIDCLOUD_KEY_ALIAS="$KEY_ALIAS"
export SQUIDCLOUD_KEY_PASSWORD="$KEY_PASSWORD"

if [[ -z "${ANDROID_HOME:-}" ]]; then
  echo "ERROR: ANDROID_HOME is not set. Install Android SDK or set ANDROID_HOME."
  exit 1
fi

if [[ ! -f "$ROOT_DIR/android/local.properties" ]]; then
  echo "sdk.dir=$ANDROID_HOME" > "$ROOT_DIR/android/local.properties"
fi

echo "==> Installing dependencies"
npm_ci_with_retry

echo "==> Preparing web build"
build_web_assets

echo "==> Syncing Capacitor Android project"
run_as_project_user bash -lc "cd '$ROOT_DIR' && npx cap sync android"

echo "==> Generating Android launcher icons"
run_as_project_user bash -lc "cd '$ROOT_DIR' && bash scripts/generate-android-icons.sh"

echo "==> Building signed release APK"
run_as_project_user bash -lc "cd '$ROOT_DIR/android' && chmod +x ./gradlew && ./gradlew clean assembleRelease"

APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$APK_PATH" ]]; then
  echo "ERROR: APK not found at $APK_PATH"
  exit 1
fi

APKSIGNER_BIN="$(resolve_apksigner || true)"
if [[ -n "$APKSIGNER_BIN" ]]; then
  echo "==> Verifying APK signature"
  "$APKSIGNER_BIN" verify --print-certs "$APK_PATH"
else
  echo "WARNING: apksigner not found; skipping signature verification."
fi

echo "SUCCESS: Signed APK created at $APK_PATH"
