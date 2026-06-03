// GitHub Cluster API - Multi-node GitHub storage system
// Uses 3 GitHub accounts + all user repos to distribute load

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface GitHubNode {
  id: number;
  username: string;
  token: string;
  repoPrefix: string;
}

interface ClusterConfig {
  nodes: GitHubNode[];
  totalNodes: number;
}

function initializeCluster(): ClusterConfig {
  const nodes: GitHubNode[] = [];
  
  const configs = [
    { token: 'GITHUB_TOKEN', username: 'GITHUB_USERNAME', prefix: 'cloudbliss-vault' },
    { token: 'GITHUB_TOKEN_2', username: 'GITHUB_USERNAME_2', prefix: 'cloudbliss-vault-2' },
    { token: 'GITHUB_TOKEN_3', username: 'GITHUB_USERNAME_3', prefix: 'cloudbliss-vault-3' }
  ];
  
  configs.forEach((config, index) => {
    const token = Deno.env.get(config.token);
    const username = Deno.env.get(config.username);
    if (token && username) {
      nodes.push({ id: index + 1, username, token, repoPrefix: config.prefix });
    }
  });
  
  if (nodes.length === 0) throw new Error('No GitHub nodes configured');
  console.log(`Cluster initialized with ${nodes.length} nodes`);
  return { nodes, totalNodes: nodes.length };
}

async function selectNodeForChunk(chunkIndex: number, totalChunks: number, cluster: ClusterConfig, supabase: any) {
  const { data: repos } = await supabase
    .from('repositories')
    .select('repo_name, account_id')
    .in('health_status', ['healthy', 'unknown'])
    .order('last_used', { ascending: true })
    .limit(100);
  
  if (!repos?.length) throw new Error('No repositories available');
  
  const repo = repos[Math.floor(Math.random() * repos.length)];
  const node = repo.account_id && repo.account_id <= cluster.totalNodes 
    ? cluster.nodes[repo.account_id - 1]
    : cluster.nodes[Math.floor(Math.random() * cluster.totalNodes)];
  
  await supabase.from('repositories').update({ last_used: new Date().toISOString() }).eq('repo_name', repo.repo_name);
  
  return { node, repoName: repo.repo_name, accountId: node.id };
}

// Get node by account_id
function getNodeByAccountId(accountId: number, cluster: ClusterConfig) {
  return accountId >= 1 && accountId <= cluster.totalNodes ? cluster.nodes[accountId - 1] : null;
}

// Get node by repo name (lookup from database)
async function getNodeByRepoName(repoName: string, cluster: ClusterConfig, supabase: any): Promise<GitHubNode | null> {
  try {
    const { data: repo } = await supabase
      .from('repositories')
      .select('account_id')
      .eq('repo_name', repoName)
      .single();
    
    if (repo?.account_id) {
      return getNodeByAccountId(repo.account_id, cluster);
    }
  } catch (error) {
    console.error(`Error looking up repo ${repoName}:`, error);
  }
  return null;
}

async function createRepository(repoName: string, node: GitHubNode, userId: string, supabase: any) {
  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${node.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'CloudBliss',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: repoName, private: true, auto_init: true }),
  });
  
  if (!res.ok) throw new Error(await res.text());
  
  await supabase.from('repositories').insert({
    repo_name: repoName,
    user_id: userId,
    account_id: node.id,
    health_status: 'healthy'
  });
}

async function uploadToGitHub(path: string, content: string, node: GitHubNode, repo: string) {
  let sha;
  try {
    const check = await fetch(`https://api.github.com/repos/${node.username}/${repo}/contents/${path}`, {
      headers: { 'Authorization': `Bearer ${node.token}`, 'User-Agent': 'CloudBliss' }
    });
    if (check.ok) sha = (await check.json()).sha;
  } catch {}
  
  const res = await fetch(`https://api.github.com/repos/${node.username}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${node.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'CloudBliss',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: `Upload ${path}`, content, sha }),
  });
  
  if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
  const data = await res.json();
  return { url: data.content.download_url, sha: data.content.sha };
}

async function downloadFromGitHub(path: string, node: GitHubNode, repo: string) {
  const res = await fetch(`https://api.github.com/repos/${node.username}/${repo}/contents/${path}`, {
    headers: { 'Authorization': `Bearer ${node.token}`, 'User-Agent': 'CloudBliss' }
  });
  if (!res.ok) throw new Error(`Download failed`);
  return await res.json();
}

