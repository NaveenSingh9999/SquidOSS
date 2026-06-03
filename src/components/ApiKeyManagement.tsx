
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Key, Copy, Trash2, Plus, Eye, EyeOff, CheckCircle2, AlertCircle } from '@/lib/icon-map';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at?: string;
  scopes: string[];
  is_active: boolean;
}

interface ApiKeyUsage {
  total_requests: number;
  storage_used: number;
  bandwidth_used: number;
}

const ApiKeyManagement = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<ApiKeyUsage>({ total_requests: 0, storage_used: 0, bandwidth_used: 0 });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [showGeneratedKey, setShowGeneratedKey] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchApiKeys = async () => {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiKeys(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch API keys",
        variant: "destructive",
      });
    }
  };

  const fetchUsage = async () => {
    try {
      const { data, error } = await supabase
        .from('api_request_logs')
        .select('*')
        .eq('user_id', user?.id);

      if (error) throw error;

      const totalRequests = data?.length || 0;
      const totalFileSize = data?.reduce((acc, log) => acc + (log.file_size || 0), 0) || 0;
      
      // Get storage used from profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('storage_used')
        .eq('id', user?.id)
        .single();

      setUsage({
        total_requests: totalRequests,
        storage_used: profileData?.storage_used || 0,
        bandwidth_used: totalFileSize
      });
    } catch (error: any) {
      console.error('Error fetching usage:', error);
    }
  };

  useEffect(() => {
    if (user) {
      Promise.all([fetchApiKeys(), fetchUsage()]).finally(() => setLoading(false));
    }
  }, [user]);

  const createApiKey = async () => {
    if (!newKeyName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name for your API key",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('api-key-management', {
        body: {
          action: 'generate',
          name: newKeyName,
          scopes: ['read', 'write', 'delete']
        }
      });

      if (error) throw error;

      setGeneratedKey(data.apiKey);
      setShowGeneratedKey(true);
      setNewKeyName('');
      await fetchApiKeys();
      
      toast({
        title: "Success",
        description: "API key generated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate API key",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const deleteApiKey = async (id: string) => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchApiKeys();
      toast({
        title: "Success",
        description: "API key deleted successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete API key",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "API key copied to clipboard",
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return <div className="flex items-center justify-center h-20 text-[12px] text-muted-foreground/50">Loading...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Usage Statistics */}
      <div className="rounded-2xl border border-border/50 bg-card/80 p-3 space-y-2">
        <p className="text-[13px] font-medium">API Usage This Month</p>
        <div className="h-px bg-border/40" />
        <div className="space-y-1">
          {[
            { label: 'API Calls', value: usage.total_requests.toLocaleString() },
            { label: 'Storage Used', value: formatBytes(usage.storage_used) },
            { label: 'Bandwidth', value: formatBytes(usage.bandwidth_used) },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between h-7 px-2 rounded hover:bg-accent/30 transition-colors">
              <span className="text-[12px] text-muted-foreground/70">{item.label}</span>
              <span className="text-[12px] font-medium tabular-nums">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* API Keys Management */}
      <div className="rounded-2xl border border-border/50 bg-card/80 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-muted-foreground/70" />
            <span className="text-[13px] font-medium">API Keys</span>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <button className="inline-flex items-center gap-1 h-7 rounded px-2 text-[11px] font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors">
                <Plus className="w-3 h-3" />
                Generate Key
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-sm font-medium">Generate New API Key</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground/70">Key Name</Label>
                  <Input className="h-8 mt-1 text-xs" id="keyName" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g., Production API, Mobile App" />
                </div>
                <button onClick={createApiKey} disabled={creating || !newKeyName.trim()}
                  className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50">
                  {creating ? 'Generating...' : 'Generate API Key'}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="h-px bg-border/40" />
        {apiKeys.length === 0 ? (
          <p className="text-[12px] text-muted-foreground/50 text-center py-4">No API keys found. Generate your first API key to get started.</p>
        ) : (
          <div className="space-y-1">
            {apiKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between rounded-lg px-2.5 h-10 hover:bg-accent/30 transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium truncate">{key.name}</span>
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", key.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-muted/30 text-muted-foreground/50")}>
                      {key.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                    <code className="font-mono">{key.key_prefix}••••••••••••••••••</code>
                    <span>Created: {new Date(key.created_at).toLocaleDateString()}</span>
                    {key.last_used_at && <span>Last used: {new Date(key.last_used_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <button onClick={() => deleteApiKey(key.id)}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generated Key Dialog */}
      <Dialog open={showGeneratedKey} onOpenChange={setShowGeneratedKey}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-medium">
              <Key className="w-4 h-4" />
              API Key Generated
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-2.5 h-9">
              <code className="text-[11px] font-mono text-muted-foreground/80 truncate">{generatedKey}</code>
              <button onClick={() => copyToClipboard(generatedKey)}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-accent/50 transition-colors flex-shrink-0">
                <Copy className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-amber-400/70">This is the only time you'll see this key. Copy it now and store it securely.</p>
            </div>
            <button onClick={() => setShowGeneratedKey(false)}
              className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors">
              I've saved my API key
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApiKeyManagement;
