import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { securityService } from '@/services/security-service';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertCircle, CheckCircle } from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { buildPublicUrl, getOAuthRedirectUrl } from '@/lib/appLinks';

interface AuthContextType {
  session: any;
  user: any;
  profile: any | null;
  loading: boolean;
  isNewUser: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  githubSignIn: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);

  let toast: any;
  try {
    const toastHook = useToast();
    toast = toastHook.toast;
  } catch (error) {
    toast = () => {};
  }

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return null;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (error) return null;
        return data;
      } catch {
        return null;
      }
    };

    if (user) {
      fetchProfile().then(setProfile);
    } else {
      setProfile(null);
    }
  }, [user]);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (event === 'SIGNED_IN') {
          const isRecentUser = session?.user &&
            new Date(session.user.created_at).getTime() > Date.now() - 120000;
          if (isRecentUser) setIsNewUser(true);

          if (toast) {
            toast({
              title: "Welcome back!",
              description: "You have successfully signed in"
            });
          }
        } else if (event === 'SIGNED_OUT') {
          setIsNewUser(false);
          if (toast) {
            toast({
              title: "Signed out",
              description: "You have been successfully signed out"
            });
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const refreshSession = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.refreshSession();
      setSession(session);
      setUser(session?.user ?? null);
    } catch (error) {
      console.error('Error refreshing session:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email, password
      });

      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
          throw new Error('Invalid email or password');
        }
        throw signInError;
      }

      if (authData?.user) {
        const { data: masterKeyData } = await supabase
          .from('master_keys')
          .select('id')
          .eq('user_id', authData.user.id)
          .maybeSingle();

        const userAgent = navigator.userAgent;
        const deviceName = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
          ? 'Mobile Device'
          : 'Desktop';

        await supabase.from('login_sessions').insert({
          user_id: authData.user.id,
          user_agent: userAgent,
          device_name: deviceName,
          last_active: new Date().toISOString()
        });
      }

    } catch (error: any) {
      if (toast) {
        toast({
          title: "Login failed",
          description: error.message,
          variant: "destructive"
        });
      }
      throw error;
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: buildPublicUrl('/dashboard')
        }
      });
      if (error) throw error;

      if (toast) {
        toast({
          title: "Account created",
          description: "Registration successful"
        });
      }
    } catch (error: any) {
      if (toast) {
        toast({
          title: "Registration failed",
          description: error.message,
          variant: "destructive"
        });
      }
      throw error;
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setTimeout(async () => {
        try {
          await securityService.logSecurityEvent({
            event_type: 'login_attempt',
            ip_address: 'unknown',
            user_agent: navigator.userAgent,
            metadata: { action: 'logout', timestamp: new Date().toISOString() },
            risk_level: 'low',
            status: 'success'
          });
        } catch {}
      }, 100);
    } catch (error: any) {
      if (toast) {
        toast({
          title: "Sign out failed",
          description: error.message,
          variant: "destructive"
        });
      }
    }
  };

  const githubSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: getOAuthRedirectUrl() }
      });
      if (error) throw error;
    } catch (error: any) {
      if (toast) {
        toast({
          title: "GitHub sign in failed",
          description: error.message,
          variant: "destructive"
        });
      }
    }
  };

  return (
    <AuthContext.Provider value={{
      session, user, profile, loading, isNewUser,
      signIn, signUp, signOut, githubSignIn, refreshSession
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
