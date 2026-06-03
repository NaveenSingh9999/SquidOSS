
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { isPasskeyAvailable, registerPasskey, authenticateWithPasskey } from '@/lib/webauthn';
import PINSetupDialog from '@/components/PINSetupDialog';
import PINAuthDialog from '@/components/PINAuthDialog';
import { pinAuthService } from '@/services/pinAuthService';
import { usePINAuthContext } from '@/contexts/PINAuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { BYOKSettingsCard } from '@/components/encryption';
import {
  User,
  Mail,
  Key,
  Shield,
  Moon,
  Sun,
  Code,
  Palette,
  Bell,
  Download,
  Trash2,
  Settings,
  ChevronLeft,
  Terminal,
  GitBranch,
  Zap,
  Fingerprint,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  ArrowLeft,
  ChevronRight,
  Lock,
  HardDrive,
  Calendar
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

const ACCOUNT_PREFS_STORAGE_KEY = 'squid_account_settings_v3';

interface AccountPreferenceSettings {
  lockSessionWhenInactive: boolean;
  requirePinForDownloads: boolean;
  requirePinForShares: boolean;
  strictPreviewIsolation: boolean;
  verifyDownloadIntegrity: boolean;
  blockUnknownFilePreviews: boolean;
  quarantineRiskyFiles: boolean;
  notifySecurityEvents: boolean;
  notifyFileShareEvents: boolean;
  notifyBackgroundSync: boolean;
  lowDataMode: boolean;
  prefetchNextPreview: boolean;
  hardwareDecodeAcceleration: boolean;
  autoRetryBackgroundSync: boolean;
  developerLogs: boolean;
  experimentalPreviewPipeline: boolean;
  showTransferDiagnostics: boolean;
  showAdvancedMetadata: boolean;
}

interface AccountPreferenceItem {
  key: keyof AccountPreferenceSettings;
  label: string;
  description: string;
}

interface AccountPreferenceCategory {
  id: string;
  title: string;
  subtitle: string;
  items: AccountPreferenceItem[];
}

const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferenceSettings = {
  lockSessionWhenInactive: true,
  requirePinForDownloads: false,
  requirePinForShares: true,
  strictPreviewIsolation: true,
  verifyDownloadIntegrity: true,
  blockUnknownFilePreviews: true,
  quarantineRiskyFiles: true,
  notifySecurityEvents: true,
  notifyFileShareEvents: true,
  notifyBackgroundSync: false,
  lowDataMode: false,
  prefetchNextPreview: true,
  hardwareDecodeAcceleration: true,
  autoRetryBackgroundSync: true,
  developerLogs: false,
  experimentalPreviewPipeline: false,
  showTransferDiagnostics: false,
  showAdvancedMetadata: false,
};

const AccountSettings = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [loading, setLoading] = useState(false);
  const [storageUsed, setStorageUsed] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [passkeyData, setPasskeyData] = useState<any>(null);
  const [isCheckingPasskey, setIsCheckingPasskey] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // PIN Authentication states
  const [showPINSetup, setShowPINSetup] = useState(false);
  const [showPINAuth, setShowPINAuth] = useState(false);
  const [pinAction, setPinAction] = useState<'disable' | 'change' | null>(null);
  const [hasPIN, setHasPIN] = useState(false);
  const [pinSettings, setPinSettings] = useState<any>(null);
  const [accountPreferences, setAccountPreferences] = useState<AccountPreferenceSettings>(DEFAULT_ACCOUNT_PREFERENCES);

  const preferenceCategories = useMemo<AccountPreferenceCategory[]>(() => [
    {
      id: 'security-hardening',
      title: 'Security Hardening',
      subtitle: 'Strict controls for sensitive actions and file handling.',
      items: [
        {
          key: 'lockSessionWhenInactive',
          label: 'Auto-lock account session',
          description: 'Lock sensitive session access after inactivity.',
        },
        {
          key: 'strictPreviewIsolation',
          label: 'Strict preview isolation',
          description: 'Run previews in isolated mode to reduce attack surface.',
        },
        {
          key: 'verifyDownloadIntegrity',
          label: 'Verify download integrity',
          description: 'Validate checksum before completing file decryption.',
        },
        {
          key: 'blockUnknownFilePreviews',
          label: 'Block unknown preview formats',
          description: 'Prevent preview rendering for unknown MIME signatures.',
        },
        {
          key: 'quarantineRiskyFiles',
          label: 'Quarantine risky files',
          description: 'Flag suspicious uploads before opening or sharing.',
        },
      ],
    },
    {
      id: 'operation-guards',
      title: 'Operation Guards',
      subtitle: 'Control PIN and action protection behavior.',
      items: [
        {
          key: 'requirePinForDownloads',
          label: 'Require PIN for downloads',
          description: 'Prompt PIN before decrypt+download operations.',
        },
        {
          key: 'requirePinForShares',
          label: 'Require PIN for shares',
          description: 'Prompt PIN before creating file share links.',
        },
        {
          key: 'notifySecurityEvents',
          label: 'Security event alerts',
          description: 'Notify for lockouts, mismatches, and verification failures.',
        },
        {
          key: 'notifyFileShareEvents',
          label: 'Share event alerts',
          description: 'Notify when links are generated or revoked.',
        },
      ],
    },
    {
      id: 'performance-data',
      title: 'Performance & Data',
      subtitle: 'Tune transfer and preview behavior.',
      items: [
        {
          key: 'lowDataMode',
          label: 'Low data mode',
          description: 'Reduce background transfer and preview quality when needed.',
        },
        {
          key: 'prefetchNextPreview',
          label: 'Prefetch next preview',
          description: 'Preload nearby files for faster preview navigation.',
        },
        {
          key: 'hardwareDecodeAcceleration',
          label: 'Hardware decode acceleration',
          description: 'Use hardware-accelerated media decode when available.',
        },
        {
          key: 'autoRetryBackgroundSync',
          label: 'Auto-retry background sync',
          description: 'Retry interrupted uploads/downloads automatically.',
        },
        {
          key: 'notifyBackgroundSync',
          label: 'Background sync notifications',
          description: 'Show notifications for completion/failure of sync tasks.',
        },
      ],
    },
    {
      id: 'developer-labs',
      title: 'Developer & Labs',
      subtitle: 'Advanced diagnostics and experimental flags.',
      items: [
        {
          key: 'developerLogs',
          label: 'Developer logs',
          description: 'Enable verbose diagnostics in development tools.',
        },
        {
          key: 'showTransferDiagnostics',
          label: 'Transfer diagnostics',
          description: 'Display transfer pipeline and retry instrumentation.',
        },
        {
          key: 'showAdvancedMetadata',
          label: 'Advanced file metadata',
          description: 'Show additional metadata in preview and file panels.',
        },
        {
          key: 'experimentalPreviewPipeline',
          label: 'Experimental preview pipeline',
          description: 'Use early-stage rendering/decrypt optimizations.',
        },
      ],
    },
  ], []);

  useEffect(() => {
    if (user) {
      setDisplayName(profile?.display_name || user.user_metadata?.full_name || '');
      setFullName(profile?.full_name || user.user_metadata?.full_name || '');
      fetchStorageStats();
      checkPasskeyAvailability();
      checkUserPasskey();
      checkPINStatus();
    }
  }, [user, profile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = window.localStorage.getItem(ACCOUNT_PREFS_STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved) as Partial<AccountPreferenceSettings>;
      setAccountPreferences(prev => ({
        ...prev,
        ...parsed,
      }));
    } catch (error) {
      console.error('Failed to parse account settings preferences:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem(
      ACCOUNT_PREFS_STORAGE_KEY,
      JSON.stringify(accountPreferences)
    );
  }, [accountPreferences]);

  useEffect(() => {
    const syncPINGuards = async () => {
      if (!user || !hasPIN || !pinSettings) return;

      const shareNeedsUpdate = pinSettings.requirePinForShares !== accountPreferences.requirePinForShares;
      const downloadNeedsUpdate = pinSettings.requirePinForVault !== accountPreferences.requirePinForDownloads;

      if (!shareNeedsUpdate && !downloadNeedsUpdate) return;

      await pinAuthService.updateSettings(user.id, {
        requirePinForShares: accountPreferences.requirePinForShares,
        requirePinForVault: accountPreferences.requirePinForDownloads,
      });

      await checkPINStatus();
    };

    void syncPINGuards();
  }, [
    accountPreferences.requirePinForDownloads,
    accountPreferences.requirePinForShares,
    hasPIN,
    pinSettings,
    user,
  ]);

  const updatePreference = useCallback((key: keyof AccountPreferenceSettings, enabled: boolean) => {
    setAccountPreferences(prev => ({
      ...prev,
      [key]: enabled,
    }));
  }, []);

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

  const checkPINStatus = async () => {
    if (!user) return;
    
    try {
      const hasPINEnabled = await pinAuthService.hasPIN(user.id);
      setHasPIN(hasPINEnabled);
      
      if (hasPINEnabled) {
        const settings = await pinAuthService.getSettings(user.id);
        setPinSettings(settings);
      }
    } catch (error) {
      console.error('Failed to check PIN status:', error);
      setHasPIN(false);
      setPinSettings(null);
    }
  };

  const fetchStorageStats = async () => {
    try {
      // Get total storage used
      const { data: files, error: filesError } = await supabase
        .from('files')
        .select('size')
        .eq('user_id', user?.id);

      if (filesError) throw filesError;

      // Calculate total storage
      const totalSize = files.reduce((acc, file) => acc + (file.size || 0), 0);
      setStorageUsed(totalSize);
      setTotalFiles(files.length);
    } catch (error) {
      console.error('Failed to fetch storage stats:', error);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderPreferenceCategories = (mobileView: boolean) => {
    return (
      <div className={mobileView ? 'space-y-4' : 'grid gap-4 md:grid-cols-2'}>
        {preferenceCategories.map((category) => {
          const categoryBody = (
            <div className="space-y-2.5">
              {category.items.map((item) => (
                  <div
                    key={item.key}
                    className={mobileView
                      ? 'flex items-start justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/30 px-3.5 py-3'
                      : 'flex items-start justify-between gap-3 rounded-lg border border-border/40 bg-muted/30 px-3.5 py-3 transition-all duration-150 hover:bg-accent/20 hover:border-border/60'}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={mobileView ? 'text-sm font-medium text-white' : 'text-sm font-medium text-foreground'}>
                        {item.label}
                      </p>
                      <p className={mobileView ? 'mt-1 text-xs text-white/45' : 'mt-1 text-xs text-muted-foreground/80'}>
                        {item.description}
                      </p>
                    </div>
                    <Switch
                      checked={accountPreferences[item.key]}
                      onCheckedChange={(checked) => updatePreference(item.key, checked)}
                    />
                  </div>
              ))}
            </div>
          );

          if (mobileView) {
            return (
              <div key={category.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                <div className="flex items-center gap-3 mb-3">
                  <h4 className="text-sm font-semibold text-white">{category.title}</h4>
                </div>
                <p className="text-xs text-white/45 mb-3">{category.subtitle}</p>
                {categoryBody}
              </div>
            );
          }

          return (
            <Card key={category.id} className="overflow-hidden border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-[15px] font-semibold">{category.title}</CardTitle>
                <p className="text-[13px] text-muted-foreground/80">{category.subtitle}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {categoryBody}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const updates = {
        full_name: fullName.trim() || null,
        display_name: displayName.trim() || null,
      };

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setLoading(true);
    try {
      if (newPassword !== confirmPassword) {
        throw new Error('New passwords do not match');
      }

      // Verify current password first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword
      });

      if (signInError) {
        throw new Error('Current password is incorrect');
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) throw updateError;

      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      });

      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setChangingPassword(false);
    } catch (error: any) {
      toast({
        title: "Password change failed",
        description: error.message || "Failed to change password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchCbCode = () => {
    // Check for last opened project
    const lastFolder = sessionStorage.getItem('cbcode_last_folder');
    
    if (lastFolder) {
      navigate(`/cbcode/${lastFolder}`);
    } else {
      navigate('/cbcode');
    }
    toast({
      title: "Profile Updated",
      description: "Your profile has been saved successfully.",
    });
  };

  const handleRegisterPasskey = async () => {
    if (!user) return;

    setLoading(true);
    try {
      toast({
        title: "Setting up passkey...",
        description: "Please authenticate with your biometric",
      });

      const passkeyResult = await registerPasskey(user.id, user.email || '');

      if (passkeyResult) {
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
      setLoading(false);
    }
  };

  const handleUpdatePasskey = async () => {
    if (!user) return;

    setLoading(true);
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
      setLoading(false);
    }
  };

  const handleTestPasskey = async () => {
    if (!passkeyData?.credential_id) return;

    setLoading(true);
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
      setLoading(false);
    }
  };

  const handleDeletePasskey = async () => {
    if (!user) return;

    setLoading(true);
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
      setLoading(false);
    }
  };

  // PIN Authentication handlers
  const handleSetupPIN = () => {
    setShowPINSetup(true);
  };

  const handlePINSetupComplete = async () => {
    setShowPINSetup(false);
    const wasChanging = pinAction === 'change';
    await checkPINStatus();
    toast({
      title: wasChanging ? "PIN Updated" : "PIN Created",
      description: wasChanging 
        ? "Your PIN has been changed successfully."
        : "Your PIN has been set up successfully.",
    });
    setPinAction(null);
  };

  const handleChangePIN = () => {
    setPinAction('change');
    setShowPINAuth(true);
  };

  const handleDisablePIN = () => {
    setPinAction('disable');
    setShowPINAuth(true);
  };

  const handlePINAuthSuccess = async (verifiedPIN: string) => {
    if (!user) return;

    setShowPINAuth(false);

    if (pinAction === 'disable') {
      setLoading(true);
      try {
        await pinAuthService.disablePIN(user.id, verifiedPIN);
        await checkPINStatus();
        toast({
          title: "PIN Disabled",
          description: "Your PIN authentication has been disabled.",
        });
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to disable PIN",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    } else if (pinAction === 'change') {
      // After successful auth, show setup dialog to create new PIN
      setShowPINSetup(true);
    }

    setPinAction(null);
  };

  const isMobile = useIsMobile();

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
                <h1 className="text-lg font-semibold text-white">Account Settings</h1>
                <p className="text-xs text-white/50">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Profile Section */}
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <User className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Profile</h3>
                <p className="text-xs text-white/50">Your personal information</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-xs text-white/50 mb-1.5 block">Full Name</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your name"
                  className="h-12 bg-black/30 border-white/10 rounded-xl text-white placeholder:text-white/30"
                />
              </div>
              <div>
                <Label className="text-xs text-white/50 mb-1.5 block">Display Name</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter display name"
                  className="h-12 bg-black/30 border-white/10 rounded-xl text-white placeholder:text-white/30"
                />
              </div>
              <Button 
                className="w-full h-12 bg-blue-600 hover:bg-blue-500 rounded-xl"
                onClick={handleSaveProfile}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Profile
              </Button>
            </div>
          </div>

          {/* Security Section */}
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Shield className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Security</h3>
                <p className="text-xs text-white/50">Protect your account</p>
              </div>
            </div>

            {/* Biometric Authentication */}
            <div className="space-y-3">
              <div className="p-4 bg-black/20 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Fingerprint className="h-5 w-5 text-purple-400" />
                    <span className="text-sm font-medium text-white">Biometric</span>
                  </div>
                  {isCheckingPasskey ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white/50" />
                  ) : hasPasskey ? (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Active</Badge>
                  ) : (
                    <Badge className="bg-white/10 text-white/50">Disabled</Badge>
                  )}
                </div>
                {!passkeyAvailable ? (
                  <p className="text-xs text-white/40">Not supported on this device</p>
                ) : hasPasskey ? (
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-10 bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10 rounded-xl"
                      onClick={handleTestPasskey}
                      disabled={loading}
                    >
                      Test
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-10 bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10 rounded-xl"
                      onClick={handleUpdatePasskey}
                      disabled={loading}
                    >
                      Update
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 bg-red-500/10 border-red-500/20 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-xl"
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={loading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full mt-3 h-10 bg-purple-600 hover:bg-purple-500 rounded-xl"
                    onClick={handleRegisterPasskey}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    Setup Passkey
                  </Button>
                )}
              </div>

              {/* PIN Security */}
              <div className="p-4 bg-black/20 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Lock className="h-5 w-5 text-blue-400" />
                    <span className="text-sm font-medium text-white">Security PIN</span>
                  </div>
                  <Badge className={hasPIN ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-white/10 text-white/50"}>
                    {hasPIN ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
                <p className="text-xs text-white/40 mb-3">
                  {hasPIN ? 'PIN required for sensitive operations' : 'Add extra security with a PIN'}
                </p>
                {hasPIN ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-10 bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10 rounded-xl"
                      onClick={handleChangePIN}
                    >
                      Change
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-10 bg-red-500/10 border-red-500/20 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-xl"
                      onClick={handleDisablePIN}
                    >
                      Disable
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full h-10 bg-blue-600 hover:bg-blue-500 rounded-xl"
                    onClick={handleSetupPIN}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Setup PIN
                  </Button>
                )}
              </div>

              {/* Change Password */}
              <div className="p-4 bg-black/20 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Key className="h-5 w-5 text-orange-400" />
                    <span className="text-sm font-medium text-white">Password</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10 rounded-xl"
                    onClick={() => setChangingPassword(!changingPassword)}
                  >
                    Change
                  </Button>
                </div>
                
                {changingPassword && (
                  <div className="space-y-3 mt-4 pt-4 border-t border-white/10">
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Current password"
                      className="h-12 bg-black/30 border-white/10 rounded-xl text-white placeholder:text-white/30"
                    />
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password"
                      className="h-12 bg-black/30 border-white/10 rounded-xl text-white placeholder:text-white/30"
                    />
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="h-12 bg-black/30 border-white/10 rounded-xl text-white placeholder:text-white/30"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 h-10 bg-white/5 border-white/10 text-white/70 rounded-xl"
                        onClick={() => {
                          setChangingPassword(false);
                          setCurrentPassword('');
                          setNewPassword('');
                          setConfirmPassword('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1 h-10 bg-blue-600 hover:bg-blue-500 rounded-xl"
                        onClick={handleChangePassword}
                        disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BYOK Encryption */}
          <BYOKSettingsCard className="rounded-2xl" />

          {/* Advanced Settings Categories */}
          <div className="space-y-2">
            <div className="px-1">
              <h3 className="text-sm font-semibold text-white">Advanced Preferences</h3>
              <p className="text-xs text-white/50">Android-style categorized controls for security, data, and diagnostics.</p>
            </div>
            {renderPreferenceCategories(true)}
          </div>

          {/* Account Info */}
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Mail className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Account Info</h3>
                <p className="text-xs text-white/50">Your account details</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-black/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <Zap className="h-4 w-4 text-yellow-400" />
                  <span className="text-sm text-white/70">Account Type</span>
                </div>
                <Badge className={profile?.is_premium ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-white/10 text-white/50"}>
                  {profile?.is_premium ? 'Premium' : 'Free'}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-black/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-blue-400" />
                  <span className="text-sm text-white/70">Member Since</span>
                </div>
                <span className="text-sm text-white">{new Date(profile?.created_at).toLocaleDateString()}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-black/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <HardDrive className="h-4 w-4 text-purple-400" />
                  <span className="text-sm text-white/70">Storage Used</span>
                </div>
                <span className="text-sm text-white">{formatBytes(storageUsed)}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-black/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <Code className="h-4 w-4 text-cyan-400" />
                  <span className="text-sm text-white/70">Total Files</span>
                </div>
                <span className="text-sm text-white">{totalFiles}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Delete Passkey Dialog */}
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
                className="bg-red-600 hover:bg-red-500 text-white"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* PIN Dialogs */}
        {user && (
          <PINSetupDialog
            open={showPINSetup}
            onClose={() => setShowPINSetup(false)}
            onComplete={handlePINSetupComplete}
          />
        )}
        {user && (
          <PINAuthDialog
            open={showPINAuth}
            onClose={() => {
              setShowPINAuth(false);
              setPinAction(null);
            }}
            onSuccess={handlePINAuthSuccess}
            title={pinAction === 'disable' ? 'Verify PIN to Disable' : 'Verify Current PIN'}
            description={pinAction === 'disable' ? 'Enter your current PIN to disable' : 'Enter your current PIN'}
          />
        )}
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage your account preferences and security settings
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Profile Information */}
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-sm font-medium">Display Name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your display name"
                  className="h-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                value={user?.email || ''}
                disabled
                className="bg-muted/50 h-10"
              />
              <p className="text-xs text-muted-foreground/70">
                Email cannot be changed. Contact support if needed.
              </p>
            </div>
            <Button onClick={handleSaveProfile} size="sm">Save Changes</Button>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              Security Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Passkey Management */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Fingerprint className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">Biometric Authentication</h4>
                    <p className="text-xs text-muted-foreground">
                      Use fingerprint or Face ID to sign in
                    </p>
                  </div>
                </div>
              </div>

              {/* Device not supported */}
              {!passkeyAvailable && (
                <div className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/30">
                  <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      Your device doesn't support biometric authentication
                    </p>
                  </div>
                </div>
              )}

              {/* Loading state */}
              {isCheckingPasskey && passkeyAvailable && (
                <div className="flex items-center gap-2 p-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Checking passkey...</p>
                </div>
              )}

              {/* Passkey active */}
              {!isCheckingPasskey && passkeyAvailable && hasPasskey && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-emerald-100">
                          Passkey Active
                        </p>
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">
                          Enabled
                        </Badge>
                      </div>
                      {passkeyData?.created_at && (
                        <p className="text-xs text-emerald-400/70">
                          Registered {new Date(passkeyData.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTestPasskey}
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Fingerprint className="w-3 h-3 mr-2" />
                          Test
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleUpdatePasskey}
                      disabled={loading}
                    >
                      Update
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={loading}
                    >
                      <Trash2 className="w-3 h-3 mr-2" />
                      Remove
                    </Button>
                  </div>
                </div>
              )}

              {/* No passkey - setup option */}
              {!isCheckingPasskey && passkeyAvailable && !hasPasskey && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg border border-blue-500/20 bg-blue-500/5">
                    <Fingerprint className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-blue-100">
                        Enable biometric sign-in for faster and more secure access
                      </p>
                    </div>
                  </div>
                  
                  <Button
                    size="sm"
                    onClick={handleRegisterPasskey}
                    disabled={loading}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        Setting up...
                      </>
                    ) : (
                      <>
                        <Plus className="w-3 h-3 mr-2" />
                        Setup Passkey
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
            
            {/* PIN Security */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold">Security PIN</h4>
                  <p className="text-xs text-muted-foreground">
                    Protect sensitive actions with a PIN
                  </p>
                </div>
              </div>

              {/* PIN Status */}
              <div className="p-3.5 rounded-lg border border-border/50 bg-muted/30">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">PIN Protection</span>
                  <Badge variant={hasPIN ? "default" : "secondary"} className={hasPIN ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : ''}>
                    {hasPIN ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground/80">
                  {hasPIN 
                    ? "PIN will be required for sensitive operations"
                    : "Set up a PIN to add an extra layer of security"
                  }
                </p>
                {hasPIN && pinSettings && (
                  <div className="mt-3 pt-3 border-t border-border/40 space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      Protected operations:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {pinSettings.requirePinForVault && (
                        <Badge variant="outline" className="text-xs border-border/50">Vault</Badge>
                      )}
                      {pinSettings.requirePinForShares && (
                        <Badge variant="outline" className="text-xs border-border/50">File Sharing</Badge>
                      )}
                      {pinSettings.requirePinForSettings && (
                        <Badge variant="outline" className="text-xs border-border/50">Security Settings</Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {!hasPIN ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSetupPIN}
                    className="flex-1"
                  >
                    <Plus className="w-3 h-3 mr-2" />
                    Setup PIN
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleChangePIN}
                      className="flex-1"
                    >
                      Change PIN
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDisablePIN}
                      className="flex-1"
                    >
                      Disable PIN
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Change Password */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Key className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">Change Password</h4>
                    <p className="text-xs text-muted-foreground">Update your account password</p>
                  </div>
                </div>
                {!changingPassword && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setChangingPassword(true)}
                    disabled={user?.app_metadata?.providers?.includes('google')}
                  >
                    <Key className="w-3 h-3 mr-2" />
                    Change Password
                  </Button>
                )}
              </div>
              {changingPassword && (
                <div className="space-y-4 p-4 rounded-lg border border-border/50 bg-muted/30">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword" className="text-sm font-medium">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword" className="text-sm font-medium">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="h-10"
                    />
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setChangingPassword(false);
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleChangePassword}
                      disabled={!currentPassword || !newPassword || !confirmPassword || loading}
                    >
                      {loading ? 'Updating...' : 'Update Password'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* BYOK Encryption */}
        <BYOKSettingsCard />

        {/* Advanced categorized preferences */}
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Advanced Preferences
            </CardTitle>
            <p className="text-sm text-muted-foreground/80">
              Fine-tune your SquidCloud experience with advanced controls
            </p>
          </CardHeader>
          <CardContent>
            <div className="pt-2">
              {renderPreferenceCategories(false)}
            </div>
          </CardContent>
        </Card>

        {/* Account Information */}
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Mail className="w-4 h-4 text-primary" />
              </div>
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border/30 rounded-xl overflow-hidden">
              <div className="bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground/70 mb-0.5">Account Type</p>
                <p className="text-sm font-medium">{profile?.is_premium ? 'Premium' : 'Free'}</p>
              </div>
              <div className="bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground/70 mb-0.5">Member Since</p>
                <p className="text-sm font-medium">{new Date(profile?.created_at).toLocaleDateString()}</p>
              </div>
              <div className="bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground/70 mb-0.5">Storage Used</p>
                <p className="text-sm font-medium">{formatBytes(storageUsed)}</p>
              </div>
              <div className="bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground/70 mb-0.5">Total Files</p>
                <p className="text-sm font-medium">{totalFiles} files</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Passkey Confirmation Dialog */}
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
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePasskey}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? (
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

      {/* PIN Setup Dialog */}
      {user && (
        <PINSetupDialog
          open={showPINSetup}
          onClose={() => setShowPINSetup(false)}
          onComplete={handlePINSetupComplete}
        />
      )}

      {/* PIN Authentication Dialog */}
      {user && (
        <PINAuthDialog
          open={showPINAuth}
          onClose={() => {
            setShowPINAuth(false);
            setPinAction(null);
          }}
          onSuccess={handlePINAuthSuccess}
          title={pinAction === 'disable' ? 'Verify PIN to Disable' : 'Verify Current PIN'}
          description={
            pinAction === 'disable'
              ? 'Enter your current PIN to disable PIN authentication'
              : 'Enter your current PIN to continue'
          }
        />
      )}
    </div>
  );
};

export default AccountSettings;
