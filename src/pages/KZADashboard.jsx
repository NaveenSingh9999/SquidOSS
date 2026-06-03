import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, LogOut, ShieldAlert } from '@/lib/icon-map';
import { toast } from 'sonner';
import KZADashboardTab from '@/components/admin/KZADashboardTab';

const KZADashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const checkAuthorization = async () => {
      if (!user) {
        navigate('/auth');
        return;
      }

      try {
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

        const sessionVerified = localStorage.getItem('admin_session_verified');
        if (sessionVerified) {
          const verificationTime = Number.parseInt(sessionVerified, 10);
          const timeDiff = Date.now() - verificationTime;
          if (timeDiff < 5 * 60 * 1000) {
            setIsAuthorized(true);
            setLoading(false);
            return;
          }
        }

        const { data: recentLog, error: logError } = await supabase
          .from('admin_access_logs')
          .select('*')
          .eq('user_id', user.id)
          .eq('step_completed', 4)
          .gte('access_timestamp', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
          .order('access_timestamp', { ascending: false })
          .limit(1);

        if (logError || !recentLog || recentLog.length === 0) {
          localStorage.removeItem('admin_session_verified');
          toast.error('Authentication required');
          navigate('/ad/u1/get_ad/auth');
          return;
        }

        setIsAuthorized(true);
      } catch (authError) {
        console.error('Authorization check failed:', authError);
        navigate('/');
      } finally {
        setLoading(false);
      }
    };

    checkAuthorization();
  }, [navigate, user]);

  const handleLogout = async () => {
    localStorage.removeItem('admin_session_verified');
    await signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ShieldAlert className="h-12 w-12 animate-spin mx-auto mb-4 text-red-600" />
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
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-2.5 text-red-500">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">KZA Live Dashboard</h1>
              <p className="text-sm text-muted-foreground">Kill Zone Authority • {user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300">
              Security Operations
            </Badge>
            <Button
              onClick={() => navigate('/ad/u1/get_ad/dash')}
              variant="outline"
              size="sm"
              className="rounded-xl"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back to Admin
            </Button>
            <Button onClick={handleLogout} variant="outline" size="sm" className="rounded-xl">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <KZADashboardTab />
      </div>
    </div>
  );
};

export default KZADashboard;
