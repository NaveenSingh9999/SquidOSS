
-- Add is_restricted column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN DEFAULT FALSE;
