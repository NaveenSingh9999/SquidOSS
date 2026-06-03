-- Create migration tables for SquidCloud migration system
CREATE TABLE public.migration_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  total_files INTEGER DEFAULT 0,
  processed_files INTEGER DEFAULT 0,
  failed_files INTEGER DEFAULT 0,
  settings JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE public.migration_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_job_id UUID NOT NULL REFERENCES public.migration_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'error', 'success')),
  message TEXT NOT NULL,
  file_name TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.migration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own migration jobs" 
ON public.migration_jobs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own migration jobs" 
ON public.migration_jobs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own migration jobs" 
ON public.migration_jobs 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own migration logs" 
ON public.migration_logs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can insert migration logs" 
ON public.migration_logs 
FOR INSERT 
WITH CHECK (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_migration_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_migration_jobs_updated_at
BEFORE UPDATE ON public.migration_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_migration_updated_at_column();