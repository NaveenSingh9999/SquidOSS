
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  Cloud, 
  FolderOpen, 
  Upload, 
  Database, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Settings,
  Play
} from '@/lib/icon-map';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import CloudFileBrowser from './CloudFileBrowser';
import UnifiedLoader from '@/components/ui/UnifiedLoader';

interface MigrationJob {
  id: string;
  source_platform: string;
  status: string;
  total_files: number;
  processed_files: number;
  failed_files: number;
  settings: any;
  error_message?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

interface MigrationWizardProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

const MigrationWizard: React.FC<MigrationWizardProps> = ({ onComplete, onCancel }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [migrationSettings, setMigrationSettings] = useState({
    maintainFolderStructure: true,
    autoEncrypt: true,
    destinationFolder: 'imported'
  });
  const [s3Credentials, setS3Credentials] = useState({
    region: '',
    accessKey: '',
    secretKey: '',
    bucketName: ''
  });
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [migrationJob, setMigrationJob] = useState<MigrationJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCloudBrowser, setShowCloudBrowser] = useState(false);
  const { toast } = useToast();

  const platforms = [
    { id: 'google-drive', name: 'Google Drive', icon: Cloud, description: 'Import from Google Drive' },
    { id: 'dropbox', name: 'Dropbox', icon: Cloud, description: 'Import from Dropbox' },
    { id: 'onedrive', name: 'OneDrive', icon: Cloud, description: 'Import from Microsoft OneDrive' },
    { id: 'local-upload', name: 'Local Files/ZIP', icon: Upload, description: 'Upload files or ZIP archives' },
    { id: 's3', name: 'AWS S3 Bucket', icon: Database, description: 'Import from S3 bucket (Dev Mode)' }
  ];

  const steps = [
    { number: 1, title: 'Choose Source', description: 'Select migration source' },
    { number: 2, title: 'Configure', description: 'Set up credentials and options' },
    { number: 3, title: 'Settings', description: 'Migration preferences' },
    { number: 4, title: 'Import', description: 'Start migration process' }
  ];

