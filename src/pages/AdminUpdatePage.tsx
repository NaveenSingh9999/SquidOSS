
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Checkbox } from '@/components/ui/checkbox';

const AdminUpdatePage = () => {
  const { os } = useParams<{ os: string }>();
  const { toast } = useToast();
  const [version, setVersion] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [changelog, setChangelog] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [isMandatory, setIsMandatory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }
      
      try {
        // Get the current session
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        
        if (!accessToken) {
          console.error('No access token available');
          setIsLoading(false);
          return;
        }
        
        const { data, error } = await supabase.functions.invoke('verify-admin', {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });
        
        if (error) {
          console.error('Error checking admin status:', error);
          toast({
            title: "Error",
            description: "Failed to verify admin status",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }
        
        setIsAdmin(!!data?.verified);
      } catch (error) {
        console.error('Error checking admin status:', error);
        toast({
          title: "Error",
          description: "Failed to verify admin status",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAdminStatus();
  }, [user, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!version || !downloadUrl || !changelog) {
      toast({
        title: "Missing Information",
        description: "Version, download URL, and changelog are required.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('add-app-update', {
        body: {
          version,
          platform: os,
          changelog,
          download_url: downloadUrl,
          size: fileSize ? parseInt(fileSize, 10) : 0,
          is_mandatory: isMandatory
        },
      });
      
      if (error) {
        throw error;
      }
      
      toast({
        title: "Update Added",
        description: `Version ${version} added successfully for ${getOSName()}.`,
      });
      
      // Reset form
      setVersion('');
      setDownloadUrl('');
      setChangelog('');
      setFileSize('');
      setIsMandatory(false);
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add update.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getOSName = () => {
    switch(os?.toLowerCase()) {
      case 'windows': return 'Windows';
      case 'macos': return 'macOS';
      case 'android': return 'Android';
      default: return 'Unknown OS';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-10">
        <Card>
          <CardHeader>
            <CardTitle>Checking permissions...</CardTitle>
            <CardDescription>Please wait while we verify your access.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-10">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You don't have permission to access this page.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <Card>
        <CardHeader>
          <CardTitle>Add {getOSName()} App Update</CardTitle>
          <CardDescription>Publish a new update for {getOSName()} users</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                placeholder="1.0.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="downloadUrl">Download URL</Label>
              <Input
                id="downloadUrl"
                placeholder="https://example.com/download"
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="changelog">Changelog</Label>
              <Textarea
                id="changelog"
                placeholder="What's new in this version..."
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                rows={5}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fileSize">File Size (bytes)</Label>
              <Input
                id="fileSize"
                type="number"
                placeholder="File size in bytes"
                value={fileSize}
                onChange={(e) => setFileSize(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Optional: Enter the file size in bytes</p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="isMandatory" 
                checked={isMandatory}
                onCheckedChange={(checked) => setIsMandatory(checked === true)}
              />
              <Label htmlFor="isMandatory" className="cursor-pointer">Mandatory Update</Label>
            </div>
            
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Publishing...' : 'Publish Update'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminUpdatePage;
