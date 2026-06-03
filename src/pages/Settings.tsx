import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import MainHeader from '@/components/MainHeader';
import MobileNavHeader from '@/components/MobileNavHeader';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useBYOK } from '@/hooks/use-byok';
import { supabase } from '@/integrations/supabase/client';
import { isPasskeyAvailable, registerPasskey, authenticateWithPasskey } from '@/lib/webauthn';
import { BYOKSettingsCard } from '@/components/encryption';
import { 
  Shield, 
  Fingerprint, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Trash2,
  Plus,
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  User,
  Lock,
  Key
} from '@/lib/icon-map';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Settings = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings: byokSettings, hasSessionKey, isLoading: byokLoading } = useBYOK();
  
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [passkeyData, setPasskeyData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isCheckingPasskey, setIsCheckingPasskey] = useState(true);

  const securityScore = useMemo(() => {
    const checks = [
      byokSettings?.isEnabled,
      byokSettings?.isEnabled ? hasSessionKey : true,
      passkeyAvailable ? hasPasskey : true,
    ];

    const passed = checks.filter(Boolean).length;
    return Math.round((passed / checks.length) * 100);
  }, [byokSettings?.isEnabled, hasSessionKey, passkeyAvailable, hasPasskey]);

  useEffect(() => {
    checkPasskeyAvailability();
    checkUserPasskey();
  }, [user]);

  const checkPasskeyAvailability = async () => {
    const available = await isPasskeyAvailable();
    setPasskeyAvailable(available);
  };

  const checkUserPasskey = async () => {
    if (!user) return;
    
    setIsCheckingPasskey(true);
    try {
      const { data, error } = await supabase
        .from('user_passkeys')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data && !error) {
        setHasPasskey(true);
        setPasskeyData(data);
      } else {
        setHasPasskey(false);
        setPasskeyData(null);
      }
    } catch (error) {
      setHasPasskey(false);
    } finally {
      setIsCheckingPasskey(false);
    }
  };

  const handleRegisterPasskey = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      toast({
        title: "Setting up passkey...",
        description: "Please authenticate with your biometric",
      });

      const passkeyResult = await registerPasskey(user.id, user.email || '');

      if (passkeyResult) {
        // Store passkey credential in database
        const { error } = await supabase
          .from('user_passkeys')
          .upsert({
            user_id: user.id,
            email: user.email,
            credential_id: passkeyResult.credentialId,
            public_key: passkeyResult.publicKey,
          });

        if (error) throw error;

        toast({
          title: "Passkey registered! ✓",
          description: "You can now use biometric to sign in",
        });

        await checkUserPasskey();
      } else {
        toast({
          title: "Setup cancelled",
          description: "Passkey registration was cancelled",
        });
      }
    } catch (error: any) {
      console.error('Passkey registration error:', error);
      toast({
        title: "Passkey setup failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePasskey = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      toast({
        title: "Updating passkey...",
        description: "Please authenticate with your biometric",
      });

      const passkeyResult = await registerPasskey(user.id, user.email || '');

      if (passkeyResult) {
        const { error } = await supabase
          .from('user_passkeys')
          .update({
            credential_id: passkeyResult.credentialId,
            public_key: passkeyResult.publicKey,
          })
          .eq('user_id', user.id);

        if (error) throw error;

        toast({
          title: "Passkey updated! ✓",
          description: "Your biometric authentication has been updated",
        });

        await checkUserPasskey();
      } else {
        toast({
          title: "Update cancelled",
          description: "Passkey update was cancelled",
        });
      }
    } catch (error: any) {
      console.error('Passkey update error:', error);
      toast({
        title: "Passkey update failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestPasskey = async () => {
    if (!passkeyData?.credential_id) return;

    setIsLoading(true);
    try {
      toast({
        title: "Testing passkey...",
        description: "Please authenticate with your biometric",
      });

      const authenticated = await authenticateWithPasskey(passkeyData.credential_id);

      if (authenticated) {
        toast({
          title: "Authentication successful! ✓",
          description: "Your passkey is working correctly",
        });
      } else {
        toast({
          title: "Authentication failed",
          description: "Please try updating your passkey",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Passkey test error:', error);
      toast({
        title: "Test failed",
        description: "There was an error testing your passkey",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePasskey = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('user_passkeys')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Passkey removed",
        description: "Biometric authentication has been disabled",
      });

      setHasPasskey(false);
      setPasskeyData(null);
      setShowDeleteDialog(false);
    } catch (error: any) {
      console.error('Passkey deletion error:', error);
      toast({
        title: "Deletion failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Mobile UI
  if (isMobile) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] pb-24">
        {/* Mobile Header */}
        <div className="sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
          <div className="bg-[#0a0a0f]/95 backdrop-blur-xl border-b border-white/5">
            <div className="px-4 py-3 flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white"
                onClick={() => navigate('/dashboard')}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1">
                <h1 className="text-lg font-semibold text-white">Settings</h1>
                <p className="text-xs text-white/50">Account & Security</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Account Card */}
          <button
            onClick={() => navigate('/settings/account')}
            className="w-full bg-white/5 rounded-2xl p-4 border border-white/10 text-left hover:bg-white/[0.07] transition-colors active:scale-[0.99]"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <User className="h-6 w-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-white">Account Settings</h3>
                <p className="text-xs text-white/50">Profile, password & security</p>
              </div>
              <ChevronRight className="h-5 w-5 text-white/30" />
            </div>
          </button>

          {/* Biometric Authentication Section */}
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Shield className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Biometric Auth</h3>
                <p className="text-xs text-white/50">Sign in with fingerprint or Face ID</p>
              </div>
            </div>

            {/* Device not supported */}
            {!passkeyAvailable && (
              <div className="p-4 bg-black/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-white/40" />
                  <p className="text-sm text-white/60">Not supported on this device</p>
                </div>
              </div>
            )}

            {/* Loading */}
            {isCheckingPasskey && passkeyAvailable && (
              <div className="p-4 bg-black/20 rounded-xl flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-white/50" />
                <p className="text-sm text-white/60">Checking passkey...</p>
              </div>
            )}

            {/* Passkey Active */}
            {!isCheckingPasskey && passkeyAvailable && hasPasskey && (
              <div className="space-y-3">
                <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      <div>
                        <p className="text-sm font-medium text-white">Passkey Active</p>
                        {passkeyData?.created_at && (
                          <p className="text-xs text-white/50">
                            Added {new Date(passkeyData.created_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Enabled</Badge>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-12 bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10 rounded-xl"
                    onClick={handleTestPasskey}
                    disabled={isLoading}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Fingerprint className="h-4 w-4 mr-2" />}
                    Test
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 h-12 bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10 rounded-xl"
                    onClick={handleUpdatePasskey}
                    disabled={isLoading}
                  >
                    Update
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 px-4 bg-red-500/10 border-red-500/20 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-xl"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={isLoading}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* No Passkey */}
            {!isCheckingPasskey && passkeyAvailable && !hasPasskey && (
              <div className="space-y-3">
                <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
                  <div className="flex items-center gap-3">
                    <Fingerprint className="h-5 w-5 text-blue-400" />
                    <p className="text-sm text-white/70">Enable biometric for faster sign-in</p>
                  </div>
                </div>

                <Button
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl"
                  onClick={handleRegisterPasskey}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Setup Passkey
                </Button>
              </div>
            )}

            {/* Info Box */}
            {passkeyAvailable && (
              <div className="mt-4 p-4 bg-black/20 rounded-xl">
                <p className="text-xs text-white/40 mb-2 font-medium">About Passkeys</p>
                <ul className="text-xs text-white/40 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                    <span>More secure than passwords</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Faster sign-in with biometric</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Data never leaves your device</span>
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* BYOK Encryption Section */}
          <BYOKSettingsCard className="rounded-2xl" />
        </div>

        {/* Delete Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="bg-[#1a1a2e] border-white/10">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Remove Passkey?</AlertDialogTitle>
              <AlertDialogDescription className="text-white/60">
                This will disable biometric authentication. You can set up a new passkey anytime.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeletePasskey}
                disabled={isLoading}
                className="bg-red-600 hover:bg-red-500 text-white"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background">
      {isMobile ? <MobileNavHeader onSearchClick={() => {}} onMenuClick={() => {}} /> : <MainHeader />}
      
      <div className="container mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-r from-card via-card to-muted/30 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Security Settings</h1>
                <p className="mt-1 text-sm text-muted-foreground/80">
                  Configure BYOK, passkeys, and hardened decryption policies from one control center.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant={securityScore >= 75 ? 'default' : 'secondary'} className={securityScore >= 75 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : ''}>
                Security score: {securityScore}%
              </Badge>
              <Badge variant="outline" className={byokSettings?.isEnabled ? 'border-amber-500/20 text-amber-400 bg-amber-500/5' : 'border-border/50'}>
                BYOK {byokSettings?.isEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/40 bg-muted/25 p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">BYOK Status</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {byokLoading ? 'Loading...' : byokSettings?.isEnabled ? (hasSessionKey ? 'Unlocked in session' : 'Enabled (locked)') : 'Not enabled'}
              </p>
            </div>
            <div className="rounded-xl border border-border/40 bg-muted/25 p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Passkey</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {isCheckingPasskey ? 'Checking...' : hasPasskey ? 'Registered' : passkeyAvailable ? 'Available to enable' : 'Unsupported device'}
              </p>
            </div>
            <div className="rounded-xl border border-border/40 bg-muted/25 p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Decryption Policy</p>
              <p className="mt-1 text-sm font-medium">
                {byokSettings?.strictMode ? 'Strict mode active' : 'Standard mode'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* BYOK Encryption Settings */}
          <BYOKSettingsCard />

          {/* Passkey Security Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Fingerprint className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <CardTitle>Biometric Authentication</CardTitle>
                  <CardDescription>
                    Use fingerprint or Face ID to sign in quickly and securely
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Device Compatibility Check */}
              {!passkeyAvailable && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-border/40 bg-muted/20">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium mb-0.5">Passkey not available</p>
                    <p className="text-xs text-muted-foreground/70">
                      Your device doesn't support biometric authentication or it's not enabled.
                    </p>
                  </div>
                </div>
              )}

              {/* Loading State */}
              {isCheckingPasskey && passkeyAvailable && (
                <div className="flex items-center gap-3 p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Checking passkey status...</p>
                </div>
              )}

              {/* Passkey Registered */}
              {!isCheckingPasskey && passkeyAvailable && hasPasskey && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 rounded-xl border border-border/40 bg-muted/20">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium">Passkey Active</p>
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          Enabled
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground/70 mb-2">
                        You can sign in using biometric authentication
                      </p>
                      {passkeyData?.created_at && (
                        <p className="text-xs text-muted-foreground/60">
                          Registered: {new Date(passkeyData.created_at).toLocaleDateString()}
                        </p>
                      )}
                      {passkeyData?.last_used_at && (
                        <p className="text-xs text-muted-foreground/60">
                          Last used: {new Date(passkeyData.last_used_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={handleTestPasskey}
                      disabled={isLoading}
                      className="flex-1 sm:flex-none"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Fingerprint className="w-4 h-4 mr-2" />
                          Test Passkey
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      onClick={handleUpdatePasskey}
                      disabled={isLoading}
                      className="flex-1 sm:flex-none"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        'Update Passkey'
                      )}
                    </Button>

                    <Button
                      variant="destructive"
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={isLoading}
                      className="flex-1 sm:flex-none"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove
                    </Button>
                  </div>
                </div>
              )}

              {/* No Passkey - Show Setup Option */}
              {!isCheckingPasskey && passkeyAvailable && !hasPasskey && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 rounded-xl border border-border/40 bg-muted/20">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Plus className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium mb-0.5">Passkey Available</p>
                      <p className="text-xs text-muted-foreground/70">
                        Enable biometric authentication for faster and more secure sign-in
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={handleRegisterPasskey}
                    disabled={isLoading}
                    className="w-full sm:w-auto"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Setting up...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Setup Passkey
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Information Box */}
              {passkeyAvailable && (
                <div className="rounded-xl border border-border/40 bg-muted/15 p-4 space-y-2">
                  <p className="text-sm font-medium">About Passkeys</p>
                  <ul className="text-xs text-muted-foreground/70 space-y-1">
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400/70 mt-0.5">•</span>
                      <span>More secure than passwords — resistant to phishing</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400/70 mt-0.5">•</span>
                      <span>Faster sign-in with fingerprint or Face ID</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400/70 mt-0.5">•</span>
                      <span>Your biometric data never leaves your device</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400/70 mt-0.5">•</span>
                      <span>You can still use password as a backup</span>
                    </li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Account Information */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <User className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <CardTitle>Account</CardTitle>
                  <CardDescription>
                    Email: {user?.email}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={() => navigate('/settings/account')}
                className="w-full group"
              >
                <span className="flex-1 text-left">Manage Account Settings</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Passkey?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disable biometric authentication for your account. You'll need to use your password to sign in.
              You can set up a new passkey anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePasskey}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove Passkey'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Settings;
