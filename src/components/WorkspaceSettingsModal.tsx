import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Crown, Pencil, Settings, Trash2, UserCog } from '@/lib/icon-map';

export type WorkspaceRole = 'viewer' | 'editor' | 'admin' | 'owner';

interface WorkspaceSettingsModalProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null;
  workspaceName: string;
  currentRole: WorkspaceRole | null;
  currentUserId: string;
  onWorkspaceUpdated?: (name: string) => void;
  onWorkspaceDeleted?: () => void;
}

const ROLE_ORDER: Record<WorkspaceRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

interface WorkspaceMemberInfo {
  user_id: string;
  role: WorkspaceRole;
  profile?: { full_name: string | null; display_name: string | null; username: string | null } | null;
}

export function WorkspaceSettingsModal({
  open,
  onClose,
  workspaceId,
  workspaceName,
  currentRole,
  currentUserId,
  onWorkspaceUpdated,
  onWorkspaceDeleted,
}: WorkspaceSettingsModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState(workspaceName);
  const [memberLimit, setMemberLimit] = useState('');
  const [storageBackend, setStorageBackend] = useState('managed');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [adminMembers, setAdminMembers] = useState<WorkspaceMemberInfo[]>([]);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferring, setTransferring] = useState(false);

  const isOwner = currentRole === 'owner';
  const canManage = currentRole ? ROLE_ORDER[currentRole] >= ROLE_ORDER.admin : false;

  useEffect(() => {
    if (!open || !workspaceId) return;
    setName(workspaceName);
    void loadWorkspaceDetails();
    if (isOwner) void loadAdminMembers();
  }, [open, workspaceId, workspaceName]);

  const loadWorkspaceDetails = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const { data, error } = await supabase
        .from('workspaces')
        .select('name, member_limit, storage_backend')
        .eq('id', workspaceId)
        .single();
      if (error) throw error;
      if (data) {
        setName(data.name || workspaceName);
        setMemberLimit(data.member_limit != null ? String(data.member_limit) : '');
        setStorageBackend(data.storage_backend || 'managed');
      }
    } catch (err: any) {
      console.error('Failed to load workspace details:', err);
    }
  }, [workspaceId, workspaceName]);

  const loadAdminMembers = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('user_id, role')
        .eq('workspace_id', workspaceId)
        .in('role', ['admin', 'owner']);
      if (error) throw error;
      const rows = (data || []) as WorkspaceMemberInfo[];
      const adminRows = rows.filter(r => r.role === 'admin' && r.user_id !== currentUserId);
      const ownerRow = rows.find(r => r.role === 'owner');

      const userIds = adminRows.map(r => r.user_id).concat(ownerRow ? [ownerRow.user_id] : []);
      if (userIds.length === 0) return;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, display_name, username')
        .in('id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      setAdminMembers(adminRows.map(r => ({ ...r, profile: profileMap.get(r.user_id) || null })));
    } catch (err: any) {
      console.error('Failed to load admin members:', err);
    }
  }, [workspaceId, currentUserId]);

  const handleTransferOwnership = useCallback(async () => {
    if (!workspaceId || !transferTarget) return;
    setTransferring(true);
    try {
      const { error: demoteError } = await supabase
        .from('workspace_members')
        .update({ role: 'admin' })
        .eq('workspace_id', workspaceId)
        .eq('user_id', currentUserId);
      if (demoteError) throw demoteError;

      const { error: promoteError } = await supabase
        .from('workspace_members')
        .update({ role: 'owner' })
        .eq('workspace_id', workspaceId)
        .eq('user_id', transferTarget);
      if (promoteError) throw promoteError;

      toast({ title: 'Ownership transferred', description: 'The new owner can now manage this workspace.' });
      onWorkspaceDeleted?.();
      onClose();
    } catch (err: any) {
      toast({ title: 'Transfer failed', description: err.message || 'Unable to transfer ownership.', variant: 'destructive' });
    } finally {
      setTransferring(false);
    }
  }, [workspaceId, transferTarget, currentUserId, toast, onWorkspaceDeleted, onClose]);

  const handleSave = useCallback(async () => {
    if (!workspaceId || !canManage) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: 'Name required', description: 'Workspace name cannot be empty.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const updates: Record<string, any> = { name: trimmedName };
      if (isOwner && memberLimit !== '') {
        const limit = parseInt(memberLimit, 10);
        if (!isNaN(limit) && limit > 0) {
          updates.member_limit = limit;
        }
      }

      const { error } = await supabase
        .from('workspaces')
        .update(updates)
        .eq('id', workspaceId);
      if (error) throw error;

      toast({ title: 'Workspace updated', description: 'Settings saved successfully.' });
      onWorkspaceUpdated?.(trimmedName);
      onClose();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [workspaceId, name, memberLimit, isOwner, canManage, toast, onWorkspaceUpdated, onClose]);

  const handleDeleteWorkspace = useCallback(async () => {
    if (!workspaceId || !isOwner) return;
    setDeleting(true);
    try {
      const { error: inviteError } = await supabase
        .from('workspace_invites')
        .delete()
        .eq('workspace_id', workspaceId);
      if (inviteError) throw inviteError;

      const { error: memberError } = await supabase
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId);
      if (memberError) throw memberError;

      const { error } = await supabase
        .from('workspaces')
        .delete()
        .eq('id', workspaceId);
      if (error) throw error;

      toast({ title: 'Workspace deleted', description: 'The workspace and all its data have been removed.' });
      onWorkspaceDeleted?.();
      onClose();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }, [workspaceId, isOwner, toast, onWorkspaceDeleted, onClose]);

  if (!workspaceId || !currentRole) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Workspace Settings
          </DialogTitle>
          <DialogDescription>
            Manage workspace configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="ws-name">Workspace Name</Label>
            <div className="flex gap-2">
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canManage}
                placeholder="Workspace name"
              />
              {canManage && (
                <Button onClick={handleSave} disabled={saving} size="sm">
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              )}
            </div>
          </div>

          {isOwner && (
            <div className="space-y-2">
              <Label htmlFor="ws-limit">Member Limit</Label>
              <Input
                id="ws-limit"
                type="number"
                min="1"
                value={memberLimit}
                onChange={(e) => setMemberLimit(e.target.value)}
                placeholder="No limit"
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of members allowed. Leave empty for unlimited.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Storage Backend</Label>
            <Badge variant="outline" className="text-xs px-3 py-1">
              {storageBackend === 'custom' ? 'Custom Provider' : 'Managed'}
            </Badge>
            <p className="text-xs text-muted-foreground">
              Storage backend is set at workspace creation and cannot be changed.
            </p>
          </div>

          {isOwner && adminMembers.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <UserCog className="h-4 w-4" />
                Transfer Ownership
              </p>
              <p className="text-xs text-muted-foreground mb-2">
                Transfer full control to another admin. You will become an admin.
              </p>
              <div className="flex gap-2">
                <select
                  value={transferTarget}
                  onChange={(e) => setTransferTarget(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">Select an admin...</option>
                  {adminMembers.map(m => {
                    const name = m.profile?.display_name || m.profile?.full_name || m.profile?.username || m.user_id.slice(0, 8);
                    return (
                      <option key={m.user_id} value={m.user_id}>{name}</option>
                    );
                  })}
                </select>
                <Button
                  onClick={() => void handleTransferOwnership()}
                  disabled={!transferTarget || transferring}
                  size="sm"
                >
                  {transferring ? 'Transferring...' : 'Transfer'}
                </Button>
              </div>
            </div>
          )}

          {isOwner && (
            <div className="border-t border-border pt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="gap-2">
                    <Trash2 className="h-4 w-4" />
                    Delete Workspace
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the workspace and all associated data.
                      Files may remain in storage but workspace membership and metadata will be lost.
                      Type <strong>{workspaceName}</strong> to confirm.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <Input
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="Type workspace name to confirm"
                    className="my-2"
                  />
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDeleteConfirm('')}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void handleDeleteWorkspace()}
                      disabled={deleteConfirm !== workspaceName || deleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting ? 'Deleting...' : 'Delete'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
