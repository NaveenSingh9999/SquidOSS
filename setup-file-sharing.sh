#!/bin/bash

# SquidCloud File Sharing System Deployment Script
# This script sets up the new file sharing functionality

echo "🚀 SquidCloud File Sharing System Setup"
echo "======================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the SquidCloud project root directory"
    exit 1
fi

echo "📋 Current directory: $(pwd)"

# Check if Supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "⚠️  Supabase CLI not found. You'll need to apply the migration manually."
    echo "   Migration file: supabase/migrations/20250914_enhance_file_shares.sql"
else
    echo "📊 Applying database migration..."
    supabase db push
fi

# Install dependencies if needed
echo "📦 Checking dependencies..."
npm install

# Build the project
echo "🔨 Building the project..."
npm run build

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 Next Steps:"
echo "1. Apply the database migration if not done automatically:"
echo "   - File: supabase/migrations/20250914_enhance_file_shares.sql"
echo ""
echo "2. Test the sharing system:"
echo "   - Upload a file in the dashboard"
echo "   - Use the three-dot menu to create a share"
echo "   - Access the share link in an incognito window"
echo "   - Test preview and download functionality"
echo ""
echo "3. Review the test guide:"
echo "   - File: FILE_SHARING_TEST_GUIDE.md"
echo ""
echo "🔗 New Share URLs format: https://your-domain.com/share/{shareId}"
echo ""
