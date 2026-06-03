import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Search, Eye, Key, FileText, Calendar, User, Mail, Shield, Trash2, Ban, CheckCircle } from '@/lib/icon-map';
import { toast } from 'sonner';

interface UserProfile {
  id: string;
  full_name: string;
  avatar_url: string;
  created_at: string;
  storage_used: number;
  is_admin: boolean;
  is_premium: boolean;
  onboarding_complete: boolean;
  repo_count: number;
  is_restricted?: boolean;
}

interface UserDetails {
  profile: UserProfile;
  apiKeys: any[];
  files: any[];
  logs: any[];
}

const UsersTab = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      // Call the admin data access edge function
      const { data, error } = await supabase.functions.invoke('admin-data-access', {
        body: { action: 'all_users' }
      });

      if (error) throw error;
      
      setUsers(data.users || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast.error('Failed to fetch users. Admin access required.');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserDetails = async (userId: string) => {
    setDetailsLoading(true);
    try {
      // Call the admin data access edge function for user details
      const { data, error } = await supabase.functions.invoke('admin-data-access', {
        body: { action: 'user_details', userId }
      });

      if (error) throw error;

      setSelectedUser({
        profile: data.profile,
        apiKeys: data.apiKeys || [],
        files: data.files || [],
        logs: data.logs || []
      });
    } catch (error) {
      console.error('Failed to fetch user details:', error);
      toast.error('Failed to fetch user details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const toggleAdminStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: !currentStatus })
        .eq('id', userId);

      if (error) throw error;

      toast.success(`User ${!currentStatus ? 'granted' : 'revoked'} admin privileges`);
      
      // Refresh users list
      await fetchUsers();
      
      // Update selected user if viewing details
      if (selectedUser && selectedUser.profile.id === userId) {
        await fetchUserDetails(userId);
      }
    } catch (error) {
      console.error('Failed to toggle admin status:', error);
      toast.error('Failed to update admin status');
    }
  };

  const togglePremiumStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_premium: !currentStatus })
        .eq('id', userId);

      if (error) throw error;

      toast.success(`User ${!currentStatus ? 'granted' : 'revoked'} premium status`);
      
      // Refresh users list
      await fetchUsers();
      
      // Update selected user if viewing details
      if (selectedUser && selectedUser.profile.id === userId) {
        await fetchUserDetails(userId);
      }
    } catch (error) {
      console.error('Failed to toggle premium status:', error);
      toast.error('Failed to update premium status');
    }
  };

  const toggleUserRestriction = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_restricted: !currentStatus } as any)
        .eq('id', userId);

      if (error) throw error;

      toast.success(`User ${!currentStatus ? 'restricted' : 'unrestricted'} successfully`);
      
      // Log admin action
      await supabase
        .from('admin_access_logs')
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          access_purpose: `User ${!currentStatus ? 'restriction' : 'unrestriction'}: ${userId}`,
          step_completed: 4
        });
      
      // Refresh users list
      await fetchUsers();
      
      // Update selected user if viewing details
      if (selectedUser && selectedUser.profile.id === userId) {
        await fetchUserDetails(userId);
      }
    } catch (error) {
      console.error('Failed to toggle user restriction:', error);
      toast.error('Failed to update user restriction');
    }
  };

  const deleteUser = async (userId: string, userName: string) => {
    try {
      // Delete user's files first
      const { error: filesError } = await supabase
        .from('files')
        .delete()
        .eq('user_id', userId);

      if (filesError) throw filesError;

      // Delete user's API keys
      const { error: keysError } = await supabase
        .from('api_keys')
        .delete()
        .eq('user_id', userId);

      if (keysError) throw keysError;

      // Delete user's API logs
      const { error: logsError } = await supabase
        .from('api_request_logs')
        .delete()
        .eq('user_id', userId);

      if (logsError) throw logsError;

      // Delete user profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (profileError) throw profileError;

      toast.success(`User ${userName} deleted successfully`);
      
      // Log admin action
      await supabase
        .from('admin_access_logs')
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          access_purpose: `User deletion: ${userName} (${userId})`,
          step_completed: 4
        });
      
      // Refresh users list
      await fetchUsers();
      
      // Close details modal if it was the deleted user
      if (selectedUser && selectedUser.profile.id === userId) {
        setSelectedUser(null);
      }
    } catch (error) {
      console.error('Failed to delete user:', error);
      toast.error('Failed to delete user');
    }
  };

  const revokeApiKey = async (keyId: string) => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: false })
        .eq('id', keyId);

      if (error) throw error;

      toast.success('API key revoked successfully');

      // Refresh user details
      if (selectedUser) {
        await fetchUserDetails(selectedUser.profile.id);
      }
    } catch (error) {
      console.error('Failed to revoke API key:', error);
      toast.error('Failed to revoke API key');
    }
  };

  const deleteUserFile = async (fileId: string) => {
    try {
      const { error } = await supabase
        .from('files')
        .delete()
        .eq('id', fileId);

      if (error) throw error;

      toast.success('File deleted successfully');

      // Refresh user details
      if (selectedUser) {
        await fetchUserDetails(selectedUser.profile.id);
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      toast.error('Failed to delete file');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredUsers = users.filter(user =>
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.id.includes(searchTerm)
  );

  if (loading) {
    return <div className="p-8 text-center">Loading all platform users...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Search and Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Platform User Management ({users.length} total users)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search users by name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-lg font-bold text-blue-600">{users.filter(u => u.is_admin).length}</div>
                <div className="text-sm text-blue-600">Admin Users</div>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <div className="text-lg font-bold text-yellow-600">{users.filter(u => u.is_premium).length}</div>
                <div className="text-sm text-yellow-600">Premium Users</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-lg font-bold text-green-600">{users.filter(u => u.onboarding_complete).length}</div>
                <div className="text-sm text-green-600">Onboarded</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-lg font-bold text-red-600">{users.filter(u => u.is_restricted).length}</div>
                <div className="text-sm text-red-600">Restricted</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-600">{Math.round(users.reduce((sum, u) => sum + (u.storage_used || 0), 0) / 1024 / 1024 / 1024)}</div>
                <div className="text-sm text-gray-600">Total GB Used</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredUsers.map((user) => (
          <Card key={user.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={user.avatar_url || ''} />
                  <AvatarFallback>
                    <User className="h-6 w-6" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">
                    {user.full_name || 'Unknown User'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    ID: {user.id.slice(0, 8)}...
                  </p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {user.is_admin && <Badge variant="destructive">Admin</Badge>}
                    {user.is_premium && <Badge className="bg-yellow-100 text-yellow-800">Premium</Badge>}
                    {user.is_restricted && <Badge className="bg-red-100 text-red-800">Restricted</Badge>}
                    {!user.onboarding_complete && <Badge variant="outline">Incomplete</Badge>}
                  </div>
                </div>
              </div>
              
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Storage Used:</span>
                  <span className="font-medium">{formatBytes(user.storage_used || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Repositories:</span>
                  <span className="font-medium">{user.repo_count}</span>
                </div>
                <div className="flex justify-between">
                  <span>Joined:</span>
                  <span className="font-medium">
                    {new Date(user.created_at!).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Admin Actions */}
              <div className="mt-4 space-y-2">
                <div className="flex gap-2">
                  <Button
                    variant={user.is_admin ? "destructive" : "default"}
                    size="sm"
                    onClick={() => toggleAdminStatus(user.id, user.is_admin)}
                    className="flex-1"
                  >
                    <Shield className="h-3 w-3 mr-1" />
                    {user.is_admin ? 'Revoke Admin' : 'Make Admin'}
                  </Button>
                  <Button
                    variant={user.is_premium ? "outline" : "secondary"}
                    size="sm"
                    onClick={() => togglePremiumStatus(user.id, user.is_premium)}
                    className="flex-1"
                  >
                    {user.is_premium ? 'Remove Premium' : 'Grant Premium'}
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant={user.is_restricted ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleUserRestriction(user.id, user.is_restricted || false)}
                    className="flex-1"
                  >
                    {user.is_restricted ? <CheckCircle className="h-3 w-3 mr-1" /> : <Ban className="h-3 w-3 mr-1" />}
                    {user.is_restricted ? 'Unrestrict' : 'Restrict'}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="flex-1">
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete User</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete all associated data: profile, files, API keys, and logs. 
                          This action is irreversible and cannot be undone.
                          <br /><br />
                          User: <strong>{user.full_name || 'Unknown User'}</strong>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => deleteUser(user.id, user.full_name || 'Unknown User')}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Delete Permanently
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => fetchUserDetails(user.id)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar_url || ''} />
                          <AvatarFallback>
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        {user.full_name || 'Unknown User'} - Admin View
                      </DialogTitle>
                    </DialogHeader>
                    
                    {detailsLoading ? (
                      <div className="p-8 text-center">Loading user details...</div>
                    ) : selectedUser ? (
                      <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                          <TabsTrigger value="overview">Overview</TabsTrigger>
                          <TabsTrigger value="files">Files ({selectedUser.files.length})</TabsTrigger>
                          <TabsTrigger value="logs">Logs ({selectedUser.logs.length})</TabsTrigger>
                          <TabsTrigger value="apikeys">API Keys ({selectedUser.apiKeys.length})</TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="space-y-6">
                          {/* Profile Info */}
                          <Card>
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <User className="h-5 w-5" />
                                Profile Information
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="font-medium">Full Name:</span>
                                  <p>{selectedUser.profile.full_name || 'Not set'}</p>
                                </div>
                                <div>
                                  <span className="font-medium">User ID:</span>
                                  <p className="font-mono text-sm">{selectedUser.profile.id}</p>
                                </div>
                                <div>
                                  <span className="font-medium">Storage Used:</span>
                                  <p>{formatBytes(selectedUser.profile.storage_used || 0)}</p>
                                </div>
                                <div>
                                  <span className="font-medium">Repositories:</span>
                                  <p>{selectedUser.profile.repo_count}</p>
                                </div>
                                <div>
                                  <span className="font-medium">Account Status:</span>
                                  <div className="flex gap-2 mt-1 flex-wrap">
                                    {selectedUser.profile.is_admin && <Badge variant="destructive">Admin</Badge>}
                                    {selectedUser.profile.is_premium && <Badge className="bg-yellow-100 text-yellow-800">Premium</Badge>}
                                    {selectedUser.profile.is_restricted && <Badge className="bg-red-100 text-red-800">Restricted</Badge>}
                                    {selectedUser.profile.onboarding_complete ? (
                                      <Badge className="bg-green-100 text-green-800">Complete</Badge>
                                    ) : (
                                      <Badge variant="outline">Incomplete</Badge>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <span className="font-medium">Member Since:</span>
                                  <p>{new Date(selectedUser.profile.created_at!).toLocaleDateString()}</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </TabsContent>

                        <TabsContent value="files" className="space-y-4">
                          <Card>
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5" />
                                Uploaded Files ({selectedUser.files.length})
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              {selectedUser.files.length > 0 ? (
                                <div className="space-y-2">
                                  {selectedUser.files.map((file) => (
                                    <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg">
                                      <div>
                                        <div className="font-medium">{file.name}</div>
                                        <div className="text-sm text-gray-600">
                                          {file.type} • {formatBytes(file.size)} • {new Date(file.created_at).toLocaleDateString()}
                                        </div>
                                      </div>
                                      <div className="flex gap-2">
                                        {file.encrypted && <Badge variant="outline">Encrypted</Badge>}
                                        {file.shared && <Badge className="bg-blue-100 text-blue-800">Shared</Badge>}
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          onClick={() => deleteUserFile(file.id)}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-600">No files uploaded</p>
                              )}
                            </CardContent>
                          </Card>
                        </TabsContent>

                        <TabsContent value="logs" className="space-y-4">
                          <Card>
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <Calendar className="h-5 w-5" />
                                Recent Activity ({selectedUser.logs.length})
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              {selectedUser.logs.length > 0 ? (
                                <div className="space-y-2">
                                  {selectedUser.logs.map((log) => (
                                    <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg">
                                      <div>
                                        <div className="font-medium">
                                          {log.method} {log.endpoint}
                                        </div>
                                        <div className="text-sm text-gray-600">
                                          {new Date(log.created_at).toLocaleString()}
                                          {log.file_name && ` • File: ${log.file_name}`}
                                          {log.ip_address && ` • IP: ${log.ip_address}`}
                                        </div>
                                      </div>
                                      <Badge variant={log.status_code >= 400 ? 'destructive' : 'outline'}>
                                        {log.status_code}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-600">No recent activity</p>
                              )}
                            </CardContent>
                          </Card>
                        </TabsContent>

                        <TabsContent value="apikeys" className="space-y-4">
                          <Card>
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <Key className="h-5 w-5" />
                                API Keys ({selectedUser.apiKeys.length})
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              {selectedUser.apiKeys.length > 0 ? (
                                <div className="space-y-3">
                                  {selectedUser.apiKeys.map((key) => (
                                    <div key={key.id} className="flex items-center justify-between p-3 border rounded-lg">
                                      <div>
                                        <div className="font-medium">{key.name}</div>
                                        <div className="text-sm text-gray-600">
                                          {key.key_prefix}... • Created {new Date(key.created_at).toLocaleDateString()}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {key.is_active ? (
                                          <Badge className="bg-green-100 text-green-800">Active</Badge>
                                        ) : (
                                          <Badge variant="destructive">Revoked</Badge>
                                        )}
                                        {key.is_active && (
                                          <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => revokeApiKey(key.id)}
                                          >
                                            Revoke
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-600">No API keys generated</p>
                              )}
                            </CardContent>
                          </Card>
                        </TabsContent>
                      </Tabs>
                    ) : null}
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-gray-600">No users found matching your search.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default UsersTab;
