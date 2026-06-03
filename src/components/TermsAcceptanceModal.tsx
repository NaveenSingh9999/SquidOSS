
import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FileText, Shield } from '@/lib/icon-map';
import { Link } from 'react-router-dom';

const CURRENT_TERMS_VERSION = '1.0';
const CURRENT_PRIVACY_VERSION = '1.0';

const TermsAcceptanceModal = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && profile) {
      checkTermsAcceptance();
    }
  }, [user, profile]);

  const checkTermsAcceptance = async () => {
    try {
      console.log('Checking terms acceptance for user:', user?.id);
      
      // Check if user has accepted current versions
      const { data: acceptanceRecord, error } = await supabase
        .from('user_terms_acceptance' as any)
        .select('*')
        .eq('user_id', user?.id)
        .eq('terms_version', CURRENT_TERMS_VERSION)
        .eq('privacy_version', CURRENT_PRIVACY_VERSION)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking terms acceptance:', error);
        return;
      }

      console.log('Terms acceptance record:', acceptanceRecord);
      
      // Show modal if user hasn't accepted current versions
      if (!acceptanceRecord) {
        console.log('No acceptance record found, showing modal');
        setShowModal(true);
      }
    } catch (error) {
      console.error('Error in checkTermsAcceptance:', error);
    }
  };

  const handleAccept = async () => {
    if (!acceptedTerms || !acceptedPrivacy) {
      toast({
        variant: "destructive",
        title: "Acceptance Required",
        description: "You must accept both Terms of Service and Privacy Policy to continue.",
      });
      return;
    }

    setLoading(true);
    try {
      console.log('Saving terms acceptance for user:', user?.id);
      
      const { error } = await supabase
        .from('user_terms_acceptance' as any)
        .upsert({
          user_id: user?.id,
          terms_version: CURRENT_TERMS_VERSION,
          privacy_version: CURRENT_PRIVACY_VERSION,
          accepted_at: new Date().toISOString(),
          ip_address: null,
        });

      if (error) {
        console.error('Error saving terms acceptance:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to save acceptance. Please try again.",
        });
        return;
      }

      console.log('Terms acceptance saved successfully');
      setShowModal(false);
      toast({
        title: "Terms Accepted",
        description: "Thank you for accepting our Terms of Service and Privacy Policy.",
      });
    } catch (error) {
      console.error('Error in handleAccept:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = () => {
    console.log('User declined terms, signing out');
    supabase.auth.signOut();
    toast({
      variant: "destructive",
      title: "Terms Declined",
      description: "You must accept our terms to use SquidCloud. You have been signed out.",
    });
  };

  const handleTermsChange = (checked: boolean | 'indeterminate') => {
    setAcceptedTerms(checked === true);
  };

  const handlePrivacyChange = (checked: boolean | 'indeterminate') => {
    setAcceptedPrivacy(checked === true);
  };

  if (!showModal) return null;

  return (
    <AlertDialog open={showModal}>
      <AlertDialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <AlertDialogHeader className="flex-shrink-0">
          <AlertDialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Terms & Privacy Policy Update
          </AlertDialogTitle>
          <AlertDialogDescription>
            We've updated our Terms of Service and Privacy Policy. Please review and accept them to continue using SquidCloud.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex-1 min-h-0 my-4">
          <ScrollArea className="h-full max-h-60 w-full rounded-md border p-4">
            <div className="space-y-4 text-sm">
              <div className="bg-card p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="font-medium">Terms of Service (v{CURRENT_TERMS_VERSION})</span>
                </div>
                <p className="text-muted-foreground mb-2">
                  Our Terms of Service outline how you can use SquidCloud, what's allowed, and what's not.
                </p>
                <Link to="/legal/tos" target="_blank" className="text-primary hover:underline text-xs">
                  Read full Terms of Service →
                </Link>
              </div>

              <div className="bg-card p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="font-medium">Privacy Policy (v{CURRENT_PRIVACY_VERSION})</span>
                </div>
                <p className="text-muted-foreground mb-2">
                  Our Privacy Policy explains how we collect, use, and protect your data with full transparency.
                </p>
                <Link to="/legal/privacy" target="_blank" className="text-primary hover:underline text-xs">
                  Read full Privacy Policy →
                </Link>
              </div>

              <div className="bg-primary/5 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Key Points:</h4>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  <li>• Your files are encrypted and stored securely</li>
                  <li>• We don't scan, analyze, or sell your data</li>
                  <li>• You retain full ownership of your files</li>
                  <li>• API usage is logged for security (not content)</li>
                  <li>• Use SquidCloud responsibly and legally</li>
                </ul>
              </div>
            </div>
          </ScrollArea>
        </div>

        <div className="flex-shrink-0 space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="terms"
              checked={acceptedTerms}
              onCheckedChange={handleTermsChange}
            />
            <label
              htmlFor="terms"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              I accept the{' '}
              <Link to="/legal/tos" target="_blank" className="text-primary hover:underline">
                Terms of Service
              </Link>
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="privacy"
              checked={acceptedPrivacy}
              onCheckedChange={handlePrivacyChange}
            />
            <label
              htmlFor="privacy"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              I accept the{' '}
              <Link to="/legal/privacy" target="_blank" className="text-primary hover:underline">
                Privacy Policy
              </Link>
            </label>
          </div>
        </div>

        <AlertDialogFooter className="flex-shrink-0 mt-4">
          <Button variant="outline" onClick={handleDecline} disabled={loading}>
            Decline & Sign Out
          </Button>
          <Button 
            onClick={handleAccept} 
            disabled={!acceptedTerms || !acceptedPrivacy || loading}
          >
            {loading ? "Saving..." : "Accept & Continue"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default TermsAcceptanceModal;
