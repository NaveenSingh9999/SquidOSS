
-- Add MFA-related fields to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Create login sessions table for device tracking
CREATE TABLE IF NOT EXISTS public.login_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  device_name TEXT,
  remember_device BOOLEAN DEFAULT FALSE,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for login_sessions
ALTER TABLE public.login_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for login_sessions
CREATE POLICY "Users can view their own login sessions" 
  ON public.login_sessions 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own login sessions" 
  ON public.login_sessions 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own login sessions" 
  ON public.login_sessions 
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own login sessions" 
  ON public.login_sessions 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Create account_changes table for audit log
CREATE TABLE IF NOT EXISTS public.account_changes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  change_type TEXT NOT NULL, -- 'profile_update', 'password_change', 'mfa_enabled', 'mfa_disabled'
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for account_changes
ALTER TABLE public.account_changes ENABLE ROW LEVEL SECURITY;

-- RLS policies for account_changes
CREATE POLICY "Users can view their own account changes" 
  ON public.account_changes 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert account changes" 
  ON public.account_changes 
  FOR INSERT 
  WITH CHECK (true);

-- Update the handle_new_user function to include new fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    full_name, 
    avatar_url,
    username,
    display_name,
    mfa_enabled
  )
  VALUES (
    new.id, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'display_name',
    FALSE
  );
  RETURN new;
END;
$$;
