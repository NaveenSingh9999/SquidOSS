#!/bin/bash

# OAuth Setup Assistant for SquidCloud Migration
# This script helps you configure OAuth providers

echo "======================================"
echo "SquidCloud OAuth Migration Setup"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if logged into Supabase
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not installed${NC}"
    echo "Install it: npm install -g supabase"
    exit 1
fi

echo -e "${BLUE}ℹ${NC} Redirect URI for all providers:"
echo -e "${GREEN}https://aouqcwbdoyrccjcrhzzi.supabase.co/functions/v1/migration-oauth-callback${NC}"
echo ""
echo "You need to add this redirect URI to:"
echo "  1. Google Cloud Console (OAuth 2.0 Client)"
echo "  2. Dropbox App Console (OAuth Settings)"
echo "  3. Azure Portal (App Registration)"
echo ""

read -p "Have you configured the redirect URIs? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⚠️${NC}  Please configure redirect URIs first"
    echo "See OAUTH_MIGRATION_SETUP.md for detailed instructions"
    exit 1
fi

echo ""
echo "======================================"
echo "Enter OAuth Credentials"
echo "======================================"
echo ""

# Google Drive
echo -e "${BLUE}1. Google Drive${NC}"
read -p "Google Client ID: " GOOGLE_CLIENT_ID
read -sp "Google Client Secret: " GOOGLE_CLIENT_SECRET
echo ""
echo ""

# Dropbox
echo -e "${BLUE}2. Dropbox${NC}"
read -p "Dropbox App Key: " DROPBOX_APP_KEY
read -sp "Dropbox App Secret: " DROPBOX_APP_SECRET
echo ""
echo ""

# Microsoft OneDrive
echo -e "${BLUE}3. Microsoft OneDrive${NC}"
read -p "Microsoft Client ID: " MICROSOFT_CLIENT_ID
read -sp "Microsoft Client Secret: " MICROSOFT_CLIENT_SECRET
echo ""
echo ""

# Confirm
echo "======================================"
echo "Summary"
echo "======================================"
echo "Google Client ID: ${GOOGLE_CLIENT_ID:0:20}..."
echo "Dropbox App Key: ${DROPBOX_APP_KEY:0:15}..."
echo "Microsoft Client ID: ${MICROSOFT_CLIENT_ID:0:20}..."
echo ""
read -p "Set these secrets in Supabase? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 0
fi

echo ""
echo -e "${YELLOW}Setting Supabase secrets...${NC}"

# Set secrets
supabase secrets set GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" 2>&1 | grep -v "^$"
supabase secrets set GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" 2>&1 | grep -v "^$"
supabase secrets set DROPBOX_APP_KEY="$DROPBOX_APP_KEY" 2>&1 | grep -v "^$"
supabase secrets set DROPBOX_APP_SECRET="$DROPBOX_APP_SECRET" 2>&1 | grep -v "^$"
supabase secrets set MICROSOFT_CLIENT_ID="$MICROSOFT_CLIENT_ID" 2>&1 | grep -v "^$"
supabase secrets set MICROSOFT_CLIENT_SECRET="$MICROSOFT_CLIENT_SECRET" 2>&1 | grep -v "^$"

echo ""
echo -e "${GREEN}✅ All secrets set successfully!${NC}"
echo ""

# Ask about redeploying functions
read -p "Redeploy Edge Functions now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${YELLOW}Deploying migration-oauth...${NC}"
    supabase functions deploy migration-oauth
    
    echo ""
    echo -e "${YELLOW}Deploying migration-oauth-callback...${NC}"
    supabase functions deploy migration-oauth-callback
    
    echo ""
    echo -e "${GREEN}✅ Functions deployed!${NC}"
fi

echo ""
echo "======================================"
echo "Setup Complete! 🎉"
echo "======================================"
echo ""
echo "Next steps:"
echo "  1. Test Google Drive migration in your app"
echo "  2. Test Dropbox migration"
echo "  3. Test OneDrive migration"
echo ""
echo "If you see 'redirect_uri_mismatch', verify:"
echo "  - Redirect URI is exactly:"
echo "    https://aouqcwbdoyrccjcrhzzi.supabase.co/functions/v1/migration-oauth-callback"
echo "  - No typos or trailing slashes"
echo "  - HTTPS (not HTTP)"
echo ""
echo "Troubleshooting:"
echo "  - View logs: supabase functions logs migration-oauth"
echo "  - Check secrets: supabase secrets list"
echo "  - Read guide: cat OAUTH_MIGRATION_SETUP.md"
echo ""
