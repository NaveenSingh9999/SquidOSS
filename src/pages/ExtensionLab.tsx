import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Package, 
  Download, 
  Star, 
  Search, 
  Plus,
  Sparkles,
  Code,
  Zap
} from '@/lib/icon-map';
import { useToast } from '@/hooks/use-toast';

interface Extension {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  downloads: number;
  rating: number;
  total_ratings: number;
  category: string;
  icon_url?: string;
  is_verified: boolean;
}

export default function ExtensionLab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [installedExtensions, setInstalledExtensions] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExtensions();
    loadInstalledExtensions();
  }, []);

  const loadExtensions = async () => {
    try {
      const { data, error } = await supabase
        .from('extensions')
        .select('*')
        .eq('approval', 'approved')
        .eq('is_active', true)
        .order('downloads', { ascending: false });

      if (error) throw error;
      setExtensions(data || []);
    } catch (error) {
      console.error('Error loading extensions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load extensions',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadInstalledExtensions = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('installed_extensions')
        .select('extension_id')
        .eq('user_id', user.id);

      if (error) throw error;
      setInstalledExtensions(data?.map(e => e.extension_id) || []);
    } catch (error) {
      console.error('Error loading installed extensions:', error);
    }
  };

  const installExtension = async (extensionId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('installed_extensions')
        .insert({
          user_id: user.id,
          extension_id: extensionId,
          is_enabled: true
        });

      if (error) throw error;

      setInstalledExtensions([...installedExtensions, extensionId]);
      
      toast({
        title: 'Extension Installed',
        description: 'Extension has been successfully installed'
      });

      await loadExtensions();
    } catch (error) {
      console.error('Error installing extension:', error);
      toast({
        title: 'Installation Failed',
        description: 'Failed to install extension',
        variant: 'destructive'
      });
    }
  };

  const uninstallExtension = async (extensionId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('installed_extensions')
        .delete()
        .eq('user_id', user.id)
        .eq('extension_id', extensionId);

      if (error) throw error;

      setInstalledExtensions(installedExtensions.filter(id => id !== extensionId));
      
      toast({
        title: 'Extension Uninstalled',
        description: 'Extension has been removed'
      });
    } catch (error) {
      console.error('Error uninstalling extension:', error);
      toast({
        title: 'Uninstall Failed',
        description: 'Failed to uninstall extension',
        variant: 'destructive'
      });
    }
  };

  const filteredExtensions = extensions.filter(ext =>
    ext.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ext.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = ['all', ...new Set(extensions.map(e => e.category))];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Extension Lab</h1>
              <p className="text-slate-400">Extend SquidCloud with powerful extensions</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search extensions..."
              className="pl-10 bg-slate-800/50 border-slate-700 text-white"
            />
          </div>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="bg-slate-800/50 border-slate-700">
            {categories.map(cat => (
              <TabsTrigger key={cat} value={cat} className="capitalize">
                {cat}
              </TabsTrigger>
            ))}
          </TabsList>

          {categories.map(category => (
            <TabsContent key={category} value={category} className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredExtensions
                  .filter(ext => category === 'all' || ext.category === category)
                  .map(extension => {
                    const isInstalled = installedExtensions.includes(extension.id);
                    
                    return (
                      <Card key={extension.id} className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-all">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              {extension.icon_url ? (
                                <img src={extension.icon_url} alt={extension.name} className="w-10 h-10 rounded-lg" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                  <Code className="w-5 h-5 text-white" />
                                </div>
                              )}
                              <div>
                                <CardTitle className="text-white flex items-center gap-2">
                                  {extension.name}
                                  {extension.is_verified && (
                                    <Sparkles className="w-4 h-4 text-blue-400" />
                                  )}
                                </CardTitle>
                                <p className="text-xs text-slate-400">by {extension.author}</p>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              v{extension.version}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <CardDescription className="text-slate-400 mb-4">
                            {extension.description}
                          </CardDescription>
                          
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Download className="w-3 h-3" />
                                {extension.downloads}
                              </span>
                              <span className="flex items-center gap-1">
                                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                {extension.rating.toFixed(1)} ({extension.total_ratings})
                              </span>
                            </div>
                            <Badge className="text-xs capitalize">{extension.category}</Badge>
                          </div>

                          {isInstalled ? (
                            <Button 
                              onClick={() => uninstallExtension(extension.id)}
                              variant="destructive" 
                              size="sm" 
                              className="w-full"
                            >
                              Uninstall
                            </Button>
                          ) : (
                            <Button 
                              onClick={() => installExtension(extension.id)}
                              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                              size="sm"
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Install
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}