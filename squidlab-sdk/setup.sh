#!/bin/bash

# SquidLab SDK Setup & Installation Script
# This script builds and prepares the SDK for NPM publishing

set -e

echo "🚀 SquidLab SDK Setup & Installation"
echo "===================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the squidlab-sdk directory."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the SDK
echo "🔨 Building SDK..."
npm run build

# Make CLI executable
echo "🔧 Setting up CLI..."
chmod +x bin/cli.js

# Link locally for testing
echo "🔗 Linking SDK locally..."
npm link

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Test the CLI:"
echo "   squidlab-sdk --help"
echo ""
echo "2. Create a test extension:"
echo "   squidlab-sdk create test-extension"
echo ""
echo "3. Publish to NPM (when ready):"
echo "   npm login"
echo "   npm publish"
echo ""
echo "📚 Documentation:"
echo "   - README.md - General documentation"
echo "   - COMPLETE_GUIDE.md - Complete SDK guide"
echo "   - PUBLISH.md - NPM publishing guide"
echo "   - IN_APP_FETCHING.md - sqfetch system docs"
echo ""
echo "🎉 Happy coding!"
