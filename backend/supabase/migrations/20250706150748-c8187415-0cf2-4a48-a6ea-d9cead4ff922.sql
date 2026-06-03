
-- Create folders table to persist folder structure
CREATE TABLE IF NOT EXISTS public.folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  parent_folder TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add Row Level Security
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

-- Create policies for folders table
CREATE POLICY "Users can create their own folders" 
  ON public.folders 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own folders" 
  ON public.folders 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own folders" 
  ON public.folders 
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own folders" 
  ON public.folders 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS folders_user_id_idx ON public.folders(user_id);
CREATE INDEX IF NOT EXISTS folders_parent_folder_idx ON public.folders(parent_folder);
CREATE INDEX IF NOT EXISTS folders_path_idx ON public.folders(path);

-- Add parent_folder column to files table if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'files' 
    AND column_name = 'parent_folder'
  ) THEN
    ALTER TABLE public.files ADD COLUMN parent_folder TEXT;
  END IF;
END $$;

-- Add index for files parent_folder
CREATE INDEX IF NOT EXISTS files_parent_folder_idx ON public.files(parent_folder);
