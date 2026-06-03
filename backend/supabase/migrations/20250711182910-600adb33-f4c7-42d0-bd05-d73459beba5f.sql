
-- Create table to track user terms acceptance
CREATE TABLE public.user_terms_acceptance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address INET,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add Row Level Security
ALTER TABLE public.user_terms_acceptance ENABLE ROW LEVEL SECURITY;

-- Create policy for users to view their own acceptance records
CREATE POLICY "Users can view their own terms acceptance" 
  ON public.user_terms_acceptance 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Create policy for users to insert their own acceptance records
CREATE POLICY "Users can insert their own terms acceptance" 
  ON public.user_terms_acceptance 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Create policy for users to update their own acceptance records
CREATE POLICY "Users can update their own terms acceptance" 
  ON public.user_terms_acceptance 
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- Create index for efficient lookups
CREATE INDEX idx_user_terms_acceptance_user_versions 
  ON public.user_terms_acceptance (user_id, terms_version, privacy_version);
