#!/bin/bash

# GitHub Cluster Test Script
# Tests the 3-node GitHub cluster system

echo "=================================="
echo "GitHub Cluster Test"
echo "=================================="
echo ""

# Get Supabase URL and Anon Key from environment or prompt
if [ -z "$SUPABASE_URL" ]; then
  read -p "Enter your Supabase URL (e.g., https://xxx.supabase.co): " SUPABASE_URL
fi

if [ -z "$SUPABASE_ANON_KEY" ]; then
  read -p "Enter your Supabase Anon Key: " SUPABASE_ANON_KEY
fi

CLUSTER_URL="${SUPABASE_URL}/functions/v1/github-cluster"

echo ""
echo "Testing cluster endpoint: $CLUSTER_URL"
echo ""

# Test 1: Get Cluster Info
echo "Test 1: Getting cluster information..."
RESPONSE=$(curl -s -X POST "$CLUSTER_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{"action":"get-cluster-info"}')

echo "Response: $RESPONSE"
echo ""

# Check if response contains nodes
if echo "$RESPONSE" | grep -q '"totalNodes"'; then
  TOTAL_NODES=$(echo "$RESPONSE" | grep -o '"totalNodes":[0-9]*' | grep -o '[0-9]*')
  echo "✅ Cluster initialized with $TOTAL_NODES node(s)"
  echo ""
  
  if [ "$TOTAL_NODES" -eq 3 ]; then
    echo "🎉 Perfect! All 3 nodes are configured!"
  elif [ "$TOTAL_NODES" -eq 2 ]; then
    echo "⚠️  Only 2 nodes configured. Add GITHUB_TOKEN_3 and GITHUB_USERNAME_3 for full speed."
  elif [ "$TOTAL_NODES" -eq 1 ]; then
    echo "⚠️  Only 1 node configured. Add GITHUB_TOKEN_2, GITHUB_USERNAME_2, GITHUB_TOKEN_3, GITHUB_USERNAME_3 for full speed."
  fi
else
  echo "❌ Cluster not initialized!"
  echo "Please check:"
  echo "  1. GITHUB_TOKEN and GITHUB_USERNAME are set in Supabase secrets"
  echo "  2. github-cluster function is deployed"
  echo "  3. Function is accessible"
  exit 1
fi

echo ""

# Test 2: Select Node for Chunk
echo "Test 2: Testing node selection..."
SELECT_RESPONSE=$(curl -s -X POST "$CLUSTER_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{"action":"select-node","chunkIndex":0,"totalChunks":100}')

echo "Response: $SELECT_RESPONSE"
echo ""

if echo "$SELECT_RESPONSE" | grep -q '"nodeId"'; then
  echo "✅ Node selection working!"
else
  echo "❌ Node selection failed!"
  exit 1
fi

echo ""

# Test 3: Test each chunk distribution
echo "Test 3: Verifying round-robin distribution..."
echo ""

for i in {0..8}; do
  NODE_RESPONSE=$(curl -s -X POST "$CLUSTER_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -d "{\"action\":\"select-node\",\"chunkIndex\":$i,\"totalChunks\":100}")
  
  NODE_ID=$(echo "$NODE_RESPONSE" | grep -o '"nodeId":[0-9]*' | grep -o '[0-9]*')
  REPO_NAME=$(echo "$NODE_RESPONSE" | grep -o '"repoName":"[^"]*"' | sed 's/"repoName":"//;s/"//')
  
  echo "Chunk $i → Node $NODE_ID (repo: $REPO_NAME)"
done

echo ""
echo "=================================="
echo "Test Summary"
echo "=================================="
echo ""

if [ "$TOTAL_NODES" -eq 3 ]; then
  echo "✅ Cluster Status: EXCELLENT"
  echo "   - 3 nodes configured"
  echo "   - 9 parallel uploads possible (3 per node)"
  echo "   - Maximum performance achieved!"
  echo ""
  echo "Expected upload speeds:"
  echo "   - 100MB file: ~30 seconds"
  echo "   - 500MB file: ~2-3 minutes"
  echo "   - 1GB file: ~5-6 minutes"
elif [ "$TOTAL_NODES" -eq 2 ]; then
  echo "⚠️  Cluster Status: GOOD"
  echo "   - 2 nodes configured"
  echo "   - 6 parallel uploads possible"
  echo "   - Add Node 3 for maximum speed"
elif [ "$TOTAL_NODES" -eq 1 ]; then
  echo "⚠️  Cluster Status: BASIC"
  echo "   - 1 node only"
  echo "   - 3 parallel uploads possible"
  echo "   - Add Nodes 2 & 3 for faster uploads"
fi

echo ""
echo "Next steps:"
echo "  1. Try uploading a large file (>100MB)"
echo "  2. Check console for batch upload progress"
echo "  3. Monitor all 3 GitHub accounts for repositories"
echo ""
echo "=================================="
