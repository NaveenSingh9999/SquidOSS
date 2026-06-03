import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Lock, User, FileText } from '@/lib/icon-map';
import { toast } from 'sonner';

const AdminAuth = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Form states
  const [accessKey, setAccessKey] = useState('');
  const [adminUserId, setAdminUserId] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [accessPurpose, setAccessPurpose] = useState('');

  useEffect(() => {
    // Redirect if not authenticated
    if (!user) {
      navigate('/auth');
      return;
    }
  }, [user, navigate]);

  const getAccessToken = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new Error('Authentication required');
    }
    return accessToken;
  };

  const invokeAdminAuth = async (step: number, payload: Record<string, unknown>) => {
    const accessToken = await getAccessToken();
    const { data, error } = await supabase.functions.invoke('admin-auth', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: { step, ...payload }
    });

    if (error || !data?.success) {
      throw new Error(error?.message || data?.message || 'Admin verification failed');
    }

    return data;
  };

  const handleStep1 = async () => {
    setLoading(true);
    setError('');
    
    try {
      await invokeAdminAuth(1, { accessKey });
      setCurrentStep(2);
    } catch (err: any) {
      setError(err.message || 'Invalid access key. Access denied.');
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = async () => {
    setLoading(true);
    setError('');
    
    try {
      await invokeAdminAuth(2, {});
      setCurrentStep(3);
    } catch (err: any) {
      setError(err.message || 'Access denied. Admin privileges required.');
    } finally {
      setLoading(false);
    }
  };

  const handleStep3 = async () => {
    setLoading(true);
    setError('');
    
    try {
      await invokeAdminAuth(3, { adminUserId, adminPassword });
      setCurrentStep(4);
    } catch (err: any) {
      setError(err.message || 'Invalid admin credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleStep4 = async () => {
    setLoading(true);
    setError('');
    
    try {
      await invokeAdminAuth(4, { accessPurpose });
      localStorage.setItem('admin_session_verified', Date.now().toString());
      toast.success('Admin access granted!');
      navigate('/ad/u1/get_ad/dash');
    } catch (err: any) {
      setError(err.message || 'Please enter a valid access purpose.');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Step 1: Access Key Verification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Enter the 12-character alphanumeric access code:
              </p>
              <Input
                type="password"
                placeholder="Enter access key"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                maxLength={12}
              />
              <Button onClick={handleStep1} disabled={loading} className="w-full">
                {loading ? 'Verifying...' : 'Verify Access Key'}
              </Button>
            </CardContent>
          </Card>
        );
        
      case 2:
        return (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Step 2: Admin Account Verification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Checking admin privileges for user: {user?.email}
              </p>
              <Button onClick={handleStep2} disabled={loading} className="w-full">
                {loading ? 'Checking...' : 'Verify Admin Status'}
              </Button>
            </CardContent>
          </Card>
        );
        
      case 3:
        return (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Step 3: Admin Credentials
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Admin User ID:</label>
                <Input
                  type="text"
                  placeholder="Enter admin user ID"
                  value={adminUserId}
                  onChange={(e) => setAdminUserId(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Admin Password:</label>
                <Input
                  type="password"
                  placeholder="Enter admin password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                />
              </div>
              <Button onClick={handleStep3} disabled={loading} className="w-full">
                {loading ? 'Verifying...' : 'Verify Credentials'}
              </Button>
            </CardContent>
          </Card>
        );
        
      case 4:
        return (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Step 4: Access Purpose
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Please enter your purpose for accessing the admin dashboard:
              </p>
              <textarea
                className="w-full p-3 border rounded-md resize-none"
                rows={4}
                placeholder="Describe your purpose for admin access..."
                value={accessPurpose}
                onChange={(e) => setAccessPurpose(e.target.value)}
              />
              <Button onClick={handleStep4} disabled={loading} className="w-full">
                {loading ? 'Logging...' : 'Complete Authentication'}
              </Button>
            </CardContent>
          </Card>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            🔒 SquidCloud Admin Access
          </h1>
          <p className="text-gray-600 mt-2">
            Multi-Layer Authentication System
          </p>
        </div>
        
        {/* Progress indicator */}
        <div className="flex justify-center space-x-2">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={`w-3 h-3 rounded-full ${
                step <= currentStep ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
        
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {renderStep()}
      </div>
    </div>
  );
};

export default AdminAuth;