async function batchUpload(chunks: any[], cluster: ClusterConfig) {
  return Promise.all(chunks.map(async (chunk) => {
    const node = getNodeByAccountId(chunk.accountId, cluster);
    if (!node) throw new Error(`Node ${chunk.accountId} not found`);
    return uploadToGitHub(chunk.path, chunk.content, node, chunk.repoName);
  }));
}

serve(async (req: Request) => {
  // KZA Guard — must be first
  const kzaResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/kza-sentinel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': req.headers.get('Authorization') ?? '',
      'X-KZA-Session': req.headers.get('X-KZA-Session') ?? '',
      'X-Forwarded-For': req.headers.get('X-Forwarded-For') ?? '',
      'User-Agent': req.headers.get('User-Agent') ?? '',
    },
    body: JSON.stringify({
      url: req.url,
      method: req.method,
      body_snapshot: await req.clone().text()
    })
  });

  if (!kzaResponse.ok) {
    return kzaResponse; // KZA blocked this request — return its response directly
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  
  try {
    const { action, ...params } = await req.json();
    const cluster = initializeCluster();
    const supabase = getSupabaseClient();
    
    if (action === 'get-cluster-info') {
      const { count } = await supabase.from('repositories').select('*', { count: 'exact', head: true });
      return new Response(JSON.stringify({
        success: true,
        nodes: cluster.nodes.map(n => ({ id: n.id, username: n.username })),
        totalNodes: cluster.totalNodes,
        totalRepos: count || 0
      }), { headers: corsHeaders });
    }
    
    if (action === 'select-node') {
      const selection = await selectNodeForChunk(params.chunkIndex, params.totalChunks, cluster, supabase);
      return new Response(JSON.stringify({ 
        success: true, 
        nodeId: selection.node.id,
        accountId: selection.accountId,
        repoName: selection.repoName,
        username: selection.node.username,
        // Don't expose token in response, use get-credentials action instead
      }), { headers: corsHeaders });
    }
    
    if (action === 'get-credentials') {
      // Get credentials for a specific accountId or nodeId
      const { accountId, nodeId, repoName } = params;
      
      let node: GitHubNode | null = null;
      
      if (accountId) {
        node = getNodeByAccountId(accountId, cluster);
      } else if (nodeId) {
        node = cluster.nodes[nodeId - 1] || null;
      } else if (repoName) {
        // Look up accountId from database
        const { data: repo } = await supabase
          .from('repositories')
          .select('account_id')
          .eq('repo_name', repoName)
          .single();
        
        if (repo?.account_id) {
          node = getNodeByAccountId(repo.account_id, cluster);
        }
      }
      
      if (!node) {
        // Fallback to first node
        node = cluster.nodes[0];
      }
      
      return new Response(JSON.stringify({ 
        success: true,
        nodeId: node.id,
        username: node.username,
        token: node.token // Only expose token in this specific action
      }), { headers: corsHeaders });
    }
    
    if (action === 'create-repo') {
      const node = params.nodeId ? cluster.nodes[params.nodeId - 1] : cluster.nodes[Math.floor(Math.random() * cluster.totalNodes)];
      await createRepository(params.repoName, node, params.userId, supabase);
      return new Response(JSON.stringify({ success: true, nodeId: node.id }), { headers: corsHeaders });
    }
    
    if (action === 'batch-upload') {
      const results = await batchUpload(params.chunks, cluster);
      return new Response(JSON.stringify({ success: true, results }), { headers: corsHeaders });
    }
    
    if (action === 'download') {
      let node: GitHubNode | null = null;
      
      // Try to get node by accountId first
      if (params.accountId) {
        node = getNodeByAccountId(params.accountId, cluster);
      }
      
      // If no accountId or node not found, lookup by repo name
      if (!node && params.repoName) {
        node = await getNodeByRepoName(params.repoName, cluster, supabase);
      }
      
      // If still no node, use first available node as fallback
      if (!node) {
        console.log(`No node found for accountId=${params.accountId}, repo=${params.repoName}, using first node`);
        node = cluster.nodes[0];
      }
      
      const result = await downloadFromGitHub(params.path, node, params.repoName);
      return new Response(JSON.stringify({ success: true, ...result }), { headers: corsHeaders });
    }
    
    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: corsHeaders });
  }
});
