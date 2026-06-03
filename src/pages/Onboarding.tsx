
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, HardDrive, Shield, Lock, FolderOpen } from '@/lib/icon-map';
import MigrationWizard from '@/components/MigrationWizard';

const Onboarding = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [repoCount, setRepoCount] = useState(0);
  const [showMigration, setShowMigration] = useState(false);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          navigate('/auth');
          return;
        }

        setUserId(session.user.id);

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('onboarding_complete, repo_count')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error("Error fetching profile:", error);
          setLoading(false);
          return;
        }

        // Only show onboarding for users that have onboarding_complete set to false
        if (profile && profile.onboarding_complete) {
          navigate('/dashboard');
        } else {
          setRepoCount(profile?.repo_count || 0);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error in onboarding check:", error);
        setLoading(false);
      }
    };

    checkOnboarding();
  }, [navigate]);

  const completeOnboarding = async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      
      // Only update onboarding_complete to true
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_complete: true })
        .eq('id', userId);

      if (error) {
        console.error("Error updating onboarding status:", error);
        setLoading(false);
        return;
      }

      navigate('/dashboard');
    } catch (error) {
      console.error("Error completing onboarding:", error);
      setLoading(false);
    }
  };

  const handleCreateVault = () => {
    navigate('/r/c/1');
  };

  const handleMigrationComplete = () => {
    setShowMigration(false);
    // Refresh repo count
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (showMigration) {
    return (
      <div className="container mx-auto max-w-4xl p-4">
        <MigrationWizard 
          onComplete={handleMigrationComplete}
          onCancel={() => setShowMigration(false)}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <h1 className="text-2xl font-bold mb-4">Welcome to SquidCloud</h1>
      
      <div className="space-y-6">
        {repoCount === 0 ? (
          <>
            <div className="bg-card p-4 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-2">Create Your Storage Vault</h2>
              <p className="text-muted-foreground mb-4">
                To get started with SquidCloud, you'll need to:
              </p>
              <ul className="list-disc pl-5 space-y-2 mb-4">
                <li>Create a secure storage vault (max 2 vaults per user)</li>
                <li>Your files will be protected with end-to-end encryption</li>
                <li>Access dashboard features after vault creation</li>
              </ul>
              
              <div className="flex gap-3">
                <Button 
                  onClick={handleCreateVault}
                  className="flex-1"
                  size="lg"
                >
                  <HardDrive className="mr-2 h-5 w-5" />
                  Create Storage Vault
                </Button>
                
                <Button 
                  onClick={() => setShowMigration(true)}
                  variant="outline"
                  className="flex-1"
                  size="lg"
                >
                  <FolderOpen className="mr-2 h-5 w-5" />
                  Import Files
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg flex flex-col items-center text-center">
                <Shield className="h-8 w-8 text-blue-500 mb-2" />
                <h3 className="font-medium">End-to-End Encryption</h3>
                <p className="text-sm text-muted-foreground">All files are securely encrypted</p>
              </div>
              
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg flex flex-col items-center text-center">
                <Lock className="h-8 w-8 text-green-500 mb-2" />
                <h3 className="font-medium">Private Storage</h3>
                <p className="text-sm text-muted-foreground">Only you can access your files</p>
              </div>
              
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg flex flex-col items-center text-center">
                <HardDrive className="h-8 w-8 text-purple-500 mb-2" />
                <h3 className="font-medium">Multiple Vaults</h3>
                <p className="text-sm text-muted-foreground">Create up to 2 secure vaults</p>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-card p-6 rounded-lg shadow text-center">
            <h2 className="text-xl font-semibold mb-4">All Set! Let's Get Started</h2>
            <p className="text-muted-foreground mb-6">
              You've already created {repoCount} storage vault{repoCount > 1 ? 's' : ''}. You're ready to use SquidCloud!
            </p>
            
            <div className="flex gap-3">
              <Button 
                onClick={completeOnboarding}
                className="flex-1"
                size="lg"
              >
                Continue to Dashboard
              </Button>
              
              <Button 
                onClick={() => setShowMigration(true)}
                variant="outline"
                className="flex-1"
                size="lg"
              >
                <FolderOpen className="mr-2 h-5 w-5" />
                Import Files
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
