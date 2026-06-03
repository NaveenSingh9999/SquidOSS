
-- Create admin access logs table
CREATE TABLE public.admin_access_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  access_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  access_purpose TEXT NOT NULL,
  step_completed INTEGER NOT NULL DEFAULT 4,
  session_id TEXT
);

-- Enable RLS on admin access logs
ALTER TABLE public.admin_access_logs ENABLE ROW LEVEL SECURITY;

-- Policy for admin access logs (only admins can view)
CREATE POLICY "Only admins can view admin access logs" 
  ON public.admin_access_logs 
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND id = '1dee2494-0de5-481c-9d16-7000a9f2e68f'
    )
  );

-- Add admin role to profiles table if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'profiles' AND column_name = 'is_admin') THEN
    ALTER TABLE public.profiles ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Set the specific user as admin
UPDATE public.profiles 
SET is_admin = TRUE 
WHERE id = '1dee2494-0de5-481c-9d16-7000a9f2e68f';
