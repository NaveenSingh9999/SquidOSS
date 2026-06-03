
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const OAuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshSession } = useAuth();
  const { toast } = useToast();
  const [statusMessage, setStatusMessage] = useState("Processing authentication...");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const error = searchParams.get('error');
        if (error) throw new Error(`OAuth error: ${error}`);
        
        setStatusMessage("Completing authentication...");
        
        // By the time this component renders, Supabase usually has already 
        // read the URL hash and set the local storage session tokens natively 
        // (even for implicit grant flows which don't have ?code=)
        const { data } = await supabase.auth.getSession();
        
        const nextUrl = localStorage.getItem('squid_auth_next');
        localStorage.removeItem('squid_auth_next');

        if (data.session) {
          navigate(nextUrl || '/dashboard', { replace: true });
        } else {
          setTimeout(async () => {
            const { data: retryData } = await supabase.auth.getSession();
            if (retryData.session) {
              navigate(nextUrl || '/dashboard', { replace: true });
            } else {
              throw new Error('Authentication session could not be established');
            }
          }, 1500);
        }
      } catch (error) {
        console.error('OAuth callback error:', error);
        toast({
          title: "Authentication failed",
          description: error instanceof Error ? error.message : "An unknown error occurred",
          variant: "destructive",
        });
        navigate('/auth', { replace: true });
      }
    };
    
    handleCallback();
  }, [searchParams, navigate, refreshSession, toast]);
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
      <p className="text-lg font-medium mb-2">Supabase Secure Auth</p>
      <p className="text-sm text-muted-foreground">{statusMessage}</p>
    </div>
  );
};

export default OAuthCallback;
