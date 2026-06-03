#!/bin/bash

# Build script with automatic version bumping and cache busting
# This script should be run before each deployment

echo "🚀 Starting SquidCloud build process..."

# Generate timestamp
TIMESTAMP=$(date +%s)000
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# Read current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")

# Increment patch version
NEW_VERSION=$(node -p "
  const semver = '$CURRENT_VERSION'.split('.');
  semver[2] = (parseInt(semver[2]) + 1).toString();
  semver.join('.');
")

echo "📦 Updating version from $CURRENT_VERSION to $NEW_VERSION"

# Update package.json version
npm version $NEW_VERSION --no-git-tag-version

# Update version.json with timestamp
echo "📝 Updating version.json with timestamp $TIMESTAMP"
cat > public/version.json << EOF
{"version": "$NEW_VERSION", "timestamp": "$TIMESTAMP", "buildDate": "$BUILD_DATE"}
EOF

# Update service worker cache name with timestamp
echo "🔄 Updating service worker cache name"
sed -i.bak "s/const CACHE_NAME = 'squidcloud-v[^']*'/const CACHE_NAME = 'squidcloud-v$NEW_VERSION-$TIMESTAMP'/" public/service-worker.js
rm -f public/service-worker.js.bak

# Clear any existing build
echo "🧹 Cleaning previous build"
rm -rf dist/

# Run the build
echo "🔨 Building application"
npm run build

# Add cache busting to built files
echo "⚡ Adding cache busting to built assets"
if [ -d "dist/assets" ]; then
  for file in dist/assets/*.js dist/assets/*.css; do
    if [ -f "$file" ]; then
      # Add timestamp to filename
      dir=$(dirname "$file")
      base=$(basename "$file")
      name="${base%.*}"
      ext="${base##*.}"
      mv "$file" "$dir/$name.$TIMESTAMP.$ext"
    fi
  done
fi

echo "✅ Build completed successfully!"
echo "📊 Build info:"
echo "   Version: $NEW_VERSION"
echo "   Timestamp: $TIMESTAMP"
echo "   Build Date: $BUILD_DATE"
echo ""
echo "🚀 Ready for deployment!"