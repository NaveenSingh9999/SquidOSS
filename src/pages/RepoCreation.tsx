import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import AppleLoader from '@/components/ui/AppleLoader';
import { Check, AlertCircle, KeyRound, Lock, ShieldCheck } from '@/lib/icon-map';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useIsMobile } from '@/hooks/use-mobile';

// Create repos using Supabase Functions to avoid CORS
const createReposWithRetry = async (
  session: any,
  count: number,
  password?: string | null
): Promise<any[]> => {
  // First check existing repos
  try {
    const { data: existingRepos, error: existingError } = await supabase
      .from('repositories')
      .select('*')
      .eq('user_id', session.user.id);

    if (existingError) throw existingError;

    if (existingRepos && existingRepos.length > 0) {
      console.log('Using existing repositories:', existingRepos.length);
      return existingRepos;
    }

    // Only proceed with creation if no repos exist
    console.log('No existing repos found, creating new ones...');
    const { data, error } = await supabase.functions.invoke('github-storage', {
      body: {
        action: 'create-repos',
        count,
        userId: session.user.id
      }
    });

    if (error) throw error;
    if (!data?.repos) throw new Error('Invalid response format');

    // No need to insert into database as the Edge Function handles that
    return data.repos;
  } catch (error) {
    console.error('Repository creation/fetch error:', error);
    throw error;
  }
};

const RepoCreation = () => {
  const { count } = useParams<{ count: string }>();
  const location = useLocation();
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [vaults, setVaults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const queryParams = new URLSearchParams(location.search);
  const password = queryParams.get('password');

  useEffect(() => {
    const createVaults = async () => {
      setCreating(true);
      setProgress(10);
      
      try {
        const vaultCount = count ? parseInt(count, 10) : 5;
        const validCount = isNaN(vaultCount) ? 5 : Math.min(Math.max(1, vaultCount), 5);
        
        setProgress(20);

        // Get auth session
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData?.session) {
          throw new Error(sessionError?.message || "Authentication required");
        }

        setProgress(30);

        // Check repo count first
        const { data: profile } = await supabase
          .from('profiles')
          .select('repo_count')
          .eq('id', sessionData.session.user.id)
          .single();

        if (profile && profile.repo_count >= 2) {
          throw new Error("Maximum number of vaults (2) reached");
        }

        // Create repositories using Supabase Function
        const createdRepos = await createReposWithRetry(
          sessionData.session,
          validCount,
          password
        );

        setProgress(60);

        // Store in Supabase with simplified retry
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const { error: dbError } = await supabase
              .from('repositories')
              .insert(
                createdRepos.map(repo => ({
                  repo_name: repo.name || repo.repo_name,
                  user_id: sessionData.session.user.id,
                  status: 'active',
                  created_at: new Date().toISOString()
                }))
              );

            if (!dbError) break; // Success
            throw dbError;
          } catch (error) {
            if (attempt === 2) throw error; // Last attempt failed
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
          }
        }

        // Update repo count and onboarding status
        await supabase
          .from('profiles')
          .update({ 
            repo_count: (profile?.repo_count || 0) + createdRepos.length,
            onboarding_complete: true
          })
          .eq('id', sessionData.session.user.id);

        setProgress(90);
        setVaults(createdRepos.map(repo => repo.name || repo.repo_name));

        toast({
          title: "Setup complete",
          description: `Successfully created ${createdRepos.length} secure vaults`,
        });
        
        setTimeout(() => {
          navigate('/dashboard');
        }, 2000);
        
      } catch (err: any) {
        console.error("Vault creation error:", err);
        const errorMessage = err.message || "Failed to create secure vaults";
        setError(errorMessage);
        
        toast({
          title: "Setup failed",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setProgress(100);
        setCreating(false);
      }
    };

    createVaults();
  }, [count, navigate, toast, password]);

  return (
    <div className="h-full flex items-center justify-center p-4">
      <Card className={`w-full ${isMobile ? 'max-w-[90%]' : 'max-w-md'} shadow-lg`}>
        <CardHeader className={isMobile ? 'px-4 py-4' : ''}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-xl">Secure Vault Setup</CardTitle>
          </div>
          <CardDescription className="text-sm">
            Creating distributed secure vaults for your encrypted files
          </CardDescription>
        </CardHeader>
        
        <CardContent className={isMobile ? 'px-4 pb-4' : ''}>
          <div className="space-y-5">
            <Progress value={progress} className="w-full h-2" />
            
            {creating ? (
              <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <AppleLoader size="large" />
                </div>
                <p className="text-lg font-medium mb-2">Creating secure vaults</p>
                <p className="text-muted-foreground text-sm">
                  Setting up your encrypted storage system...
                </p>
              </div>
            ) : error ? (
              <div className="bg-destructive/10 p-5 rounded-lg text-center">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <p className="text-lg font-medium mb-2 text-destructive">Setup Failed</p>
                <p className="text-sm mb-4 text-muted-foreground">{error}</p>
                <Button 
                  variant="outline" 
                  size={isMobile ? "sm" : "default"}
                  className="mt-2" 
                  onClick={() => navigate('/dashboard')}
                >
                  Back to Dashboard
                </Button>
              </div>
            ) : vaults.length > 0 ? (
              <div className="bg-green-50 dark:bg-green-900/20 p-5 rounded-lg text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-green-500" />
                </div>
                <p className="text-lg font-medium mb-2">Setup Complete!</p>
                <p className="text-muted-foreground text-sm mb-4">
                  Your secure vaults are ready to store encrypted files
                </p>
                
                <div className="grid grid-cols-1 gap-3 mb-4">
                  <div className="flex items-center justify-center gap-2 py-2 px-4 bg-white dark:bg-slate-800 rounded-md">
                    <Lock className="h-4 w-4 text-primary" />
                    <span className="text-sm">End-to-End Encryption Active</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 py-2 px-4 bg-white dark:bg-slate-800 rounded-md">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <span className="text-sm">{vaults.length} Secure Vault Keys Generated</span>
                  </div>
                </div>
                
                <Button 
                  variant="default" 
                  size={isMobile ? "sm" : "default"}
                  className="mt-2 w-full" 
                  onClick={() => navigate('/dashboard')}
                >
                  Continue to Dashboard
                </Button>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RepoCreation;
