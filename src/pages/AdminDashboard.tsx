import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  Users,
  FileText,
  Shield,
  LogOut,
  MessageSquare,
  Settings,
  FolderGit2,
  AlertTriangle,
  Database,
  Sparkles,
  Activity,
  ShieldAlert,
} from '@/lib/icon-map';
import { toast } from 'sonner';
import AnalyticsTab from '@/components/admin/AnalyticsTab';
import LogsTab from '@/components/admin/LogsTab';
import UsersTab from '@/components/admin/UsersTab';
import SupportTab from '@/components/admin/SupportTab';
import SystemToolsTab from '@/components/admin/SystemToolsTab';
import RepoManagerTab from '@/components/admin/RepoManagerTab';
import MaintenanceModeTab from '@/components/admin/MaintenanceModeTab';
import EnterpriseSupabaseControlTab from '@/components/admin/EnterpriseSupabaseControlTab';
import KZADashboardTab from '@/components/admin/KZADashboardTab';

const AdminDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    checkAuthorization();
  }, [user]);

  const checkAuthorization = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }

    try {
      // Check if user is admin
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (error || !profile?.is_admin) {
        toast.error('Unauthorized access attempt');
        navigate('/');
        return;
      }

      // Check for localStorage session marker first (immediate after auth)
      const sessionVerified = localStorage.getItem('admin_session_verified');
      if (sessionVerified) {
        const verificationTime = parseInt(sessionVerified);
        const now = Date.now();
        const timeDiff = now - verificationTime;
        
        // If verified within last 5 minutes, allow access
        if (timeDiff < 5 * 60 * 1000) {
          setIsAuthorized(true);
          setLoading(false);
          return;
        }
      }

      // Check if user has completed auth flow recently (within last 2 hours)
      const { data: recentLog, error: logError } = await supabase
        .from('admin_access_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('step_completed', 4)
        .gte('access_timestamp', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .order('access_timestamp', { ascending: false })
        .limit(1);

      if (logError || !recentLog || recentLog.length === 0) {
        // Clear any stale session markers
        localStorage.removeItem('admin_session_verified');
        toast.error('Authentication required');
        navigate('/ad/u1/get_ad/auth');
        return;
      }

      setIsAuthorized(true);
    } catch (error) {
      console.error('Authorization check failed:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    // Clear session marker
    localStorage.removeItem('admin_session_verified');
    await signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
          <p>Verifying authorization...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/15">
      {/* Header */}
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center space-x-3">
              <div className="rounded-2xl border border-primary/25 bg-primary/10 p-2.5 text-primary">
                <Shield className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  SquidCloud Enterprise Admin
                </h1>
                <p className="text-sm text-muted-foreground">
                  Supabase-first control plane with global platform visibility • {user?.email}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                <Activity className="mr-1.5 h-3.5 w-3.5" />
                Privileged Session
              </Badge>
              <Badge className="border border-primary/20 bg-primary/10 text-primary">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Enterprise Mode
              </Badge>
              <Button onClick={handleLogout} variant="outline" size="sm" className="rounded-xl">
                <LogOut className="h-4 w-4 mr-2" />
              Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <Tabs defaultValue="supabase" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 gap-1 rounded-2xl border border-border/50 bg-card/70 p-1.5 lg:grid-cols-9">
            <TabsTrigger value="supabase" className="flex items-center gap-2 rounded-xl">
              <Database className="h-4 w-4" />
              Supabase
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Maintenance
            </TabsTrigger>
            <TabsTrigger value="repos" className="flex items-center gap-2">
              <FolderGit2 className="h-4 w-4" />
              Repositories
            </TabsTrigger>
            <TabsTrigger value="tools" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Tools
            </TabsTrigger>
            <TabsTrigger value="support" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Support
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Logs
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="kza" className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              KZA Live
            </TabsTrigger>
          </TabsList>

          <TabsContent value="supabase" className="rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-6">
            <EnterpriseSupabaseControlTab />
          </TabsContent>

          <TabsContent value="analytics" className="rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-6">
            <AnalyticsTab />
          </TabsContent>

          <TabsContent value="maintenance" className="rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-6">
            <MaintenanceModeTab />
          </TabsContent>

          <TabsContent value="repos" className="rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-6">
            <RepoManagerTab />
          </TabsContent>

          <TabsContent value="tools" className="rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-6">
            <SystemToolsTab />
          </TabsContent>

          <TabsContent value="support" className="rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-6">
            <SupportTab />
          </TabsContent>

          <TabsContent value="logs" className="rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-6">
            <LogsTab />
          </TabsContent>

          <TabsContent value="users" className="rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-6">
            <UsersTab />
          </TabsContent>

          <TabsContent value="kza" className="rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-6">
            <KZADashboardTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;