  useEffect(() => {
    // Listen for OAuth popup messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'oauth_success') {
        toast({
          title: "Authentication successful",
          description: `Connected to ${event.data.platform}`
        });
        setShowCloudBrowser(true);
        setCurrentStep(3);
      } else if (event.data.type === 'oauth_error') {
        toast({
          title: "Authentication failed",
          description: event.data.error,
          variant: "destructive"
        });
        setIsLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (migrationJob?.id) {
      const interval = setInterval(async () => {
        try {
          const { data, error } = await supabase
            .from('migration_jobs')
            .select('*')
            .eq('id', migrationJob.id)
            .single();

          if (error) throw error;
          if (data) {
            setMigrationJob(data);
            if (data.status === 'completed' || data.status === 'failed') {
              clearInterval(interval);
              if (data.status === 'completed' && onComplete) {
                setTimeout(() => onComplete(), 2000);
              }
            }
          }
        } catch (error) {
          console.error('Error updating migration status:', error);
        }
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [migrationJob?.id, onComplete]);

  const handlePlatformSelect = (platformId: string) => {
    setSelectedPlatform(platformId);
    setCurrentStep(2);
  };

  const handleOAuthLogin = async (platform: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('migration-oauth', {
        body: { platform }
      });

      if (error) {
        // Better error messages for common issues
        let errorMessage = error.message || "Failed to initiate OAuth flow";
        
        if (errorMessage.includes('client ID not configured')) {
          errorMessage = `${platform} OAuth is not configured yet. Please contact support or configure OAuth credentials in Supabase settings.`;
        } else if (errorMessage.includes('redirect_uri')) {
          errorMessage = `OAuth redirect URI mismatch. The callback URL needs to be registered with ${platform}. See OAUTH_MIGRATION_SETUP.md for setup instructions.`;
        }
        
        throw new Error(errorMessage);
      }
      
      if (data?.authUrl) {
        // Open OAuth URL in popup
        const popup = window.open(
          data.authUrl,
          'oauth',
          'width=600,height=700,scrollbars=yes,resizable=yes'
        );

        // Check if popup was blocked
        if (!popup) {
          throw new Error('Popup blocked. Please allow popups for this site and try again.');
        }

        // Store migration job data
        setMigrationJob(data.job);
      } else {
        throw new Error('No authorization URL received from server');
      }
    } catch (error: any) {
      setIsLoading(false);
      
      // Show detailed error with action button if it's a config issue
      const isConfigError = error.message?.includes('not configured') || error.message?.includes('redirect_uri');
      
      toast({
        title: "OAuth Configuration Required",
        description: isConfigError 
          ? error.message + " Check the console or documentation for setup instructions."
          : error.message || "Failed to initiate OAuth flow",
        variant: "destructive",
      });
      
      if (isConfigError) {
        console.error('OAuth Setup Required:');
        console.error('1. Go to your OAuth provider console (Google, Dropbox, or Microsoft)');
        console.error('2. Add this redirect URI:');
        console.error('   https://aouqcwbdoyrccjcrhzzi.supabase.co/functions/v1/migration-oauth-callback');
        console.error('3. Add client credentials to Supabase secrets');
        console.error('4. See OAUTH_MIGRATION_SETUP.md for detailed instructions');
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      setUploadFiles(files);
      setCurrentStep(3);
    }
  };

  const startMigration = async () => {
    setIsLoading(true);
    try {
      const migrationData = {
        source_platform: selectedPlatform,
        settings: {
          ...migrationSettings,
          ...(selectedPlatform === 's3' ? s3Credentials : {}),
          files: uploadFiles ? Array.from(uploadFiles).map(f => ({ name: f.name, size: f.size })) : []
        }
      };

      const { data, error } = await supabase.functions.invoke('start-migration', {
        body: migrationData
      });

      if (error) throw error;
      
      setMigrationJob(data.job);
      setCurrentStep(4);

      toast({
        title: "Migration Started",
        description: "Your files are being imported to SquidCloud"
      });
    } catch (error: any) {
      toast({
        title: "Migration Error",
        description: error.message || "Failed to start migration",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepContent = () => {
    if (showCloudBrowser && migrationJob) {
      return (
        <CloudFileBrowser
          jobId={migrationJob.id}
          platform={selectedPlatform}
          onImportComplete={() => {
            setShowCloudBrowser(false);
            setCurrentStep(4);
            onComplete?.();
          }}
          onBack={() => {
            setShowCloudBrowser(false);
            setCurrentStep(2);
          }}
        />
      );
    }

    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Choose Migration Source</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {platforms.map((platform) => {
                const Icon = platform.icon;
                return (
                  <Card 
                    key={platform.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => handlePlatformSelect(platform.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-3">
                        <Icon className="h-8 w-8 text-primary" />
                        <div>
                          <h4 className="font-medium">{platform.name}</h4>
                          <p className="text-sm text-muted-foreground">{platform.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Configure {platforms.find(p => p.id === selectedPlatform)?.name}</h3>
            
            {(selectedPlatform === 'google-drive' || selectedPlatform === 'dropbox' || selectedPlatform === 'onedrive') && (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Connect your {platforms.find(p => p.id === selectedPlatform)?.name} account to browse and select files to import
                </p>
                <Button 
                  onClick={() => handleOAuthLogin(selectedPlatform)} 
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? (
                    <UnifiedLoader size="small" className="mr-2" />
                  ) : (
                    <Cloud className="mr-2 h-4 w-4" />
                  )}
                  Connect to {platforms.find(p => p.id === selectedPlatform)?.name}
                </Button>
              </div>
            )}

            {selectedPlatform === 'local-upload' && (
              <div className="space-y-4">
                <p className="text-muted-foreground">Upload files, folders, or ZIP archives from your device</p>
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <div className="space-y-2">
                    <Label htmlFor="file-upload" className="cursor-pointer">
                      <span className="text-primary hover:text-primary/80">Choose files</span> or drag and drop
                    </Label>
                    <Input
                      id="file-upload"
                      type="file"
                      multiple
                      accept="*/*"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <br />
                    <Label htmlFor="folder-upload" className="cursor-pointer">
                      <span className="text-primary hover:text-primary/80">Choose folder</span>
                    </Label>
                    <input
                      id="folder-upload"
                      type="file"
                      multiple
                      accept="*/*"
                      className="hidden"
                      onChange={handleFileUpload}
                      {...({ webkitdirectory: true } as any)}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">Supports ZIP, individual files, and folders</p>
                </div>
              </div>
            )}

            {selectedPlatform === 's3' && (
              <div className="space-y-4">
                <p className="text-muted-foreground">Enter your S3 bucket credentials</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="region">Region</Label>
                    <Input
                      id="region"
                      placeholder="us-east-1"
                      value={s3Credentials.region}
                      onChange={(e) => setS3Credentials({...s3Credentials, region: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bucket">Bucket Name</Label>
                    <Input
                      id="bucket"
                      placeholder="my-bucket"
                      value={s3Credentials.bucketName}
                      onChange={(e) => setS3Credentials({...s3Credentials, bucketName: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="access-key">Access Key</Label>
                    <Input
                      id="access-key"
                      type="password"
                      placeholder="AKIA..."
                      value={s3Credentials.accessKey}
                      onChange={(e) => setS3Credentials({...s3Credentials, accessKey: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="secret-key">Secret Key</Label>
                    <Input
                      id="secret-key"
                      type="password"
                      placeholder="Secret key"
                      value={s3Credentials.secretKey}
                      onChange={(e) => setS3Credentials({...s3Credentials, secretKey: e.target.value})}
                    />
                  </div>
                </div>
                <Button 
                  onClick={() => setCurrentStep(3)} 
                  disabled={!s3Credentials.region || !s3Credentials.bucketName || !s3Credentials.accessKey || !s3Credentials.secretKey}
                >
                  <ArrowRight className="ml-2 h-4 w-4" />
                  Continue
                </Button>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Migration Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Maintain Folder Structure</Label>
                  <p className="text-sm text-muted-foreground">Keep original folder organization</p>
                </div>
                <Switch
                  checked={migrationSettings.maintainFolderStructure}
                  onCheckedChange={(checked) => 
                    setMigrationSettings({...migrationSettings, maintainFolderStructure: checked})
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-encrypt Files</Label>
                  <p className="text-sm text-muted-foreground">Encrypt files during import</p>
                </div>
                <Switch
                  checked={migrationSettings.autoEncrypt}
                  onCheckedChange={(checked) => 
                    setMigrationSettings({...migrationSettings, autoEncrypt: checked})
                  }
                />
              </div>
              <Separator />
              <div>
                <Label htmlFor="destination">Destination Folder</Label>
                <Input
                  id="destination"
                  placeholder="imported"
                  value={migrationSettings.destinationFolder}
                  onChange={(e) => 
                    setMigrationSettings({...migrationSettings, destinationFolder: e.target.value})
                  }
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrentStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={startMigration} disabled={isLoading}>
                {isLoading ? <UnifiedLoader size="small" className="mr-2" /> : <Play className="mr-2 h-4 w-4" />}
                Start Migration
              </Button>
            </div>
          </div>
        );

      case 4:
        const progress = migrationJob ? 
          migrationJob.total_files > 0 ? 
            (migrationJob.processed_files / migrationJob.total_files) * 100 : 0 
          : 0;

        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Migration Progress</h3>
            {migrationJob && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Status</span>
                  <div className="flex items-center gap-2">
                    {migrationJob.status === 'in_progress' && <UnifiedLoader size="small" />}
                    {migrationJob.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                    {migrationJob.status === 'failed' && <AlertCircle className="h-4 w-4 text-red-500" />}
                    <span className="capitalize">{migrationJob.status.replace('_', ' ')}</span>
                  </div>
                </div>
                
                <Progress value={progress} className="w-full" />
                
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold">{migrationJob.total_files}</div>
                    <div className="text-sm text-muted-foreground">Total Files</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{migrationJob.processed_files}</div>
                    <div className="text-sm text-muted-foreground">Processed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">{migrationJob.failed_files}</div>
                    <div className="text-sm text-muted-foreground">Failed</div>
                  </div>
                </div>

                {migrationJob.error_message && (
                  <div className="bg-destructive/10 text-destructive p-3 rounded-md">
                    <p className="font-medium">Error:</p>
                    <p className="text-sm">{migrationJob.error_message}</p>
                  </div>
                )}

                {migrationJob.status === 'completed' && (
                  <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 p-4 rounded-md text-center">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2" />
                    <p className="font-medium">Migration Completed Successfully!</p>
                    <p className="text-sm">Your files have been imported to SquidCloud</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Import Files to SquidCloud
        </CardTitle>
        
        {!showCloudBrowser && (
          <div className="flex items-center gap-4 mt-4">
            {steps.map((step, index) => (
              <React.Fragment key={step.number}>
                <div className={`flex items-center gap-2 ${currentStep >= step.number ? 'text-primary' : 'text-muted-foreground'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    currentStep >= step.number ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}>
                    {currentStep > step.number ? <CheckCircle className="h-4 w-4" /> : step.number}
                  </div>
                  <div className="hidden sm:block">
                    <div className="font-medium text-xs">{step.title}</div>
                    <div className="text-xs text-muted-foreground">{step.description}</div>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        {renderStepContent()}
        
        {onCancel && !showCloudBrowser && (
          <div className="mt-6 pt-4 border-t">
            <Button variant="ghost" onClick={onCancel}>
              Cancel Migration
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MigrationWizard;
