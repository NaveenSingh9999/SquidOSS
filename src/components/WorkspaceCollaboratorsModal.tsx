import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Copy, Link2, Trash2, UserPlus, Users } from '@/lib/icon-map';

export type WorkspaceRole = 'viewer' | 'editor' | 'admin' | 'owner';

interface WorkspaceCollaboratorsModalProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null;
  workspaceName: string;
  currentRole: WorkspaceRole | null;
  currentUserId: string;
}

interface WorkspaceMemberRow {
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface WorkspaceInviteRow {
  id: string;
  invitee_email: string;
  role: WorkspaceRole;
  status: string;
  created_at: string;
  expires_at: string | null;
}

interface WorkspacePresenceRow {
  user_id: string;
  current_file_id: string | null;
  last_heartbeat: string;
}

const ROLE_ORDER: Record<WorkspaceRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  viewer: 'Viewer',
  editor: 'Editor',
  admin: 'Admin',
  owner: 'Owner',
};

const INVITE_ROLE_OPTIONS: WorkspaceRole[] = ['viewer', 'editor', 'admin'];

const WorkspaceCollaboratorsModal: React.FC<WorkspaceCollaboratorsModalProps> = ({
  open,
  onClose,
  workspaceId,
  workspaceName,
  currentRole,
  currentUserId,
}) => {
  const { toast } = useToast();
  const [members, setMembers] = useState<Array<WorkspaceMemberRow & { profile?: ProfileRow }>>([]);
  const [invites, setInvites] = useState<WorkspaceInviteRow[]>([]);
  const [presence, setPresence] = useState<Array<WorkspacePresenceRow & { profile?: ProfileRow }>>([]);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('viewer');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  const canManageMembers = useMemo(() => {
    if (!currentRole) return false;
    return ROLE_ORDER[currentRole] >= ROLE_ORDER.admin;
  }, [currentRole]);

  const canViewInvites = canManageMembers;

  const activeMemberCount = useMemo(() => presence.length, [presence]);

  const fetchProfiles = useCallback(async (userIds: string[]) => {
    if (!userIds.length) return new Map<string, ProfileRow>();

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, display_name, username, avatar_url')
      .in('id', userIds);

    if (error) {
      console.error('Failed to load profiles:', error);
      return new Map<string, ProfileRow>();
    }

    const map = new Map<string, ProfileRow>();
    (data || []).forEach((row: ProfileRow) => {
      map.set(row.id, row);
    });

    return map;
  }, []);

  const fetchMembers = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('user_id, role, joined_at')
        .eq('workspace_id', workspaceId);

      if (error) throw error;

      const rows = (data || []) as WorkspaceMemberRow[];
      const profileMap = await fetchProfiles(rows.map(row => row.user_id));

      const merged = rows
        .map(row => ({
          ...row,
          profile: profileMap.get(row.user_id),
        }))
        .sort((a, b) => {
          const rank = ROLE_ORDER[b.role] - ROLE_ORDER[a.role];
          if (rank !== 0) return rank;
          const aName = getProfileName(a.profile, a.user_id).toLowerCase();
          const bName = getProfileName(b.profile, b.user_id).toLowerCase();
          return aName.localeCompare(bName);
        });

      setMembers(merged);
    } catch (err: any) {
      toast({
        title: 'Unable to load members',
        description: err.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [fetchProfiles, toast, workspaceId]);

  const fetchInvites = useCallback(async () => {
    if (!workspaceId || !canViewInvites) {
      setInvites([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('workspace_invites')
        .select('id, invitee_email, role, status, created_at, expires_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setInvites((data || []) as WorkspaceInviteRow[]);
    } catch (err: any) {
      console.error('Failed to load invites:', err);
    }
  }, [canViewInvites, workspaceId]);

  const fetchPresence = useCallback(async () => {
    if (!workspaceId) return;

    try {
      const { data, error } = await supabase
        .from('workspace_presence')
        .select('user_id, current_file_id, last_heartbeat')
        .eq('workspace_id', workspaceId);

      if (error) throw error;

      const now = Date.now();
      const activeRows = (data || [])
        .filter((row: WorkspacePresenceRow) => {
          const lastSeen = new Date(row.last_heartbeat).getTime();
          return now - lastSeen < 30000;
        }) as WorkspacePresenceRow[];

      const profileMap = await fetchProfiles(activeRows.map(row => row.user_id));

      setPresence(activeRows.map(row => ({
        ...row,
        profile: profileMap.get(row.user_id),
      })));
    } catch (err: any) {
      console.error('Failed to load presence:', err);
    }
  }, [fetchProfiles, workspaceId]);

  useEffect(() => {
    if (!open) return;
    void fetchMembers();
    void fetchInvites();
    void fetchPresence();
  }, [fetchMembers, fetchInvites, fetchPresence, open]);

  useEffect(() => {
    if (!open || !workspaceId) return;

    const channel = supabase
      .channel(`workspace_presence_${workspaceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'workspace_presence',
        filter: `workspace_id=eq.${workspaceId}`,
      }, () => {
        void fetchPresence();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchPresence, open, workspaceId]);

  const handleInvite = useCallback(async () => {
    if (!workspaceId) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      toast({
        title: 'Invite email required',
        description: 'Enter an email to invite.',
        variant: 'destructive',
      });
      return;
    }

    setInviteLoading(true);
    try {
      const { data: wsData, error: wsError } = await supabase
        .from('workspaces')
        .select('member_limit')
        .eq('id', workspaceId)
        .single();
      if (wsError) throw wsError;

      if (wsData?.member_limit != null) {
        const { count, error: countError } = await supabase
          .from('workspace_members')
          .select('*', { head: true, count: 'exact' })
          .eq('workspace_id', workspaceId);
        if (countError) throw countError;
        if (count != null && count >= wsData.member_limit) {
          throw new Error(`Member limit reached (${wsData.member_limit}). Cannot add more members.`);
        }
      }

      const { data, error } = await supabase.rpc('create_workspace_invite', {
        p_workspace_id: workspaceId,
        p_invitee_email: email,
        p_role: inviteRole,
      });

      if (error) throw error;

      const inviteRow = Array.isArray(data) ? data[0] : data;
      if (!inviteRow?.invite_token) {
        throw new Error('Invite token missing');
      }

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const url = `${origin}/workspace/invite/${inviteRow.invite_token}`;
      setInviteLink(url);
      setInviteEmail('');

      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }

      const { error: fnError } = await supabase.functions.invoke('send-workspace-invite', {
        body: {
          invitee_email: email,
          workspace_name: workspaceName,
          role: inviteRole,
          token: inviteRow.invite_token,
          app_origin: origin,
        },
      });

      if (fnError) {
        console.error('Failed to send invite email:', fnError);
        toast({
          title: 'Invite created, but email failed',
          description: 'The invite link was copied to your clipboard.',
        });
      } else {
        toast({
          title: 'Invite sent',
          description: `Email sent to ${email}.`,
        });
      }

      void fetchInvites();
    } catch (err: any) {
      toast({
        title: 'Invite failed',
        description: err.message || 'Unable to create invite.',
        variant: 'destructive',
      });
    } finally {
      setInviteLoading(false);
    }
  }, [fetchInvites, inviteEmail, inviteRole, toast, workspaceId, workspaceName]);

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    if (!workspaceId) return;

    try {
      const { error } = await supabase
        .from('workspace_invites')
        .update({
          status: 'revoked',
          revoked_at: new Date().toISOString(),
          revoked_by: currentUserId,
        })
        .eq('id', inviteId);

      if (error) throw error;

      toast({
        title: 'Invite revoked',
        description: 'The invite is no longer valid.',
      });
      void fetchInvites();
    } catch (err: any) {
      toast({
        title: 'Failed to revoke',
        description: err.message || 'Unable to revoke invite.',
        variant: 'destructive',
      });
    }
  }, [currentUserId, fetchInvites, toast, workspaceId]);

  const handleRoleChange = useCallback(async (memberId: string, nextRole: WorkspaceRole) => {
    if (!workspaceId) return;

    try {
      const { error } = await supabase
        .from('workspace_members')
        .update({ role: nextRole })
        .eq('workspace_id', workspaceId)
        .eq('user_id', memberId);

      if (error) throw error;

      toast({
        title: 'Role updated',
        description: `Member role set to ${ROLE_LABELS[nextRole]}.`,
      });

      void fetchMembers();
    } catch (err: any) {
      toast({
        title: 'Role update failed',
        description: err.message || 'Unable to update role.',
        variant: 'destructive',
      });
    }
  }, [fetchMembers, toast, workspaceId]);

  const handleRemoveMember = useCallback(async (memberId: string) => {
    if (!workspaceId) return;

    try {
      const { error } = await supabase
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', memberId);

      if (error) throw error;

      toast({
        title: 'Member removed',
        description: 'Workspace access revoked.',
      });
      void fetchMembers();
    } catch (err: any) {
      toast({
        title: 'Removal failed',
        description: err.message || 'Unable to remove member.',
        variant: 'destructive',
      });
    }
  }, [fetchMembers, toast, workspaceId]);

  const handleCopyInvite = useCallback(async () => {
    if (!inviteLink || !navigator?.clipboard) return;
    await navigator.clipboard.writeText(inviteLink);
    toast({
      title: 'Invite link copied',
      description: 'Share the invite URL with your teammate.',
    });
  }, [inviteLink, toast]);

  const handleLeaveWorkspace = useCallback(async () => {
    if (!workspaceId) return;

    try {
      const { error } = await supabase
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', currentUserId);

      if (error) throw error;

      toast({
        title: 'Left workspace',
        description: 'You no longer have access to this workspace.',
      });
      onClose();
    } catch (err: any) {
      toast({
        title: 'Unable to leave',
        description: err.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [currentUserId, onClose, toast, workspaceId]);

  if (!workspaceId) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {workspaceName}
          </DialogTitle>
          <DialogDescription>
            Manage members, invites, and active presence for this workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="rounded-xl border border-border/50 bg-card/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Members</p>
                <p className="text-xs text-muted-foreground">
                  {members.length} total · {activeMemberCount} active now
                </p>
              </div>
              {currentRole && (
                <Badge variant="secondary" className="capitalize">
                  {ROLE_LABELS[currentRole]}
                </Badge>
              )}
            </div>

            <div className="mt-3 space-y-2">
              {members.map(member => {
                const profile = member.profile;
                const displayName = getProfileName(profile, member.user_id);
                const initials = getInitials(displayName);
                const isOwner = member.role === 'owner';
                const isSelf = member.user_id === currentUserId;
                return (
                  <div
                    key={member.user_id}
                    className="flex items-center justify-between rounded-lg border border-border/40 bg-background/60 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={profile?.avatar_url || ''} />
                        <AvatarFallback className="text-xs font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {displayName}
                          {isSelf && <span className="ml-2 text-[11px] text-muted-foreground">You</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Joined {new Date(member.joined_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canManageMembers && !isOwner ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleRoleChange(member.user_id, value as WorkspaceRole)}
                        >
                          <SelectTrigger className="h-8 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INVITE_ROLE_OPTIONS.map(role => (
                              <SelectItem key={role} value={role} className="text-xs">
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className="capitalize text-xs">
                          {ROLE_LABELS[member.role]}
                        </Badge>
                      )}

                      {canManageMembers && !isOwner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveMember(member.user_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {canManageMembers && (
            <section className="rounded-xl border border-border/50 bg-card/60 p-4">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                <p className="text-sm font-medium">Invite teammates</p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="name@company.com"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Role</Label>
                  <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as WorkspaceRole)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVITE_ROLE_OPTIONS.map(role => (
                        <SelectItem key={role} value={role} className="text-xs">
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => void handleInvite()}
                    disabled={inviteLoading}
                    className="h-9"
                  >
                    Create link
                  </Button>
                </div>
              </div>

              {inviteLink && (
                <div className="mt-3 rounded-lg border border-border/40 bg-background/70 p-3">
                  <p className="text-xs text-muted-foreground">Invite link (shown once):</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs break-all text-foreground">{inviteLink}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 px-2"
                      onClick={() => void handleCopyInvite()}
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                </div>
              )}

              {canViewInvites && invites.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Pending invites</p>
                  {invites.map(invite => (
                    <div
                      key={invite.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/70 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{invite.invitee_email}</p>
                        <p className="text-xs text-muted-foreground">
                          {ROLE_LABELS[invite.role]} · {invite.status}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[11px]">
                          {invite.expires_at ? `Expires ${new Date(invite.expires_at).toLocaleDateString()}` : 'No expiry'}
                        </Badge>
                        {invite.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => handleRevokeInvite(invite.id)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Revoke
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="rounded-xl border border-border/50 bg-card/60 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Active now</p>
              <Badge variant="secondary" className="text-xs">
                {activeMemberCount}
              </Badge>
            </div>
            {presence.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">No active members right now.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {presence.map(entry => {
                  const name = getProfileName(entry.profile, entry.user_id);
                  return (
                    <div
                      key={entry.user_id}
                      className="flex items-center gap-2 rounded-full border border-border/40 bg-background/70 px-2 py-1"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={entry.profile?.avatar_url || ''} />
                        <AvatarFallback className="text-[10px] font-semibold">
                          {getInitials(name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium">{name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {currentRole && currentRole !== 'owner' && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => void handleLeaveWorkspace()}
              >
                Leave workspace
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

function getProfileName(profile: ProfileRow | undefined, fallbackId: string): string {
  const name = profile?.display_name || profile?.full_name || profile?.username;
  if (name && name.trim().length > 0) return name;
  return `Member ${fallbackId.slice(0, 6)}`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default WorkspaceCollaboratorsModal;
