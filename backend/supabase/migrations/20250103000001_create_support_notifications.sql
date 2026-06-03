-- Create support_notifications table
CREATE TABLE support_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT CHECK (type IN ('new_ticket', 'new_message', 'status_change', 'assignment', 'rating')) NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    admin_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_support_notifications_user_id ON support_notifications(user_id);
CREATE INDEX idx_support_notifications_admin_id ON support_notifications(admin_id);
CREATE INDEX idx_support_notifications_ticket_id ON support_notifications(ticket_id);
CREATE INDEX idx_support_notifications_read ON support_notifications(read);
CREATE INDEX idx_support_notifications_created_at ON support_notifications(created_at);

-- Enable RLS (Row Level Security)
ALTER TABLE support_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for support_notifications
CREATE POLICY "Users can view their own notifications" ON support_notifications
    FOR SELECT USING (
        auth.uid() = user_id OR 
        auth.uid() = admin_id OR 
        (admin_id IS NULL AND EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.is_admin = true
        ))
    );

CREATE POLICY "System can insert notifications" ON support_notifications
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own notifications" ON support_notifications
    FOR UPDATE USING (
        auth.uid() = user_id OR 
        auth.uid() = admin_id OR 
        (admin_id IS NULL AND EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.is_admin = true
        ))
    );