import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Share2, Copy, Check, X, UserPlus, Globe, Lock, Users, Loader2, Eye, Download, Mail } from '@/lib/icon-map';
import { useToast } from '@/hooks/use-toast';
import { usePINAuthContext } from '@/contexts/PINAuthContext';
import { createFileShare, revokeFileShare, getFileShareId } from '@/lib/api';
import { buildPublicUrl } from '@/lib/appLinks';

interface EnhancedShareDialogProps {
  open: boolean;
  onClose: () => void;
  onShareChange?: () => void;
  file: {
    id: string;
    name: string;
    type?: string;
  };
}

export const EnhancedShareDialog: React.FC<EnhancedShareDialogProps> = ({
  open,
  onClose,
  onShareChange,
  file
}) => {
  const { toast } = useToast();
  const { verifyOperationNow } = usePINAuthContext();
  const [shareType, setShareType] = useState<'public' | 'user_specific'>('public');
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [requirePassword, setRequirePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [downloadLimit, setDownloadLimit] = useState<number>(0);
  const [viewOnly, setViewOnly] = useState(false);
  const [requireEmail, setRequireEmail] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isShared, setIsShared] = useState(false);

  useEffect(() => {
    const checkExistingShare = async () => {
      if (!open || !file || file.type === 'folder') return;

      try {
        const existingShareId = await getFileShareId(file.id);
        if (existingShareId) {
          setIsShared(true);
          const shareUrl = buildPublicUrl(`/s/${existingShareId}`);
          setShareLink(shareUrl);
        } else {
          setIsShared(false);
          setShareLink('');
        }
      } catch (error) {
        console.error('Error checking share status:', error);
      }
    };

    checkExistingShare();
  }, [open, file]);

  const addEmail = () => {
    const email = emailInput.trim();
    if (!email) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    if (allowedEmails.includes(email)) {
      toast({
        title: "Email already added",
        variant: "destructive",
      });
      return;
    }

    setAllowedEmails([...allowedEmails, email]);
    setEmailInput('');
  };

  const removeEmail = (email: string) => {
    setAllowedEmails(allowedEmails.filter(e => e !== email));
  };

  const handleCreateShare = async () => {
    if (file.type === 'folder') {
      toast({
        title: "Folder sharing restricted",
        description: "Folder sharing is currently updating to the Res54 protocol. Please share files individually.",
        variant: "destructive"
      });
      return;
    }

    const authorized = await verifyOperationNow('create_share');
    if (!authorized) {
      toast({
        title: "PIN required",
        description: "PIN verification is required to create a share",
        variant: "destructive",
      });
      return;
    }

    await executeCreateShare();
  };

  const executeCreateShare = async () => {
    if (file.type === 'folder') {
      toast({
        title: "Folder sharing restricted",
        description: "Folder sharing is currently updating to the Res54 protocol. Please share files individually.",
        variant: "destructive"
      });
      return;
    }

    if (shareType === 'user_specific' && allowedEmails.length === 0) {
      toast({
        title: "No users specified",
        description: "Please add at least one email address",
        variant: "destructive",
      });
      return;
    }

    if (requirePassword && !password.trim()) {
      toast({
        title: "Password required",
        description: "Please enter a password for this share",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const result = await createFileShare(file.id, {
        shareType,
        allowedUsers: shareType === 'user_specific' ? allowedEmails : undefined,
        expiresAt: expiresAt || undefined,
        accessCode: requirePassword ? password : undefined,
        downloadLimit: downloadLimit > 0 ? downloadLimit : undefined,
        viewOnly: viewOnly || undefined,
        requireEmail: requireEmail || undefined,
      });

      if (result.shareUrl) {
        setShareLink(result.shareUrl);
        setIsShared(true);
        navigator.clipboard.writeText(result.shareUrl);
        toast({
          title: "Share link copied",
          description: "Your link has been copied",
        });
        if (onShareChange) onShareChange();
      }
    } catch (error: any) {
      console.error('Error creating share:', error);
      toast({
        title: "Failed to create share",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeShare = async () => {
    if (file.type === 'folder') {
      toast({
        title: "Folder sharing restricted",
        description: "Folder sharing is currently updating to the Res54 protocol.",
        variant: "destructive"
      });
      return;
    }
    const authorized = await verifyOperationNow('revoke_share');
    if (!authorized) {
      toast({
        title: "PIN required",
        description: "PIN verification is required to revoke sharing",
        variant: "destructive",
      });
      return;
    }

    await executeRevokeShare();
  };

  const executeRevokeShare = async () => {
    setLoading(true);
    try {
      await revokeFileShare(file.id);
      setShareLink('');
      setIsShared(false);
      if (onShareChange) onShareChange();
      toast({
        title: "Share revoked",
        description: "The share link has been disabled",
      });
    } catch (error: any) {
      console.error('Error revoking share:', error);
      toast({
        title: "Failed to revoke share",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    toast({
      title: "Copied to clipboard",
      description: "Share link has been copied",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setShareLink('');
    setShareType('public');
    setAllowedEmails([]);
    setEmailInput('');
    setExpiresIn(null);
    setRequirePassword(false);
    setPassword('');
    setDownloadLimit(0);
    setViewOnly(false);
    setRequireEmail(false);
    setCopied(false);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          className="sm:max-w-lg"
          onInteractOutside={(e) => {
            if (e.target instanceof Element && e.target.closest('[role="region"]')) {
              e.preventDefault();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5" />
              Share "{file.name}"
            </DialogTitle>
            <DialogDescription>
              Create a secure share link for this file
            </DialogDescription>
          </DialogHeader>

          {!shareLink ? (
            <div className="space-y-4">
              {/* Share Type */}
              <div className="space-y-3">
                <Label>Who can access</Label>
                <RadioGroup value={shareType} onValueChange={(value: any) => setShareType(value)}>
                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                    <RadioGroupItem value="public" id="public" />
                    <Label htmlFor="public" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        <span className="font-medium">Anyone with the link</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Anyone who has the link can view this file</p>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                    <RadioGroupItem value="user_specific" id="user_specific" />
                    <Label htmlFor="user_specific" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span className="font-medium">Specific people</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Only specified users can access</p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* User-specific emails */}
              {shareType === 'user_specific' && (
                <div className="space-y-2">
                  <Label>Add people</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter email address"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addEmail()}
                    />
                    <Button onClick={addEmail} size="sm">
                      <UserPlus className="w-4 h-4" />
                    </Button>
                  </div>
                  {allowedEmails.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {allowedEmails.map((email) => (
                        <Badge key={email} variant="secondary" className="gap-1">
                          {email}
                          <X
                            className="w-3 h-3 cursor-pointer"
                            onClick={() => removeEmail(email)}
                          />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Expiration */}
              <div className="space-y-2">
                <Label>Link expiration</Label>
                <RadioGroup
                  value={expiresIn?.toString() || 'never'}
                  onValueChange={(value) => setExpiresIn(value === 'never' ? null : parseInt(value))}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="never" id="never" />
                    <Label htmlFor="never">Never</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="1" id="1day" />
                    <Label htmlFor="1day">1 day</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="7" id="7days" />
                    <Label htmlFor="7days">7 days</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="30" id="30days" />
                    <Label htmlFor="30days">30 days</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Password protection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Password protection</Label>
                  <Switch
                    checked={requirePassword}
                    onCheckedChange={setRequirePassword}
                  />
                </div>
                {requirePassword && (
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </div>

              {/* Download limit */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Download limit
                  </Label>
                  <Switch
                    checked={downloadLimit > 0}
                    onCheckedChange={(v) => setDownloadLimit(v ? 10 : 0)}
                  />
                </div>
                {downloadLimit > 0 && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={downloadLimit}
                      onChange={(e) => setDownloadLimit(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">max downloads</span>
                  </div>
                )}
              </div>

              {/* View only */}
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  View only (no download)
                </Label>
                <Switch
                  checked={viewOnly}
                  onCheckedChange={setViewOnly}
                />
              </div>

              {/* Require email */}
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Collect email from viewers
                </Label>
                <Switch
                  checked={requireEmail}
                  onCheckedChange={setRequireEmail}
                />
              </div>

              <Button
                onClick={handleCreateShare}
                className="w-full"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating share...
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 mr-2" />
                    Create share link
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-green-900 dark:text-green-100">
                    Share link created
                  </span>
                </div>
                <p className="text-sm text-green-700 dark:text-green-300">
                  Anyone with this link can {shareType === 'user_specific' ? 'access this file (if authorized)' : 'view and download this file'}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Share link</Label>
                <div className="flex gap-2">
                  <Input value={shareLink} readOnly className="font-mono text-sm" />
                  <Button onClick={copyToClipboard} size="sm" variant="outline">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {shareType === 'user_specific' && allowedEmails.length > 0 && (
                <div className="space-y-2">
                  <Label>Shared with</Label>
                  <div className="flex flex-wrap gap-2">
                    {allowedEmails.map((email) => (
                      <Badge key={email} variant="secondary">
                        {email}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={handleRevokeShare} variant="destructive" className="flex-1" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Revoking...
                    </>
                  ) : (
                    'Revoke share'
                  )}
                </Button>
                <Button onClick={handleClose} variant="outline" className="flex-1">
                  Done
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </>
  );
};
