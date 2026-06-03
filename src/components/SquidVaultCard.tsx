import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Lock, ChevronRight, Fingerprint, Loader2 } from '@/lib/icon-map';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { isPasskeyAvailable, registerPasskey, authenticateWithPasskey } from '@/lib/webauthn';

interface SquidVaultCardProps {
  onUnlock: () => void;
}

const SquidVaultCard: React.FC<SquidVaultCardProps> = ({ onUnlock }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [vaultName, setVaultName] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    checkPasskeyAvailability();
  }, []);

  const checkPasskeyAvailability = async () => {
    const available = await isPasskeyAvailable();
    setPasskeyAvailable(available);
  };

  const handleClick = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if vault exists
      const { data: vault, error } = await supabase
        .from('vaults')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        // No vault exists, show creation dialog
        setIsCreating(true);
        setShowDialog(true);
      } else if (vault) {
        // Vault exists, check if has passkey
        setIsCreating(false);
        setHasPasskey(!!vault.passkey_credential_id);
        setVaultName(vault.name);
        setShowDialog(true);
        
        // Auto-trigger passkey if available
        if (vault.passkey_credential_id && passkeyAvailable) {
          setTimeout(() => {
            handlePasskeyLogin(vault.passkey_credential_id);
          }, 300);
        }
      }
    } catch (error) {
      console.error('Error checking vault:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (isCreating) {
        // Create new vault
        if (!vaultName.trim()) {
          toast({
            title: 'Vault name required',
            description: 'Please enter a name for your vault',
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }

        const passwordHash = await hashPassword(password);
        const { data: newVault, error } = await supabase
          .from('vaults')
          .insert({
            user_id: user.id,
            name: vaultName.trim(),
            password_hash: passwordHash,
          })
          .select()
          .single();

        if (error) throw error;

        // Attempt to register passkey if available
        if (passkeyAvailable && newVault) {
          toast({
            title: 'Setting up passkey...',
            description: 'Please authenticate with your biometric',
          });

          const passkeyResult = await registerPasskey(user.id, vaultName);
          
          if (passkeyResult) {
            // Update vault with passkey credential
            await supabase
              .from('vaults')
              .update({ 
                passkey_credential_id: passkeyResult.credentialId,
                is_fingerprint_enabled: true 
              })
              .eq('id', newVault.id);

            toast({
              title: 'Passkey registered! ✓',
              description: 'You can now use biometric authentication',
            });
          }
        }

        toast({
          title: 'SquidVault Created!',
          description: 'Your secure vault has been created successfully.',
        });

        onUnlock();
        setShowDialog(false);
        setPassword('');
        setVaultName('');
      } else {
        // Verify password for existing vault
        const { data: vault } = await supabase
          .from('vaults')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (!vault) {
          toast({
            title: 'Vault not found',
            description: 'Please try again.',
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }

        const isValid = await verifyPassword(password, vault.password_hash);
        
        if (!isValid) {
          toast({
            title: 'Incorrect Password',
            description: 'Please try again.',
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }

        toast({
          title: 'Vault unlocked!',
          description: 'Welcome back',
        });

        onUnlock();
        setShowDialog(false);
        setPassword('');
      }
    } catch (error) {
      console.error('Error with vault:', error);
      toast({
        title: 'Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasskeyLogin = async (credentialId: string) => {
    setIsLoading(true);
    
    try {
      toast({
        title: 'Authenticating...',
        description: 'Please use your biometric',
      });

      const authenticated = await authenticateWithPasskey(credentialId);
      
      if (authenticated) {
        toast({
          title: 'Authentication successful!',
          description: 'Welcome back',
        });

        onUnlock();
        setShowDialog(false);
      } else {
        toast({
          title: 'Authentication failed',
          description: 'Please try again or use password',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Passkey authentication error:', error);
      toast({
        title: 'Authentication error',
        description: 'Please use password to login',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const hashPassword = async (pass: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pass);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const verifyPassword = async (inputPassword: string, storedHash: string): Promise<boolean> => {
    const inputHash = await hashPassword(inputPassword);
    return inputHash === storedHash;
  };

  return (
    <>
      <Card 
        className="group relative overflow-hidden cursor-pointer hover:shadow-xl transition-all duration-500 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20 hover:border-purple-500/40"
        onClick={handleClick}
      >
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-xl group-hover:blur-2xl transition-all" />
                <div className="relative w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <Lock className="w-8 h-8 text-white" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                  SquidVault
                </h3>
                <p className="text-sm text-muted-foreground">
                  Ultra-secure encrypted storage
                </p>
              </div>
            </div>
            <ChevronRight className="w-6 h-6 text-purple-500 group-hover:translate-x-1 transition-transform" />
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-purple-500" />
              {isCreating ? 'Create SquidVault' : 'Unlock SquidVault'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isCreating && (
              <div>
                <Label htmlFor="vaultName">Vault Name</Label>
                <Input
                  id="vaultName"
                  type="text"
                  value={vaultName}
                  onChange={(e) => setVaultName(e.target.value)}
                  placeholder="My Secure Vault"
                  required
                  disabled={isLoading}
                />
              </div>
            )}
            
            {/* Show passkey option for existing vault */}
            {!isCreating && hasPasskey && passkeyAvailable && (
              <>
                <div className="text-center py-2">
                  <p className="text-sm text-muted-foreground mb-3">
                    Use passkey for quick access
                  </p>
                  <Button
                    type="button"
                    onClick={() => handlePasskeyLogin(vaultName)}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    size="lg"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Authenticating...
                      </>
                    ) : (
                      <>
                        <Fingerprint className="w-5 h-5 mr-2" />
                        Sign in with Passkey
                      </>
                    )}
                  </Button>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or use password
                    </span>
                  </div>
                </div>
              </>
            )}

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isCreating ? "Create a strong password" : "Enter vault password"}
                required
                disabled={isLoading}
              />
            </div>

            {/* Show passkey info when creating */}
            {isCreating && passkeyAvailable && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <Fingerprint className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    Passkey will be set up
                  </p>
                  <p className="text-blue-700 dark:text-blue-300 text-xs">
                    You'll be able to use biometric authentication after creating your vault
                  </p>
                </div>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
              variant={!isCreating && hasPasskey ? "outline" : "default"}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isCreating ? 'Creating...' : 'Unlocking...'}
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 mr-2" />
                  {isCreating ? 'Create Vault' : (hasPasskey ? 'Unlock with Password' : 'Unlock Vault')}
                </>
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SquidVaultCard;