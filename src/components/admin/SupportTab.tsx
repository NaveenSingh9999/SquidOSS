import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageSquare, Clock, User, AlertCircle, CheckCircle, XCircle } from '@/lib/icon-map';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface SupportTicket {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: string;
  updated_at: string;
  user_id: string;
  user_email?: string;
  user_full_name?: string;
}

interface SupportMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_admin_reply: boolean;
  created_at: string;
  user_email?: string;
  user_full_name?: string;
}

const SupportTab: React.FC = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
    try {
      // Query all tickets using service role bypass
      const { data: ticketData, error: ticketError } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (ticketError) {
        console.error('Error loading tickets:', ticketError);
        toast.error('Failed to load tickets');
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(ticketData?.map(ticket => ticket.user_id) || [])];
      
      // Fetch user profiles for all users
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      if (profileError) {
        console.error('Error loading profiles:', profileError);
      }

      // Merge ticket data with user info
      const ticketsWithUsers: SupportTicket[] = ticketData?.map(ticket => {
        const userProfile = profiles?.find(p => p.id === ticket.user_id);
        return {
          ...ticket,
          status: ticket.status as 'open' | 'in_progress' | 'resolved' | 'closed',
          priority: ticket.priority as 'low' | 'medium' | 'high' | 'urgent',
          user_email: undefined, // Email not available in profiles
          user_full_name: userProfile?.full_name
        };
      }) || [];

      setTickets(ticketsWithUsers);
    } catch (error) {
      console.error('Error loading tickets:', error);
      toast.error('Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (ticketId: string) => {
    try {
      const { data: messageData, error: messageError } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (messageError) {
        console.error('Error loading messages:', messageError);
        toast.error('Failed to load messages');
        return;
      }

      // Get unique user IDs from messages
      const userIds = [...new Set(messageData?.map(msg => msg.sender_id) || [])];
      
      // Fetch user profiles
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      if (profileError) {
        console.error('Error loading message profiles:', profileError);
      }

      // Merge message data with user info
      const messagesWithUsers = messageData?.map(message => {
        const userProfile = profiles?.find(p => p.id === message.sender_id);
        return {
          ...message,
          user_id: message.sender_id,
          is_admin_reply: message.sender_type === 'admin',
          user_email: undefined,
          user_full_name: userProfile?.full_name
        };
      }) || [];

      setMessages(messagesWithUsers);
    } catch (error) {
      console.error('Error loading messages:', error);
      toast.error('Failed to load messages');
    }
  };

  const updateTicketStatus = async (ticketId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', ticketId);

      if (error) {
        console.error('Error updating ticket status:', error);
        toast.error('Failed to update ticket status');
        return;
      }

      toast.success('Ticket status updated');
      loadTickets();
      
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, status: status as any });
      }
    } catch (error) {
      console.error('Error updating ticket:', error);
      toast.error('Failed to update ticket');
    }
  };

  const sendMessage = async () => {
    if (!selectedTicket || !newMessage.trim()) return;

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Not authenticated');
        return;
      }

      const { error } = await supabase
        .from('support_messages')
        .insert({
          ticket_id: selectedTicket.id,
          sender_id: user.id,
          sender_type: 'admin',
          message: newMessage.trim()
        });

      if (error) {
        console.error('Error sending message:', error);
        toast.error('Failed to send message');
        return;
      }

      setNewMessage('');
      toast.success('Message sent');
      loadMessages(selectedTicket.id);
      
      // Update ticket status to in_progress if it was open
      if (selectedTicket.status === 'open') {
        updateTicketStatus(selectedTicket.id, 'in_progress');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading support tickets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tickets List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Support Tickets ({tickets.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-96 overflow-y-auto">
            {tickets.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No support tickets found</p>
            ) : (
              tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedTicket?.id === ticket.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    setSelectedTicket(ticket);
                    loadMessages(ticket.id);
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-sm">{ticket.title}</h4>
                    <div className="flex gap-1">
                      <Badge className={`text-xs ${getStatusColor(ticket.status)}`}>
                        {ticket.status}
                      </Badge>
                      <Badge className={`text-xs ${getPriorityColor(ticket.priority)}`}>
                        {ticket.priority}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mb-2 line-clamp-2">{ticket.description}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {ticket.user_full_name || ticket.user_email || 'Unknown User'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(ticket.created_at), 'MMM dd, HH:mm')}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Ticket Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Ticket Details</span>
              {selectedTicket && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateTicketStatus(selectedTicket.id, 'in_progress')}
                    disabled={selectedTicket.status === 'in_progress'}
                  >
                    In Progress
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateTicketStatus(selectedTicket.id, 'resolved')}
                    disabled={selectedTicket.status === 'resolved'}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Resolve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateTicketStatus(selectedTicket.id, 'closed')}
                    disabled={selectedTicket.status === 'closed'}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Close
                  </Button>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedTicket ? (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold">{selectedTicket.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{selectedTicket.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span>By: {selectedTicket.user_full_name || selectedTicket.user_email}</span>
                    <span>{format(new Date(selectedTicket.created_at), 'MMM dd, yyyy HH:mm')}</span>
                  </div>
                </div>

                {/* Messages */}
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-3">
                  {messages.length === 0 ? (
                    <p className="text-gray-500 text-sm">No messages yet</p>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`p-2 rounded text-sm ${
                          message.is_admin_reply
                            ? 'bg-blue-50 border-l-2 border-blue-500 ml-4'
                            : 'bg-gray-50 border-l-2 border-gray-300 mr-4'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-xs">
                            {message.is_admin_reply 
                              ? 'Admin' 
                              : (message.user_full_name || message.user_email || 'User')
                            }
                          </span>
                          <span className="text-xs text-gray-500">
                            {format(new Date(message.created_at), 'MMM dd, HH:mm')}
                          </span>
                        </div>
                        <p>{message.message}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Reply Form */}
                <div className="space-y-2">
                  <Label htmlFor="reply">Admin Reply</Label>
                  <Textarea
                    id="reply"
                    placeholder="Type your response..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    rows={3}
                  />
                  <Button 
                    onClick={sendMessage} 
                    disabled={!newMessage.trim() || sending}
                    className="w-full"
                  >
                    {sending ? 'Sending...' : 'Send Reply'}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">Select a ticket to view details</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SupportTab;