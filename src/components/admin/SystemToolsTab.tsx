import React, { useState, useEffect } from 'react';
import { Card as OriginalCard, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button as OriginalButton } from '@/components/ui/button';
import { Badge as OriginalBadge } from '@/components/ui/badge';
import { Input as OriginalInput } from '@/components/ui/input';
import { Button as SquidButton } from '@/components/ui/squidset/Button';
import { Badge as SquidBadge } from '@/components/ui/squidset/Badge';
import { Input as SquidInput } from '@/components/ui/squidset/Input';
import { Card as SquidCard } from '@/components/ui/squidset/Card';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Server, Database, RefreshCw, CheckCircle2, XCircle, AlertCircle, 
  HardDrive, Users, FileText, TrendingUp, Trash2, Search, 
  Download, Shield, Zap, Activity, BarChart3, Terminal, Key,
  GitBranch, FileCheck, Clock, Copy, Hash, Network
} from '@/lib/icon-map';

interface ClusterInfo {
  totalNodes: number;
  totalRepos: number;
  nodes: Array<{ id: number; username: string }>;
}

interface DatabaseStats {
  totalFiles: number;
  totalUsers: number;
  storageUsed: string;
  activeUploads: number;
}

const SystemToolsTab = () => {
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | null>(null);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [nodeHealth, setNodeHealth] = useState<Record<number, 'healthy' | 'error' | 'checking'>>({});
  
  // New state for additional tools
  const [searchUserId, setSearchUserId] = useState('');
  const [cleanupDays, setCleanupDays] = useState('30');
  const [processingTool, setProcessingTool] = useState<string | null>(null);
  
  // State for advanced tools
  const [duplicateResults, setDuplicateResults] = useState<any[]>([]);
  const [orphanedFiles, setOrphanedFiles] = useState<number>(0);
  const [repoBalanceData, setRepoBalanceData] = useState<any>(null);

  useEffect(() => {
    loadSystemData();
  }, []);

  const loadSystemData = async () => {
    setLoading(true);
    try {
      // Load cluster info
      const { data: clusterData, error: clusterError } = await supabase.functions.invoke('github-cluster', {
        body: { action: 'get-cluster-info' }
      });

      if (!clusterError && clusterData) {
        const parsed = typeof clusterData === 'string' ? JSON.parse(clusterData) : clusterData;
        setClusterInfo(parsed);
      }

      // Load database statistics
      const { count: fileCount } = await supabase
        .from('files')
        .select('*', { count: 'exact', head: true });

      const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      const { data: storageData } = await supabase
        .from('files')
        .select('size');

      const totalBytes = storageData?.reduce((sum, file) => sum + (file.size || 0), 0) || 0;
      const storageGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);

      setDbStats({
        totalFiles: fileCount || 0,
        totalUsers: userCount || 0,
        storageUsed: `${storageGB} GB`,
        activeUploads: 0
      });

    } catch (error: any) {
      console.error('Error loading system data:', error);
      toast.error('Failed to load system data');
    } finally {
      setLoading(false);
    }
  };

  const checkNodeHealth = async (nodeId: number) => {
    setNodeHealth(prev => ({ ...prev, [nodeId]: 'checking' }));
    
    try {
      const { data, error } = await supabase.functions.invoke('github-cluster', {
        body: { 
          action: 'get-credentials',
          nodeId 
        }
      });

      if (error) throw error;

      const result = typeof data === 'string' ? JSON.parse(data) : data;
      
      if (result.success && result.token) {
        setNodeHealth(prev => ({ ...prev, [nodeId]: 'healthy' }));
        toast.success(`Node ${nodeId} is healthy`);
      } else {
        setNodeHealth(prev => ({ ...prev, [nodeId]: 'error' }));
        toast.error(`Node ${nodeId} returned no credentials`);
      }
    } catch (error: any) {
      setNodeHealth(prev => ({ ...prev, [nodeId]: 'error' }));
      toast.error(`Node ${nodeId} health check failed`);
    }
  };

  const checkAllNodes = async () => {
    setChecking(true);
    if (clusterInfo?.nodes) {
      for (const node of clusterInfo.nodes) {
        await checkNodeHealth(node.id);
      }
    }
    setChecking(false);
  };

  const clearCache = () => {
    if (confirm('Clear browser cache and reload? This will refresh all cached data.')) {
      localStorage.clear();
      sessionStorage.clear();
      toast.success('Cache cleared');
      window.location.reload();
    }
  };

  const searchUserFiles = async () => {
    if (!searchUserId) {
      toast.error('Please enter user ID');
      return;
    }
    
    setProcessingTool('search');
    try {
      const { data: files, error } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', searchUserId);
      
      if (error) throw error;
      
      toast.success(`Found ${files?.length || 0} files for this user`);
      console.log('User files:', files);
    } catch (error: any) {
      console.error('Search error:', error);
      toast.error('Failed to search files');
    } finally {
      setProcessingTool(null);
    }
  };

  const cleanupOldFiles = async () => {
    const days = parseInt(cleanupDays);
    if (isNaN(days) || days < 1) {
      toast.error('Please enter a valid number of days');
      return;
    }
    
    if (!confirm(`Delete files older than ${days} days? This action cannot be undone.`)) {
      return;
    }
    
    setProcessingTool('cleanup');
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const { data: oldFiles, error: fetchError } = await supabase
        .from('files')
        .select('id')
        .lt('created_at', cutoffDate.toISOString());
      
      if (fetchError) throw fetchError;
      
      const count = oldFiles?.length || 0;
      
      if (count === 0) {
        toast.info('No files found matching the criteria');
        return;
      }
      
      const { error: deleteError } = await supabase
        .from('files')
        .delete()
        .lt('created_at', cutoffDate.toISOString());
      
      if (deleteError) throw deleteError;
      
      toast.success(`Cleaned up ${count} old files`);
      await loadSystemData();
    } catch (error: any) {
      console.error('Cleanup error:', error);
      toast.error('Failed to cleanup files');
    } finally {
      setProcessingTool(null);
    }
  };

  const generateStorageReport = async () => {
    setProcessingTool('report');
    try {
      // Get storage by user
      const { data: files } = await supabase
        .from('files')
        .select('user_id, size');
      
      if (!files) return;
      
      const userStorage = files.reduce((acc: Record<string, number>, file) => {
        acc[file.user_id] = (acc[file.user_id] || 0) + (file.size || 0);
        return acc;
      }, {});
      
      const topUsers = Object.entries(userStorage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([userId, bytes]) => ({
          userId,
          storage: (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
        }));
      
      console.log('Top 10 users by storage:', topUsers);
      toast.success('Storage report generated (check console)');
    } catch (error: any) {
      console.error('Report error:', error);
      toast.error('Failed to generate report');
    } finally {
      setProcessingTool(null);
    }
  };

  const testApiEndpoints = async () => {
    setProcessingTool('api-test');
    try {
      const results = [];
      
      // Test cluster endpoint
      const clusterTest = await supabase.functions.invoke('github-cluster', {
        body: { action: 'get-cluster-info' }
      });
      results.push({
        name: 'github-cluster',
        status: clusterTest.error ? 'Error' : 'OK'
      });
      
      // Test storage endpoint
      const storageTest = await supabase.functions.invoke('github-storage', {
        body: { action: 'test' }
      });
      results.push({
        name: 'github-storage',
        status: storageTest.error ? 'Error' : 'OK'
      });
      
      console.log('API Test Results:', results);
      const allOk = results.every(r => r.status === 'OK');
      
      if (allOk) {
        toast.success('All API endpoints are healthy');
      } else {
        toast.warning('Some API endpoints have issues (check console)');
      }
    } catch (error: any) {
      console.error('API test error:', error);
      toast.error('Failed to test API endpoints');
    } finally {
      setProcessingTool(null);
    }
  };

  const optimizeDatabase = async () => {
    if (!confirm('Run database optimization? This may take a few moments.')) {
      return;
    }
    
    setProcessingTool('optimize');
    try {
      // Update repository health status
      const { error: updateError } = await supabase
        .from('repositories')
        .update({ last_health_check: new Date().toISOString() })
        .is('last_health_check', null);
      
      if (updateError) throw updateError;
      
      toast.success('Database optimization complete');
      await loadSystemData();
    } catch (error: any) {
      console.error('Optimization error:', error);
      toast.error('Failed to optimize database');
    } finally {
      setProcessingTool(null);
    }
  };

  const exportSystemLogs = async () => {
    setProcessingTool('export');
    try {
      const logs = {
        timestamp: new Date().toISOString(),
        clusterInfo,
        dbStats,
        nodeHealth,
        systemInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language
        }
      };
      
      const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `system-logs-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('System logs exported');
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error('Failed to export logs');
    } finally {
      setProcessingTool(null);
    }
  };

  // ADVANCED TOOL 1: Duplicate File Detector (by name and size)
  // Finds files with identical name and size (likely duplicates)
  const findDuplicateFiles = async () => {
    setProcessingTool('duplicates');
    setDuplicateResults([]);
    
    try {
      // Get all non-deleted files
      const { data: allFiles, error } = await supabase
        .from('files')
        .select('id, name, size, type, user_id, created_at, storage_path')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      if (!allFiles || allFiles.length === 0) {
        toast.info('No files found in database');
        return;
      }

      // Group files by name + size combination (likely duplicates)
      const fileGroups: Record<string, any[]> = {};
      let totalDuplicates = 0;
      let wastedSpace = 0;

      allFiles.forEach(file => {
        const key = `${file.name}__${file.size}`;
        if (!fileGroups[key]) {
          fileGroups[key] = [];
        }
        fileGroups[key].push(file);
      });

      // Find groups with more than 1 file (duplicates)
      const duplicateGroups = Object.entries(fileGroups)
        .filter(([_, files]) => files.length > 1)
        .map(([key, files]) => {
          const sortedFiles = files.sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          const originalFile = sortedFiles[0];
          const duplicates = sortedFiles.slice(1);
          
          // Calculate wasted space (all duplicates except the original)
          const duplicateSpace = duplicates.reduce((sum, f) => sum + (f.size || 0), 0);
          wastedSpace += duplicateSpace;
          totalDuplicates += duplicates.length;

          return {
            name: originalFile.name,
            size: (originalFile.size / (1024 * 1024)).toFixed(2) + ' MB',
            type: originalFile.type,
            originalFile: {
              id: originalFile.id,
              created: new Date(originalFile.created_at).toLocaleDateString(),
              userId: originalFile.user_id
            },
            duplicateCount: duplicates.length,
            duplicateFiles: duplicates.map(f => ({
              id: f.id,
              userId: f.user_id,
              created: new Date(f.created_at).toLocaleDateString()
            })),
            wastedSpace: (duplicateSpace / (1024 * 1024)).toFixed(2) + ' MB'
          };
        })
        .sort((a, b) => b.duplicateCount - a.duplicateCount);

      setDuplicateResults(duplicateGroups);

      const totalWastedGB = (wastedSpace / (1024 * 1024 * 1024)).toFixed(2);
      
      toast.success(
        `Found ${duplicateGroups.length} duplicate groups (${totalDuplicates} files)\n` +
        `Wasted storage: ${totalWastedGB} GB`,
        { duration: 5000 }
      );

      console.log('Duplicate Detection Report:', {
        totalGroups: duplicateGroups.length,
        totalDuplicateFiles: totalDuplicates,
        wastedStorage: totalWastedGB + ' GB',
        details: duplicateGroups
      });

    } catch (error: any) {
      console.error('Duplicate detection error:', error);
      toast.error('Failed to detect duplicates');
    } finally {
      setProcessingTool(null);
    }
  };  // ADVANCED TOOL 2: Large Files Analyzer
  // Finds and analyzes the largest files in the system
  const findOrphanedFiles = async () => {
    setProcessingTool('orphaned');
    setOrphanedFiles(0);
    
    try {
      // Get all files sorted by size (largest first)
      const { data: largeFiles, error } = await supabase
        .from('files')
        .select('id, name, size, type, user_id, created_at, storage_path')
        .eq('is_deleted', false)
        .order('size', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      if (!largeFiles || largeFiles.length === 0) {
        toast.info('No files found in database');
        return;
      }

      // Analyze file types
      const typeStats: Record<string, { count: number; totalSize: number }> = {};
      let totalSize = 0;

      largeFiles.forEach(file => {
        totalSize += file.size || 0;
        const fileType = file.type || 'unknown';
        
        if (!typeStats[fileType]) {
          typeStats[fileType] = { count: 0, totalSize: 0 };
        }
        typeStats[fileType].count++;
        typeStats[fileType].totalSize += file.size || 0;
      });

      const top10Files = largeFiles.slice(0, 10).map(f => ({
        name: f.name,
        size: (f.size / (1024 * 1024)).toFixed(2) + ' MB',
        type: f.type,
        created: new Date(f.created_at).toLocaleDateString(),
        userId: f.user_id
      }));

      const typeBreakdown = Object.entries(typeStats)
        .map(([type, stats]) => ({
          type,
          count: stats.count,
          totalSize: (stats.totalSize / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
          avgSize: (stats.totalSize / stats.count / (1024 * 1024)).toFixed(2) + ' MB'
        }))
        .sort((a, b) => parseFloat(b.totalSize) - parseFloat(a.totalSize));

      setOrphanedFiles(largeFiles.length);

      toast.success(
        `Analyzed ${largeFiles.length} files\n` +
        `Total size: ${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`,
        { duration: 5000 }
      );

      console.log('Large Files Analysis Report:', {
        totalFiles: largeFiles.length,
        totalSizeGB: (totalSize / (1024 * 1024 * 1024)).toFixed(2),
        top10LargestFiles: top10Files,
        fileTypeBreakdown: typeBreakdown
      });

    } catch (error: any) {
      console.error('Large files analysis error:', error);
      toast.error('Failed to analyze files');
    } finally {
      setProcessingTool(null);
    }
  };

  // ADVANCED TOOL 3: User Storage Analytics
  // Analyzes storage usage per user and identifies top consumers
  const analyzeRepoBalance = async () => {
    setProcessingTool('balance');
    setRepoBalanceData(null);
    
    try {
      // Get all non-deleted files
      const { data: files, error: filesError } = await supabase
        .from('files')
        .select('user_id, size, type, created_at')
        .eq('is_deleted', false);
      
      if (filesError) throw filesError;
      if (!files || files.length === 0) {
        toast.info('No files found');
        return;
      }

      // Calculate statistics per user
      const userStats: Record<string, any> = {};
      
      files.forEach(file => {
        const userId = file.user_id;
        
        if (!userStats[userId]) {
          userStats[userId] = {
            userId,
            fileCount: 0,
            totalSize: 0,
            fileTypes: new Set(),
            firstUpload: file.created_at,
            lastUpload: file.created_at
          };
        }
        
        userStats[userId].fileCount++;
        userStats[userId].totalSize += file.size || 0;
        userStats[userId].fileTypes.add(file.type || 'unknown');
        
        if (new Date(file.created_at) < new Date(userStats[userId].firstUpload)) {
          userStats[userId].firstUpload = file.created_at;
        }
        if (new Date(file.created_at) > new Date(userStats[userId].lastUpload)) {
          userStats[userId].lastUpload = file.created_at;
        }
      });

      // Calculate metrics
      const users = Object.values(userStats);
      const totalFiles = files.length;
      const totalStorage = files.reduce((sum, f) => sum + (f.size || 0), 0);
      const avgFilesPerUser = totalFiles / users.length;
      const avgStoragePerUser = totalStorage / users.length;
      
      const userReport = users
        .map((user: any) => {
          const sizeGB = (user.totalSize / (1024 * 1024 * 1024)).toFixed(2);
          const deviation = ((user.fileCount - avgFilesPerUser) / avgFilesPerUser * 100).toFixed(1);
          const storagePercent = ((user.totalSize / totalStorage) * 100).toFixed(1);
          
          return {
            userId: user.userId.substring(0, 8) + '...',
            fullUserId: user.userId,
            fileCount: user.fileCount,
            totalSizeGB: sizeGB,
            storagePercent: storagePercent + '%',
            fileTypes: user.fileTypes.size,
            deviation: deviation + '%',
            status: Math.abs(parseFloat(deviation)) < 50 ? 'Normal' : 
                    parseFloat(deviation) > 0 ? 'Heavy User' : 'Light User',
            accountAge: Math.floor(
              (new Date().getTime() - new Date(user.firstUpload).getTime()) / (1000 * 60 * 60 * 24)
            ) + ' days'
          };
        })
        .sort((a, b) => parseFloat(b.totalSizeGB) - parseFloat(a.totalSizeGB));

      setRepoBalanceData(userReport.slice(0, 10)); // Top 10 users

      const heavyUsers = userReport.filter((u: any) => u.status === 'Heavy User').length;
      
      toast.success(
        `Analyzed ${users.length} users with ${totalFiles} files\n` +
        `Total storage: ${(totalStorage / (1024 * 1024 * 1024)).toFixed(2)} GB`,
        { duration: 5000 }
      );

      console.log('User Storage Analytics Report:', {
        summary: {
          totalUsers: users.length,
          totalFiles,
          totalStorageGB: (totalStorage / (1024 * 1024 * 1024)).toFixed(2),
          avgFilesPerUser: avgFilesPerUser.toFixed(0),
          avgStoragePerUserGB: (avgStoragePerUser / (1024 * 1024 * 1024)).toFixed(2),
          heavyUsers
        },
        top10Users: userReport.slice(0, 10),
        allUsers: userReport
      });

    } catch (error: any) {
      console.error('User analytics error:', error);
      toast.error('Failed to analyze user storage');
    } finally {
      setProcessingTool(null);
    }
  };

  const getHealthBadge = (status: 'healthy' | 'error' | 'checking' | undefined) => {
    switch (status) {
      case 'healthy':
        return <OriginalBadge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Healthy</OriginalBadge>;
      case 'error':
        return <OriginalBadge className="bg-red-500"><XCircle className="h-3 w-3 mr-1" />Error</OriginalBadge>;
      case 'checking':
        return <OriginalBadge className="bg-yellow-500"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Checking</OriginalBadge>;
      default:
        return <OriginalBadge variant="outline"><AlertCircle className="h-3 w-3 mr-1" />Unknown</OriginalBadge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* System Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <OriginalCard>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cluster Nodes</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clusterInfo?.totalNodes || 0}</div>
            <p className="text-xs text-muted-foreground">Active storage nodes</p>
          </CardContent>
        </OriginalCard>

        <OriginalCard>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Files</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dbStats?.totalFiles || 0}</div>
            <p className="text-xs text-muted-foreground">Stored in system</p>
          </CardContent>
        </OriginalCard>

        <OriginalCard>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dbStats?.storageUsed || '0 GB'}</div>
            <p className="text-xs text-muted-foreground">Across all repos</p>
          </CardContent>
        </OriginalCard>

        <OriginalCard>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dbStats?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">Registered accounts</p>
          </CardContent>
        </OriginalCard>
      </div>

      {/* Cluster Health */}
      <OriginalCard>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Cluster Health Status</CardTitle>
              <CardDescription>Monitor GitHub node connectivity and health</CardDescription>
            </div>
            <div className="flex gap-2">
              <OriginalButton onClick={loadSystemData} variant="outline" size="sm" disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </OriginalButton>
              <OriginalButton onClick={checkAllNodes} size="sm" disabled={checking}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Check All Nodes
              </OriginalButton>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {clusterInfo?.nodes.map((node) => (
              <OriginalCard key={node.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      Node {node.id}
                    </CardTitle>
                    {getHealthBadge(nodeHealth[node.id])}
                  </div>
                  <CardDescription className="text-xs">{node.username}</CardDescription>
                </CardHeader>
                <CardContent>
                  <OriginalButton 
                    onClick={() => checkNodeHealth(node.id)} 
                    variant="outline" 
                    size="sm"
                    disabled={nodeHealth[node.id] === 'checking'}
                    className="w-full"
                  >
                    {nodeHealth[node.id] === 'checking' ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Test Connection
                      </>
                    )}
                  </OriginalButton>
                </CardContent>
              </OriginalCard>
            ))}
          </div>
        </CardContent>
      </OriginalCard>

      {/* Database Statistics */}
      <OriginalCard>
        <CardHeader>
          <CardTitle>Database Statistics</CardTitle>
          <CardDescription>Real-time database metrics and performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Database className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">Total Repositories</p>
                  <p className="text-2xl font-bold">{clusterInfo?.totalRepos || 0}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm font-medium">System Performance</p>
                  <p className="text-lg font-bold text-green-600">Optimal</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </OriginalCard>

      {/* System Tools */}
      <SquidCard padding="lg">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-squid-gray-900">System Utilities</h2>
          <p className="text-sm text-squid-gray-500 mt-1">Maintenance and diagnostic tools</p>
        </div>
        
        <div className="grid gap-4 md:grid-cols-3">
          <SquidButton 
            onClick={clearCache} 
            variant="secondary" 
            className="h-24 flex-col gap-3"
          >
            <RefreshCw className="h-6 w-6" />
            <span>Clear Cache & Reload</span>
          </SquidButton>

          <SquidButton 
            onClick={loadSystemData} 
            variant="secondary" 
            className="h-24 flex-col gap-3"
          >
            <Database className="h-6 w-6" />
            <span>Refresh Database Stats</span>
          </SquidButton>

          <SquidButton 
            onClick={testApiEndpoints} 
            variant="secondary" 
            className="h-24 flex-col gap-3"
            disabled={processingTool === 'api-test'}
          >
            {processingTool === 'api-test' ? (
              <RefreshCw className="h-6 w-6 animate-spin" />
            ) : (
              <Activity className="h-6 w-6" />
            )}
            <span>Test API Endpoints</span>
          </SquidButton>

          <SquidButton 
            onClick={generateStorageReport} 
            variant="secondary" 
            className="h-24 flex-col gap-3"
            disabled={processingTool === 'report'}
          >
            {processingTool === 'report' ? (
              <RefreshCw className="h-6 w-6 animate-spin" />
            ) : (
              <BarChart3 className="h-6 w-6" />
            )}
            <span>Generate Storage Report</span>
          </SquidButton>

          <SquidButton 
            onClick={optimizeDatabase} 
            variant="secondary" 
            className="h-24 flex-col gap-3"
            disabled={processingTool === 'optimize'}
          >
            {processingTool === 'optimize' ? (
              <RefreshCw className="h-6 w-6 animate-spin" />
            ) : (
              <Zap className="h-6 w-6" />
            )}
            <span>Optimize Database</span>
          </SquidButton>

          <SquidButton 
            onClick={exportSystemLogs} 
            variant="secondary" 
            className="h-24 flex-col gap-3"
            disabled={processingTool === 'export'}
          >
            {processingTool === 'export' ? (
              <RefreshCw className="h-6 w-6 animate-spin" />
            ) : (
              <Download className="h-6 w-6" />
            )}
            <span>Export System Logs</span>
          </SquidButton>
        </div>
      </SquidCard>

      {/* Advanced Tools */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* User File Search */}
        <OriginalCard>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search User Files
            </CardTitle>
            <CardDescription>Find files by user ID</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="userId">User ID (UUID)</Label>
              <OriginalInput
                id="userId"
                placeholder="Enter user UUID"
                value={searchUserId}
                onChange={(e) => setSearchUserId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Results will be displayed in browser console
              </p>
            </div>
            <OriginalButton 
              onClick={searchUserFiles} 
              className="w-full"
              disabled={processingTool === 'search'}
            >
              {processingTool === 'search' ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search Files
                </>
              )}
            </OriginalButton>
          </CardContent>
        </OriginalCard>

        {/* Cleanup Tool */}
        <OriginalCard>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Cleanup Old Files
            </CardTitle>
            <CardDescription>Remove files older than specified days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cleanupDays">Delete files older than (days)</Label>
              <OriginalInput
                id="cleanupDays"
                type="number"
                min="1"
                placeholder="30"
                value={cleanupDays}
                onChange={(e) => setCleanupDays(e.target.value)}
              />
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <p className="text-xs text-yellow-800">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                Warning: This action cannot be undone. Files will be permanently deleted.
              </p>
            </div>
            <OriginalButton 
              onClick={cleanupOldFiles} 
              variant="destructive" 
              className="w-full"
              disabled={processingTool === 'cleanup'}
            >
              {processingTool === 'cleanup' ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Cleaning...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Cleanup Files
                </>
              )}
            </OriginalButton>
          </CardContent>
        </OriginalCard>
      </div>

      {/* Advanced Analysis Tools */}
      <OriginalCard className="border-2 border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Shield className="h-5 w-5" />
            Advanced Analysis Tools
          </CardTitle>
          <CardDescription>Powerful diagnostic and optimization tools</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            
            {/* Tool 1: Duplicate Detector */}
            <OriginalCard className="border-purple-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Hash className="h-4 w-4 text-purple-600" />
                  Duplicate Finder
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Identifies files with identical name and size. 
                  Calculates wasted storage from duplicates.
                </p>
                {duplicateResults.length > 0 && (
                  <div className="bg-purple-50 border border-purple-200 rounded p-2 text-xs">
                    <p className="font-semibold text-purple-900">
                      Found: {duplicateResults.length} duplicate groups
                    </p>
                    <p className="text-purple-700">
                      Total duplicates: {duplicateResults.reduce((sum, g) => sum + g.duplicateCount, 0)}
                    </p>
                  </div>
                )}
                <OriginalButton 
                  onClick={findDuplicateFiles}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  size="sm"
                  disabled={processingTool === 'duplicates'}
                >
                  {processingTool === 'duplicates' ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <FileCheck className="h-4 w-4 mr-2" />
                      Find Duplicates
                    </>
                  )}
                </OriginalButton>
              </CardContent>
            </OriginalCard>

            {/* Tool 2: Large Files Analyzer */}
            <OriginalCard className="border-orange-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-orange-600" />
                  Large Files Analyzer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Analyzes the largest files in the system by size and type. 
                  Helps identify storage optimization opportunities.
                </p>
                {orphanedFiles > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded p-2 text-xs">
                    <p className="font-semibold text-orange-900">
                      📊 Analyzed: {orphanedFiles} large files
                    </p>
                    <p className="text-orange-700">
                      See console for breakdown
                    </p>
                  </div>
                )}
                <OriginalButton 
                  onClick={findOrphanedFiles}
                  className="w-full bg-orange-600 hover:bg-orange-700"
                  size="sm"
                  disabled={processingTool === 'orphaned'}
                >
                  {processingTool === 'orphaned' ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Analyze Files
                    </>
                  )}
                </OriginalButton>
              </CardContent>
            </OriginalCard>

            {/* Tool 3: User Storage Analytics */}
            <OriginalCard className="border-green-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Network className="h-4 w-4 text-green-600" />
                  User Analytics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Analyzes storage usage per user. Identifies top consumers 
                  and usage patterns across the platform.
                </p>
                {repoBalanceData && (
                  <div className="bg-green-50 border border-green-200 rounded p-2 text-xs">
                    <p className="font-semibold text-green-900">
                      👥 Top {repoBalanceData.length} users analyzed
                    </p>
                    <p className="text-green-700">
                      {repoBalanceData.filter((u: any) => u.status === 'Heavy User').length} heavy users found
                    </p>
                  </div>
                )}
                <OriginalButton 
                  onClick={analyzeRepoBalance}
                  className="w-full bg-green-600 hover:bg-green-700"
                  size="sm"
                  disabled={processingTool === 'balance'}
                >
                  {processingTool === 'balance' ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Activity className="h-4 w-4 mr-2" />
                      Analyze Users
                    </>
                  )}
                </OriginalButton>
              </CardContent>
            </OriginalCard>

          </div>

          {/* Results Display */}
          {duplicateResults.length > 0 && (
            <div className="mt-4 p-4 bg-white border border-purple-200 rounded-lg">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Copy className="h-4 w-4 text-purple-600" />
                Duplicate Files Report (Top 5)
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {duplicateResults.slice(0, 5).map((group, idx) => (
                  <div key={idx} className="text-xs p-2 bg-purple-50 rounded border border-purple-100">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-purple-900">{group.name}</span>
                      <OriginalBadge className="bg-purple-600 text-xs">{group.duplicateCount} copies</OriginalBadge>
                    </div>
                    <p className="text-muted-foreground">
                      Size: {group.size} | Type: {group.type}
                    </p>
                    <p className="text-red-600 font-semibold">Wasted: {group.wastedSpace}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                See console for complete report with all {duplicateResults.length} groups
              </p>
            </div>
          )}

          {repoBalanceData && (
            <div className="mt-4 p-4 bg-white border border-green-200 rounded-lg">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-green-600" />
                User Storage Overview (Top 10)
              </h4>
              <div className="grid gap-2 md:grid-cols-2">
                {repoBalanceData.map((user: any, idx: number) => (
                  <div key={idx} className="p-2 bg-green-50 rounded border border-green-100">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-mono">{user.userId}</span>
                      <OriginalBadge className={
                        user.status === 'Normal' ? 'bg-green-600' :
                        user.status === 'Heavy User' ? 'bg-red-600' : 'bg-yellow-600'
                      }>
                        {user.status}
                      </OriginalBadge>
                    </div>
                    <div className="text-xs space-y-1">
                      <p>Files: {user.fileCount} | Storage: {user.totalSizeGB} GB ({user.storagePercent})</p>
                      <p>File Types: {user.fileTypes} | Account Age: {user.accountAge}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                See console for complete user analytics report
              </p>
            </div>
          )}
        </CardContent>
      </OriginalCard>

      {/* Quick Actions */}
      <OriginalCard>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Quick Actions
          </CardTitle>
          <CardDescription>Common administrative tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <OriginalButton variant="outline" size="sm" onClick={() => window.open('/api/health', '_blank')}>
              <Shield className="h-4 w-4 mr-2" />
              API Health
            </OriginalButton>
            <OriginalButton variant="outline" size="sm" onClick={checkAllNodes}>
              <Server className="h-4 w-4 mr-2" />
              Check Nodes
            </OriginalButton>
            <OriginalButton variant="outline" size="sm" onClick={() => console.log({ clusterInfo, dbStats })}>
              <Key className="h-4 w-4 mr-2" />
              View Config
            </OriginalButton>
            <OriginalButton variant="outline" size="sm" onClick={() => toast.info('Feature coming soon!')}>
              <FileText className="h-4 w-4 mr-2" />
              View Logs
            </OriginalButton>
          </div>
        </CardContent>
      </OriginalCard>
    </div>
  );
};

export default SystemToolsTab;
