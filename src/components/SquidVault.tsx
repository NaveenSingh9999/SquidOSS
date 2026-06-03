import React, { useState, useEffect } from 'react';
import { Shield, Lock, Fingerprint, X, Eye, EyeOff, CheckCircle2, Loader2 } from '@/lib/icon-map';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { backgroundUploadService } from '@/services/backgroundUpload';

interface SquidVaultProps {
  userId: string;
  onVaultOpen: () => void;
  onClose?: () => void;
}

interface VaultData {
  id: string;
  user_id: string;
  name: string;
  passkey_credential_id: string | null;
  created_at: string;
}

const SquidVault: React.FC<SquidVaultProps> = ({ userId, onVaultOpen, onClose }) => {
  const [isOpen, setIsOpen] = useState(true); // Open by default when component mounts
  const [isFirstTime, setIsFirstTime] = useState(true);
  const [vaultData, setVaultData] = useState<VaultData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  
  // Form states
  const [vaultName, setVaultName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fingerprintAvailable, setFingerprintAvailable] = useState(false);
  const [useFingerprintAuth, setUseFingerprintAuth] = useState(false);
  const [passkeyCredentialId, setPasskeyCredentialId] = useState<string | null>(null);
  const [hasPasskey, setHasPasskey] = useState(false);
  
  const { toast } = useToast();

  // Check if vault already exists
  useEffect(() => {
    checkVaultExists();
    checkFingerprintAvailability();
  }, [userId]);

  // Auto-trigger passkey prompt when vault opens if passkey is available
  useEffect(() => {
    if (!isFirstTime && hasPasskey && fingerprintAvailable && isOpen) {
      // Small delay to let UI render first
      const timer = setTimeout(() => {
        handleFingerprintAuth();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isFirstTime, hasPasskey, fingerprintAvailable, isOpen]);

  const checkVaultExists = async () => {
    try {
      const { data, error } = await supabase
        .from('vaults')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (data && !error) {
        setVaultData(data as VaultData);
        setIsFirstTime(false);
        
        // Check if vault has passkey registered
        if (data.passkey_credential_id) {
          setHasPasskey(true);
          setPasskeyCredentialId(data.passkey_credential_id);
        }
      } else {
        setIsFirstTime(true);
      }
    } catch (error) {
      console.error('Error checking vault:', error);
      setIsFirstTime(true);
    }
  };

  const checkFingerprintAvailability = async () => {
    // Check if device supports biometric authentication
    if (window.PublicKeyCredential) {
      try {
        const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        setFingerprintAvailable(available);
      } catch (error) {
        console.error('Fingerprint check failed:', error);
        setFingerprintAvailable(false);
      }
    }
  };

  const registerPasskey = async (vaultId: string): Promise<string | null> => {
    try {
      if (!fingerprintAvailable) return null;

      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge: challenge,
        rp: {
          name: "CloudBliss SquidVault",
          id: window.location.hostname,
        },
        user: {
          id: new TextEncoder().encode(userId),
          name: vaultName,
          displayName: vaultName,
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" }, // ES256
          { alg: -257, type: "public-key" }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
        timeout: 60000,
        attestation: "none"
      };

      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions
      }) as PublicKeyCredential;

      if (credential) {
        const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
        
        // Store credential ID in database
        await supabase
          .from('vaults')
          .update({ passkey_credential_id: credentialId })
          .eq('id', vaultId);

        return credentialId;
      }
    } catch (error: any) {
      if (error.name !== 'NotAllowedError') {
        toast({
          title: "Passkey setup failed",
          description: "You can still use password authentication",
        });
      }
    }
    return null;
  };

  const handleCreateVault = async () => {
    // Validation
    if (!vaultName.trim()) {
      toast({
        title: "Vault name required",
        description: "Please enter a name for your vault",
        variant: "destructive",
      });
      return;
    }

    if (!password) {
      toast({
        title: "Password required",
        description: "Please enter a password for your vault",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords match",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters long",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Create vault in database
      const { data, error } = await supabase
        .from('vaults')
        .insert({
          user_id: userId,
          name: vaultName.trim(),
          password_hash: await hashPassword(password), // You'll need to implement this
        })
        .select()
        .single();

      if (error) throw error;

      setVaultData(data);
      setIsFirstTime(false);

      // Register passkey if available
      if (fingerprintAvailable) {
        toast({
          title: "Setting up biometric...",
          description: "Please scan your fingerprint or use Face ID",
        });
        
        const credId = await registerPasskey(data.id);
        if (credId) {
          setPasskeyCredentialId(credId);
          setHasPasskey(true);
          toast({
            title: "Biometric setup complete! ✓",
            description: "You can now use fingerprint to unlock your vault",
          });
        }
      }

      // Show success animation and open vault
      setShowAnimation(true);
      
      toast({
        title: "Vault created successfully! 🎉",
        description: `Welcome to ${vaultName}`,
      });

      // Auto-open vault after animation
      setTimeout(() => {
        onVaultOpen();
      }, 2000);
      
    } catch (error: any) {
      toast({
        title: "Failed to create vault",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenVault = async () => {
    if (!password && !useFingerprintAuth) {
      toast({
        title: "Password required",
        description: "Please enter your vault password",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Verify password
      const { data, error } = await supabase
        .from('vaults')
        .select('password_hash')
        .eq('user_id', userId)
        .single();

      if (error) throw error;

      const isValid = await verifyPassword(password, data.password_hash || '');
      
      if (!isValid) {
        toast({
          title: "Invalid password",
          description: "The password you entered is incorrect",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Show opening animation
      setShowAnimation(true);
      
      setTimeout(() => {
        setIsOpen(false);
        onVaultOpen();
        setShowAnimation(false);
      }, 1500);
      
    } catch (error: any) {
      toast({
        title: "Failed to open vault",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFingerprintAuth = async () => {
    try {
      if (!fingerprintAvailable || !hasPasskey) {
        toast({
          title: "Biometric unavailable",
          description: hasPasskey ? "Your device doesn't support biometric authentication" : "Please set up passkey first",
          variant: "destructive",
        });
        return;
      }

      setIsLoading(true);
      
      toast({
        title: "Biometric authentication",
        description: "Place your finger on the sensor or use Face ID",
      });

      // Create authentication challenge
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      // Convert credential ID from base64
      const credentialId = Uint8Array.from(atob(passkeyCredentialId || ''), c => c.charCodeAt(0));

      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge: challenge,
        allowCredentials: [{
          id: credentialId,
          type: 'public-key',
          transports: ['internal'],
        }],
        timeout: 60000,
        userVerification: "required"
      };

      const credential = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions
      }) as PublicKeyCredential;

      if (credential) {
        // Biometric authentication successful - open vault directly
        setShowAnimation(true);
        
        toast({
          title: "Authentication successful! ✓",
          description: "Opening your vault...",
        });

        setTimeout(() => {
          setIsOpen(false);
          onVaultOpen();
          setShowAnimation(false);
        }, 1500);
      }
    } catch (error: any) {
      
      if (error.name === 'NotAllowedError') {
        toast({
          title: "Authentication cancelled",
          description: "Biometric authentication was cancelled",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Authentication failed",
          description: "Please try again or use password",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Helper functions (you'll need to implement these with proper crypto)
  const hashPassword = async (password: string): Promise<string> => {
    // Implement proper password hashing (e.g., using bcrypt or crypto API)
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
    const inputHash = await hashPassword(password);
    return inputHash === hash;
  };

  return (
    <>
      {/* Apple Intelligence-like Animation Overlay */}
      {showAnimation && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none overflow-hidden">
          {/* Gradient orb background - Apple Intelligence style */}
          <div 
            className="absolute inset-0"
            style={{
              animation: 'orbAppear 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              willChange: 'opacity',
            }}
          >
            {/* Multi-layer gradient orbs */}
            <div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-0"
              style={{
                background: 'radial-gradient(circle, rgba(99, 102, 241, 0.4) 0%, transparent 70%)',
                animation: 'orbPulse 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards',
                filter: 'blur(40px)',
                willChange: 'transform, opacity',
                transform: 'translate3d(-50%, -50%, 0)',
              }}
            />
            <div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-0"
              style={{
                background: 'radial-gradient(circle, rgba(168, 85, 247, 0.4) 0%, transparent 70%)',
                animation: 'orbPulse 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards',
                filter: 'blur(60px)',
                willChange: 'transform, opacity',
                transform: 'translate3d(-50%, -50%, 0)',
              }}
            />
            <div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-0"
              style={{
                background: 'radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, transparent 70%)',
                animation: 'orbPulse 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards',
                filter: 'blur(50px)',
                willChange: 'transform, opacity',
                transform: 'translate3d(-50%, -50%, 0)',
              }}
            />
          </div>

          {/* Content */}
          <div 
            className="relative z-10 flex flex-col items-center opacity-0"
            style={{
              animation: 'contentFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards',
              willChange: 'opacity',
            }}
          >
            {/* Animated Shield Icon */}
            <div 
              className="relative mb-6"
              style={{
                animation: 'iconScale 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.4s forwards',
                transform: 'scale3d(0, 0, 1)',
                willChange: 'transform',
              }}
            >
              <Shield className="w-24 h-24 text-white drop-shadow-lg" />
              {/* Glow effect */}
              <div 
                className="absolute inset-0 -z-10"
                style={{
                  background: 'radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, transparent 70%)',
                  filter: 'blur(20px)',
                  animation: 'glowPulse 2s ease-in-out infinite',
                  willChange: 'opacity',
                }}
              />
            </div>
            
            <div 
              className="text-center text-white opacity-0"
              style={{
                animation: 'textSlideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.5s forwards',
                willChange: 'transform, opacity',
              }}
            >
              <h2 className="text-4xl font-semibold mb-2 tracking-tight">
                {isFirstTime ? 'Welcome to SquidVault' : 'Opening SquidVault'}
              </h2>
              <p className="text-lg opacity-80 font-light">
                {isFirstTime ? 'Your secure private space' : vaultData?.name}
              </p>
            </div>

            {/* Minimal wave indicator - Apple style */}
            <div 
              className="flex gap-1.5 mt-8 opacity-0"
              style={{
                animation: 'waveAppear 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.6s forwards',
              }}
            >
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 h-4 bg-white/60 rounded-full"
                  style={{
                    animation: `waveBar 1.2s cubic-bezier(0.45, 0, 0.55, 1) ${i * 0.08}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Backdrop blur that fades in/out */}
          <div 
            className="absolute inset-0 backdrop-blur-3xl -z-10"
            style={{
              animation: 'backdropFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
            }}
          />
        </div>
      )}

      {/* Vault Setup/Login Modal - Proper z-index to not block uploads */}
      {isOpen && !showAnimation && (
        <div className="w-full h-full">
          <Card 
            className="w-full shadow-2xl border-2 border-blue-500/20"
            style={{
              animation: 'modalSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}
          >
            <CardContent className="p-4 sm:p-6">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-blue-500" />
                <h2 className="text-xl sm:text-2xl font-bold">
                  {isFirstTime ? 'Create SquidVault' : 'Open SquidVault'}
                </h2>
              </div>
              {onClose && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-full hover:bg-red-500/10"
                  onClick={onClose}
                >
                  <X className="w-4 h-4 text-muted-foreground hover:text-red-500" />
                </Button>
              )}
            </div>

              <div className="space-y-4">
                {isFirstTime ? (
                  <>
                    {/* Vault Name Input */}
                    <div className="space-y-2">
                      <Label htmlFor="vaultName">Vault Name</Label>
                      <Input
                        id="vaultName"
                        placeholder="My Private Vault"
                        value={vaultName}
                        onChange={(e) => setVaultName(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>

                    {/* Password Input */}
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Enter a strong password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={isLoading}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    {/* Confirm Password Input */}
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <Input
                        id="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Re-enter your password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>

                    {/* Fingerprint Option */}
                    {fingerprintAvailable && (
                      <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                        <Fingerprint className="w-5 h-5 text-blue-500" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Fingerprint Available</p>
                          <p className="text-xs text-muted-foreground">
                            You can use fingerprint for faster access
                          </p>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-blue-500" />
                      </div>
                    )}

                    <Button
                      onClick={handleCreateVault}
                      disabled={isLoading}
                      className="w-full"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Shield className="w-4 h-4 mr-2" />
                          Create Vault
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-center py-4">
                      <Shield className="w-16 h-16 mx-auto mb-4 text-blue-500" />
                      <h3 className="text-xl font-semibold mb-2">{vaultData?.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {hasPasskey && fingerprintAvailable 
                          ? 'Use passkey or enter password' 
                          : 'Enter your password to access'}
                      </p>
                      {hasPasskey && fingerprintAvailable && (
                        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Passkey enabled</span>
                        </div>
                      )}
                    </div>

                    {/* Sign in with Passkey - Show prominently if available */}
                    {hasPasskey && fingerprintAvailable && (
                      <div className="space-y-3">
                        <Button
                          onClick={handleFingerprintAuth}
                          disabled={isLoading}
                          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
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
                        
                        <div className="relative">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">Or use password</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Password Input */}
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Enter your vault password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={isLoading}
                          onKeyPress={(e) => e.key === 'Enter' && handleOpenVault()}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    <Button
                      onClick={handleOpenVault}
                      disabled={isLoading}
                      className="w-full"
                      variant={hasPasskey ? "outline" : "default"}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Opening...
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 mr-2" />
                          {hasPasskey ? "Open with Password" : "Open Vault"}
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Apple Intelligence-style animations */}
      <style>{`
        /* Orb appear animation */
        @keyframes orbAppear {
          0% {
            opacity: 0;
            transform: scale(0.8);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        /* Orb pulse animation */
        @keyframes orbPulse {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }

        /* Content fade in */
        @keyframes contentFadeIn {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }

        /* Icon scale with spring */
        @keyframes iconScale {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          60% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        /* Text slide up */
        @keyframes textSlideUp {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Wave appear */
        @keyframes waveAppear {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Wave bar animation - smooth and subtle */
        @keyframes waveBar {
          0%, 100% {
            transform: scaleY(1);
            opacity: 0.6;
          }
          50% {
            transform: scaleY(2.5);
            opacity: 1;
          }
        }

        /* Glow pulse */
        @keyframes glowPulse {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.6;
          }
        }

        /* Backdrop fade */
        @keyframes backdropFade {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }

        /* Modal slide in - Apple style */
        @keyframes modalSlideIn {
          0% {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </>
  );
};

export default SquidVault;
