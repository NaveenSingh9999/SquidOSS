import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, RefreshCw, FolderGit2, Server, Database, AlertCircle, CheckCircle2, XCircle } from '@/lib/icon-map';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Repository {
  id: string;
  repo_name: string;
  user_id: string;
  account_id: string | null;
  health_status: string;
  last_used: string;
  created_at: string;
}

interface ClusterInfo {
  totalNodes: number;
  totalRepos: number;
  nodes: Array<{ id: number; username: string }>;
}

const RepoManagerTab = () => {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [repoName, setRepoName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedNode, setSelectedNode] = useState<string>('random');
  const [isPrivate, setIsPrivate] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load cluster info
      const { data: clusterData, error: clusterError } = await supabase.functions.invoke('github-cluster', {
        body: { action: 'get-cluster-info' }
      });

      if (!clusterError && clusterData) {
        const parsedCluster = typeof clusterData === 'string' ? JSON.parse(clusterData) : clusterData;
        setClusterInfo(parsedCluster);
      }

      // Load repositories
      const { data: reposData, error: reposError } = await supabase
        .from('repositories')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (reposError) throw reposError;
      setRepos(reposData || []);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast.error('Failed to load repository data');
    } finally {
      setLoading(false);
    }
  };

  const createRepository = async () => {
    if (!repoName.trim()) {
      toast.error('Repository name is required');
      return;
    }

    // Validate repo name format
    if (!/^[a-zA-Z0-9_-]+$/.test(repoName)) {
      toast.error('Repository name can only contain letters, numbers, hyphens, and underscores');
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create repo via github-cluster
      const body: any = {
        action: 'create-repo',
        repoName: repoName.trim(),
        userId: user.id,
        description: description.trim() || undefined,
        private: isPrivate
      };

      // Add nodeId if specific node selected
      if (selectedNode !== 'random') {
        body.nodeId = parseInt(selectedNode);
      }

      const { data, error } = await supabase.functions.invoke('github-cluster', {
        body
      });

      if (error) throw error;

      const result = typeof data === 'string' ? JSON.parse(data) : data;

      if (!result.success) {
        throw new Error(result.error || 'Failed to create repository');
      }

      toast.success(`Repository "${repoName}" created successfully on Node ${result.nodeId}`);
      
      // Reset form
      setRepoName('');
      setDescription('');
      setSelectedNode('random');
      setDialogOpen(false);
      
      // Reload data
      await loadData();
    } catch (error: any) {
      console.error('Error creating repository:', error);
      toast.error(error.message || 'Failed to create repository');
    } finally {
      setCreating(false);
    }
  };

  const deleteRepository = async (repoId: string, repoName: string) => {
    if (!confirm(`Are you sure you want to delete repository "${repoName}"? This action cannot be undone.`)) {
      return;
    }

    setDeleting(repoId);
    try {
      const { error } = await supabase
        .from('repositories')
        .delete()
        .eq('id', repoId);

      if (error) throw error;

      toast.success(`Repository "${repoName}" deleted from database`);
      toast.info('Note: The GitHub repository still exists and must be deleted manually if needed');
      
      // Reload data
      await loadData();
    } catch (error: any) {
      console.error('Error deleting repository:', error);
      toast.error('Failed to delete repository');
    } finally {
      setDeleting(null);
    }
  };

  const getHealthBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Healthy</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500"><AlertCircle className="h-3 w-3 mr-1" />Warning</Badge>;
      case 'error':
        return <Badge className="bg-red-500"><XCircle className="h-3 w-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getNodeBadge = (accountId: string | null) => {
    if (!accountId) return <Badge variant="outline">N/A</Badge>;
    const nodeNum = parseInt(accountId);
    if (isNaN(nodeNum)) return <Badge variant="outline">N/A</Badge>;
    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500'];
    return <Badge className={colors[(nodeNum - 1) % 3]}>Node {nodeNum}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Cluster Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Nodes</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clusterInfo?.totalNodes || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active storage nodes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Repositories</CardTitle>
            <FolderGit2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{repos.length}</div>
            <p className="text-xs text-muted-foreground">
              Across all nodes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database Repos</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clusterInfo?.totalRepos || 0}</div>
            <p className="text-xs text-muted-foreground">
              Tracked in system
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Create Repository Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Repository Management</CardTitle>
              <CardDescription>Create and manage storage repositories across cluster nodes</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={loadData} variant="outline" size="sm" disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Repository
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Create New Repository</DialogTitle>
                    <DialogDescription>
                      Create a new storage repository on the cluster. The repository will be created on GitHub and tracked in the database.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="repoName">Repository Name *</Label>
                      <Input
                        id="repoName"
                        placeholder="my-storage-repo"
                        value={repoName}
                        onChange={(e) => setRepoName(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Only letters, numbers, hyphens, and underscores allowed
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="description">Description (Optional)</Label>
                      <Textarea
                        id="description"
                        placeholder="Secure storage repository for CloudBliss"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="node">Target Node</Label>
                      <Select value={selectedNode} onValueChange={setSelectedNode}>
                        <SelectTrigger id="node">
                          <SelectValue placeholder="Select node" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="random">Random (Load Balanced)</SelectItem>
                          {clusterInfo?.nodes.map((node) => (
                            <SelectItem key={node.id} value={node.id.toString()}>
                              Node {node.id} - {node.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Select a specific node or let the system choose randomly
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="private"
                        checked={isPrivate}
                        onChange={(e) => setIsPrivate(e.target.checked)}
                        className="rounded"
                      />
                      <Label htmlFor="private" className="text-sm font-normal cursor-pointer">
                        Private repository (recommended for security)
                      </Label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      disabled={creating}
                    >
                      Cancel
                    </Button>
                    <Button onClick={createRepository} disabled={creating}>
                      {creating ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Repository
                        </>
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : repos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderGit2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No repositories found</p>
              <p className="text-sm">Create your first repository to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Repository Name</TableHead>
                  <TableHead>Node</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repos.map((repo) => (
                  <TableRow key={repo.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FolderGit2 className="h-4 w-4 text-muted-foreground" />
                        {repo.repo_name}
                      </div>
                    </TableCell>
                    <TableCell>{getNodeBadge(repo.account_id)}</TableCell>
                    <TableCell>{getHealthBadge(repo.health_status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {repo.last_used ? new Date(repo.last_used).toLocaleDateString() : 'Never'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(repo.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteRepository(repo.id, repo.repo_name)}
                        disabled={deleting === repo.id}
                      >
                        {deleting === repo.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-red-500" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Node Distribution */}
      {clusterInfo && repos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Node Distribution</CardTitle>
            <CardDescription>Repository distribution across cluster nodes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {clusterInfo.nodes.map((node) => {
                const nodeRepos = repos.filter(r => r.account_id === node.id.toString());
                const percentage = repos.length > 0 ? ((nodeRepos.length / repos.length) * 100).toFixed(1) : '0';
                
                return (
                  <Card key={node.id}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">
                        Node {node.id} - {node.username}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{nodeRepos.length}</div>
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {percentage}% of total repositories
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RepoManagerTab;
