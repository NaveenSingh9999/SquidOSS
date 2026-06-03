import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

const WorkspaceInvite: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { token: tokenParam } = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = useMemo(() => {
    if (tokenParam) return tokenParam;
    const fromParams = searchParams.get('token');
    if (fromParams) return fromParams;
    const fromLocation = new URLSearchParams(window.location.search).get('token');
    return fromLocation || '';
  }, [tokenParam, searchParams]);
  const [status, setStatus] = useState<'idle' | 'accepting' | 'success' | 'error'>(() => (
    token ? 'idle' : 'error'
  ));
  const [message, setMessage] = useState<string>('');
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const acceptedRef = useRef(false);

  useEffect(() => {
    if (!token) {
      if (!acceptedRef.current) {
        setStatus('error');
        setMessage('Invite token is missing or invalid.');
      }
      return;
    }

    if (acceptedRef.current) return;
    if (authLoading) return;

    if (!user) return;

    const acceptInvite = async () => {
      if (acceptedRef.current) return;
      setStatus('accepting');
      try {
        const { data, error } = await supabase.rpc('accept_workspace_invite', {
          p_token: token,
        });

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error('Invite could not be accepted.');
        }

        acceptedRef.current = true;
        if (typeof window !== 'undefined') {
          localStorage.setItem('squid_active_workspace_id', data);
        }

        setWorkspaceId(data);
        setStatus('success');
        setMessage('Workspace invite accepted.');
        toast({
          title: 'Welcome to the workspace',
          description: 'Invite accepted successfully.',
        });
      } catch (err: any) {
        setStatus('error');
        setMessage(err?.message || 'Failed to accept invite.');
      }
    };

    void acceptInvite();
  }, [token, user, authLoading, toast]);

  const handleSignIn = () => {
    const next = `/workspace/invite/${encodeURIComponent(token)}`;
    navigate(`/auth?next=${encodeURIComponent(next)}`);
  };

  const handleGoToDashboard = () => {
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">Workspace Invite</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {authLoading && 'Loading...'}
          {!authLoading && status === 'idle' && !user && 'Sign in to accept this workspace invite.'}
          {status === 'accepting' && 'Accepting your invite...'}
          {status === 'success' && message}
          {status === 'error' && (message || 'Unable to accept this invite.')}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {!authLoading && !user && token && (
            <Button onClick={handleSignIn}>Sign in to accept</Button>
          )}
          {status === 'success' && (
            <Button onClick={handleGoToDashboard}>Go to dashboard</Button>
          )}
          {status === 'error' && (
            <Button variant="outline" onClick={handleGoToDashboard}>Back to dashboard</Button>
          )}
        </div>

        {workspaceId && (
          <p className="mt-4 text-xs text-muted-foreground">
            Workspace ID: {workspaceId}
          </p>
        )}
      </div>
    </div>
  );
};

export default WorkspaceInvite;
