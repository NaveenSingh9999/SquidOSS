import React, { memo, useCallback, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Cloud, Key, HardDrive, Hash, CheckCircle2, Copy, ShieldCheck, AlertCircle, ExternalLink } from '@/lib/icon-map';
import { toast } from 'sonner';

interface ProviderSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: string; // 'r2', 's3', 'gcp'
  onSuccess: (providerInfo?: { id: string; providerType: string }) => void;
}

type ProviderSetupForm = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

type ProviderGuide = {
  docsUrl: string;
  endpoint: string;
  steps: string[];
  permissions: string[];
  corsTitle: string;
  corsConfig: string;
};

const TEBI_GUIDE: ProviderGuide = {
  docsUrl: 'https://docs.tebi.io',
  endpoint: 'https://s3.tebi.io',
  steps: [
    'Create a bucket in Tebi with a globally unique bucket name.',
    'Create an Access Key + Secret Key pair dedicated to SquidCloud usage.',
    'Grant bucket permissions: ListBucket, GetObject, PutObject, DeleteObject, PutBucketCors.',
    'Paste credentials below and click Verify & Connect.',
    'Upload a test file and confirm it appears in your Tebi bucket.',
  ],
  permissions: [
    's3:ListBucket',
    's3:GetObject',
    's3:PutObject',
    's3:DeleteObject',
    's3:PutBucketCors',
  ],
  corsTitle: 'S3-Compatible CORS XML (Tebi)',
  corsConfig: `<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">\n  <CORSRule>\n    <AllowedOrigin>*</AllowedOrigin>\n    <AllowedMethod>GET</AllowedMethod>\n    <AllowedMethod>PUT</AllowedMethod>\n    <AllowedMethod>POST</AllowedMethod>\n    <AllowedMethod>HEAD</AllowedMethod>\n    <AllowedHeader>*</AllowedHeader>\n    <ExposeHeader>ETag</ExposeHeader>\n    <ExposeHeader>x-amz-request-id</ExposeHeader>\n    <ExposeHeader>x-amz-id-2</ExposeHeader>\n    <MaxAgeSeconds>86400</MaxAgeSeconds>\n  </CORSRule>\n</CORSConfiguration>`,
};

const R2_GUIDE: ProviderGuide = {
  docsUrl: 'https://developers.cloudflare.com/r2/',
  endpoint: 'https://<ACCOUNT_ID>.r2.cloudflarestorage.com',
  steps: [
    'Create an R2 bucket in Cloudflare dashboard.',
    'Create an R2 API token with object read/write/list permissions.',
    'Configure bucket CORS for your app origin and localhost development ports.',
    'Save Account ID, Access Key ID, Secret Access Key and bucket name.',
    'R2 connection from this dashboard is marked coming soon while backend hardening is finalized.',
  ],
  permissions: [
    'Account: R2 Object Read',
    'Account: R2 Object Write',
    'Account: R2 Object List',
    'Bucket scope restricted to your SquidCloud bucket',
  ],
  corsTitle: 'Cloudflare R2 CORS JSON',
  corsConfig: `[\n  {\n    "AllowedOrigins": [\n      "https://squidcloud.vercel.app",\n      "http://localhost:5173",\n      "http://localhost:8080"\n    ],\n    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],\n    "AllowedHeaders": ["*"],\n    "ExposeHeaders": ["ETag", "x-amz-request-id", "x-amz-id-2"],\n    "MaxAgeSeconds": 86400\n  }\n]`,
};

const ProviderGuidePanel = memo(function ProviderGuidePanel({
  guide,
  copiedKey,
  onCopy,
}: {
  guide: ProviderGuide;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/25 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Setup Checklist
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Complete every step to avoid CORS, signature, and permission errors.
          </p>
        </div>
        <a
          href={guide.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Docs
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <ol className="space-y-1.5 text-xs text-foreground/90 list-decimal pl-4">
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className="rounded-lg border border-border/60 bg-background/70 p-2.5">
        <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Endpoint</p>
        <p className="mt-1 text-xs font-mono break-all">{guide.endpoint}</p>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-1">Required Permissions</p>
        <div className="flex flex-wrap gap-1.5">
          {guide.permissions.map((permission) => (
            <span
              key={permission}
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] font-mono"
            >
              {permission}
            </span>
          ))}
        </div>
      </div>

      <Accordion type="single" collapsible className="rounded-lg border border-border/60 bg-background/80 px-2">
        <AccordionItem value="cors" className="border-none">
          <AccordionTrigger className="py-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground hover:no-underline">
            {guide.corsTitle}
          </AccordionTrigger>
          <AccordionContent className="pb-2 pt-0">
            <div className="mb-2 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onCopy('cors', guide.corsConfig)}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                {copiedKey === 'cors' ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <pre className="max-h-40 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] leading-4">
              {guide.corsConfig}
            </pre>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Use dedicated keys only for this bucket and rotate them periodically. Keep your secret key private.
        </p>
      </div>
    </div>
  );
});

ProviderGuidePanel.displayName = 'ProviderGuidePanel';

