#!/bin/bash

# SquidCloud Deployment Script
# Handles version bumping, cache busting, and deployment preparation

set -e  # Exit on any error

echo "🚀 Starting SquidCloud deployment preparation..."

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found. Please run this script from the project root."
  exit 1
fi

# Run the version update script
echo "📦 Updating version and cache-busting info..."
node scripts/update-version.js

# Get the new version for display
NEW_VERSION=$(node -p "require('./package.json').version")
echo "✅ Updated to version $NEW_VERSION"

# Check if we should run build locally or let Vercel handle it
if [ "$1" = "--build" ]; then
  echo "🔨 Running build locally..."
  npm run build
  echo "✅ Build completed"
fi

# Commit changes if this is a git repository
if [ -d ".git" ]; then
  echo "📝 Committing version bump..."
  git add package.json public/version.json public/service-worker.js
  git commit -m "🚀 Version bump to $NEW_VERSION with cache busting" || echo "No changes to commit"
fi

echo ""
echo "🎉 Deployment preparation complete!"
echo "📊 Deployment info:"
echo "   Version: $NEW_VERSION"
echo "   Files updated: package.json, public/version.json, public/service-worker.js"
echo ""
echo "📤 Ready to deploy to Vercel!"
echo "   Users will automatically get the update without clearing cache"