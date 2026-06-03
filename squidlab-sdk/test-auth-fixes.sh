#!/bin/bash

# SquidLab SDK v1.0.6 Authentication Testing Script
# Tests all the fixes made in this release

echo "========================================="
echo "SquidLab SDK v1.0.6 - Authentication Tests"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    ((TESTS_FAILED++))
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Clean up any existing config
cleanup() {
    if [ -f ~/.squidlab/config.json ]; then
        rm ~/.squidlab/config.json
        info "Cleaned up existing config"
    fi
}

# Test 1: Login with invalid key format
test_invalid_format() {
    echo ""
    echo "Test 1: Login with invalid API key format"
    echo "----------------------------------------"
    
    OUTPUT=$(squidlab-sdk login --api-key "invalid_without_prefix" 2>&1)
    
    if echo "$OUTPUT" | grep -q "Invalid API key format"; then
        pass "Invalid format rejected correctly"
    else
        fail "Should reject keys not starting with cb_"
        echo "$OUTPUT"
    fi
}

# Test 2: Login with fake but formatted key
test_fake_key() {
    echo ""
    echo "Test 2: Login with fake API key (correct format)"
    echo "------------------------------------------------"
    
    OUTPUT=$(squidlab-sdk login --api-key "cb_fake_key_for_testing_12345" 2>&1)
    
    if echo "$OUTPUT" | grep -q "Login failed"; then
        pass "Fake API key rejected by server"
    else
        fail "Should reject invalid API keys"
        echo "$OUTPUT"
    fi
}

# Test 3: Whoami without login
test_whoami_not_logged_in() {
    echo ""
    echo "Test 3: Whoami command without login"
    echo "------------------------------------"
    
    cleanup
    
    OUTPUT=$(squidlab-sdk whoami 2>&1)
    
    if echo "$OUTPUT" | grep -q "Not logged in"; then
        pass "Whoami correctly detects not logged in state"
    else
        fail "Should show 'Not logged in' error"
        echo "$OUTPUT"
    fi
}

# Test 4: Files list without login
test_files_not_logged_in() {
    echo ""
    echo "Test 4: Files list without login"
    echo "---------------------------------"
    
    cleanup
    
    OUTPUT=$(squidlab-sdk api:files:list 2>&1)
    
    if echo "$OUTPUT" | grep -q "Not logged in"; then
        pass "Files list correctly detects not logged in state"
    else
        fail "Should show 'Not logged in' error"
        echo "$OUTPUT"
    fi
}

# Test 5: Check Edge Function endpoint
test_edge_function() {
    echo ""
    echo "Test 5: CloudBliss API Edge Function"
    echo "------------------------------------"
    
    RESPONSE=$(curl -s https://squidcloud.inflate.live/functions/v1/cloudbliss-api)
    
    if echo "$RESPONSE" | grep -q "SquidCloud API"; then
        pass "Edge Function is accessible"
        
        if echo "$RESPONSE" | grep -q "whoami"; then
            pass "whoami endpoint is listed"
        else
            fail "whoami endpoint not listed"
        fi
    else
        fail "Edge Function not accessible"
        echo "$RESPONSE"
    fi
}

# Test 6: Check whoami endpoint (without auth - should fail)
test_whoami_endpoint_no_auth() {
    echo ""
    echo "Test 6: Whoami endpoint without authentication"
    echo "-----------------------------------------------"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" https://squidcloud.inflate.live/functions/v1/cloudbliss-api/whoami)
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    if [ "$HTTP_CODE" = "401" ]; then
        pass "Whoami endpoint correctly requires authentication"
        
        if echo "$BODY" | grep -q "API key required"; then
            pass "Error message is correct"
        fi
    else
        fail "Should return 401 without auth (got $HTTP_CODE)"
        echo "$BODY"
    fi
}

# Test 7: Logout
test_logout() {
    echo ""
    echo "Test 7: Logout command"
    echo "----------------------"
    
    # Create a fake config
    mkdir -p ~/.squidlab
    echo '{"apiKey":"test"}' > ~/.squidlab/config.json
    
    OUTPUT=$(squidlab-sdk logout 2>&1)
    
    if echo "$OUTPUT" | grep -q "Logged out successfully"; then
        pass "Logout command works"
        
        if [ ! -f ~/.squidlab/config.json ]; then
            pass "Config file deleted"
        else
            fail "Config file should be deleted"
        fi
    else
        fail "Logout command failed"
        echo "$OUTPUT"
    fi
}

# Test 8: Verify config directory creation
test_config_directory() {
    echo ""
    echo "Test 8: Config directory auto-creation"
    echo "---------------------------------------"
    
    cleanup
    rm -rf ~/.squidlab
    
    # Try to save a config (will fail auth but should create dir)
    squidlab-sdk login --api-key "cb_test_12345" 2>&1 > /dev/null
    
    if [ -d ~/.squidlab ]; then
        pass "Config directory created automatically"
    else
        fail "Config directory should be created"
    fi
}

# Run all tests
echo ""
info "Running automated tests..."
echo ""

test_invalid_format
test_fake_key
test_whoami_not_logged_in
test_files_not_logged_in
test_edge_function
test_whoami_endpoint_no_auth
test_logout
test_config_directory

# Summary
echo ""
echo "========================================="
echo "Test Summary"
echo "========================================="
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
    echo "========================================="
    echo "Manual Testing Required"
    echo "========================================="
    echo ""
    echo "To complete testing, you need a valid API key:"
    echo ""
    echo "1. Login with your real API key:"
    echo "   $ squidlab-sdk login"
    echo ""
    echo "2. Verify whoami shows your info:"
    echo "   $ squidlab-sdk whoami"
    echo ""
    echo "3. Test files list:"
    echo "   $ squidlab-sdk api:files:list"
    echo ""
    echo "4. Verify JSON output works:"
    echo "   $ squidlab-sdk api:files:list --json"
    echo ""
    echo "5. Check storage info:"
    echo "   $ squidlab-sdk api:storage:info"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo ""
    echo "Please review the failures above."
    exit 1
fi