export default function ProviderSetupModal({ isOpen, onClose, provider, onSuccess }: ProviderSetupModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProviderSetupForm>({
    accountId: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: ''
  });

  const isProviderConnectEnabled = provider !== 'r2';

  const providerName = useMemo(() => {
    switch(provider) {
      case 'r2': return 'Cloudflare R2';
      case 's3': return 'AWS S3';
      case 'gcp': return 'Google Cloud Storage';
      case 'tebi': return 'Tebi.io';
      default: return 'Custom Provider';
    }
  }, [provider]);

  const requiredFieldCount = provider === 'r2' ? 4 : 3;
  const completedFieldCount = useMemo(() => {
    const base = [formData.accessKeyId, formData.secretAccessKey, formData.bucketName]
      .filter((value) => value.trim().length > 0)
      .length;
    if (provider === 'r2' && formData.accountId.trim()) {
      return base + 1;
    }
    return base;
  }, [formData, provider]);

  const isSubmitDisabled = useMemo(() => {
    return (
      isLoading
      || !isProviderConnectEnabled
      || !formData.accessKeyId.trim()
      || !formData.secretAccessKey.trim()
      || !formData.bucketName.trim()
      || (provider === 'r2' && !formData.accountId.trim())
    );
  }, [formData, isLoading, isProviderConnectEnabled, provider]);

  const updateField = useCallback((field: keyof ProviderSetupForm, value: string) => {
    setFormData((prev) => {
      if (prev[field] === value) {
        return prev;
      }
      return { ...prev, [field]: value };
    });
  }, []);

  const handleVerifyAndSave = async () => {
    if (!isProviderConnectEnabled) {
      toast.info('Cloudflare R2 frontend integration is coming soon. Tebi setup is available now.');
      return;
    }

    try {
      setIsLoading(true);
      
      // 1. Verify with Edge Function
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-provider', {
        body: {
          ...formData,
          providerType: provider
        }
      });

      if (verifyError || !verifyData?.success) {
        throw new Error(verifyError?.message || verifyData?.error || 'Verification failed. Please check your credentials.');
      }

      toast.success('Connection verified successfully!');

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('User not authenticated');

      const { data: storedData, error: storeError } = await supabase.functions.invoke('store-provider', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: {
          providerType: provider,
          ...formData,
        },
      });

      if (storeError || !storedData?.success) {
        throw new Error(storeError?.message || storedData?.error || 'Failed to store provider credentials');
      }

      const savedProvider = storedData.provider as { id: string; provider_type: string } | undefined;

      toast.success(`${providerName} integration complete!`);
      onSuccess(savedProvider ? { id: savedProvider.id, providerType: savedProvider.provider_type } : undefined);
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to setup provider');
    } finally {
      setIsLoading(false);
    }
  };

  const guide = useMemo(() => (provider === 'tebi' ? TEBI_GUIDE : R2_GUIDE), [provider]);

  const copyValue = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(current => (current === key ? null : current)), 1800);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Copy failed. Please copy manually.');
    }
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isLoading) onClose(); }}>
      <DialogContent className="left-0 right-0 top-0 bottom-0 translate-x-0 translate-y-0 max-w-none w-screen h-[100dvh] max-h-[100dvh] rounded-none border-0 p-0 sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:right-auto sm:translate-x-[-50%] sm:translate-y-[-50%] sm:w-[calc(100vw-1.5rem)] sm:h-auto sm:max-h-[92vh] sm:max-w-[880px] sm:rounded-[20px] sm:border [&>button]:right-3 [&>button]:top-3 sm:[&>button]:right-4 sm:[&>button]:top-4">
        <div className="flex h-full max-h-[100dvh] sm:max-h-[92vh] flex-col">
          <DialogHeader className="border-b border-border/50 px-4 pb-4 pt-5 pr-12 sm:px-6 sm:pr-14">
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-primary" />
              Setup {providerName}
            </DialogTitle>
            <DialogDescription>
              Enter your {providerName} credentials to enable Bring Your Own Storage (BYOS).
              {provider === 'r2' && " You can find these in your Cloudflare Dashboard under R2 > Manage R2 API Tokens."}
              {provider === 'tebi' && " You can find these in your Tebi.io Dashboard under Access Keys."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <ProviderGuidePanel guide={guide} copiedKey={copiedKey} onCopy={copyValue} />

              <div className="space-y-4">
                <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                  <p className="text-xs font-semibold">Credential Status</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {completedFieldCount}/{requiredFieldCount} required fields completed
                  </p>
                </div>

                <div className="grid gap-4">
                {provider === 'r2' && (
                  <div className="grid gap-2">
                    <Label htmlFor="accountId" className="flex items-center gap-2">
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      Account ID
                    </Label>
                    <Input 
                      id="accountId" 
                      placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j" 
                      value={formData.accountId}
                      autoCapitalize="off"
                      autoCorrect="off"
                      autoComplete="off"
                      onChange={(e) => updateField('accountId', e.target.value)}
                    />
                  </div>
                )}
                
                <div className="grid gap-2">
                  <Label htmlFor="accessKeyId" className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    Access Key ID
                  </Label>
                  <Input 
                    id="accessKeyId" 
                    placeholder="Enter your Access Key" 
                    value={formData.accessKeyId}
                      autoCapitalize="off"
                      autoCorrect="off"
                      autoComplete="off"
                      onChange={(e) => updateField('accessKeyId', e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="secretAccessKey" className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    Secret Access Key
                  </Label>
                  <Input 
                    id="secretAccessKey" 
                    type="password"
                    placeholder="Enter your Secret Key" 
                    value={formData.secretAccessKey}
                      autoCapitalize="off"
                      autoCorrect="off"
                      autoComplete="new-password"
                      onChange={(e) => updateField('secretAccessKey', e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="bucketName" className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    Bucket Name
                  </Label>
                  <Input 
                    id="bucketName" 
                    placeholder="e.g. my-cloudbliss-bucket" 
                    value={formData.bucketName}
                      autoCapitalize="off"
                      autoCorrect="off"
                      autoComplete="off"
                      onChange={(e) => updateField('bucketName', e.target.value)}
                  />
                </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 border-t border-border/50 bg-background/95 px-4 py-4 sm:flex-row sm:gap-0 sm:px-6">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
            <Button
              onClick={handleVerifyAndSave}
              disabled={isSubmitDisabled}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {isProviderConnectEnabled ? 'Verify & Connect' : 'Coming Soon'}
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
