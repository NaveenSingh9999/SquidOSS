-- Add trash functionality to files table
ALTER TABLE public.files 
ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN original_parent_folder TEXT NULL;

-- Create file_versions table for version history
CREATE TABLE public.file_versions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    file_id UUID NOT NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    storage_path TEXT NOT NULL,
    size BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID NOT NULL,
    change_description TEXT,
    encryption_key TEXT,
    is_current BOOLEAN NOT NULL DEFAULT false
);

-- Create downloads table for download manager
CREATE TABLE public.downloads (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    file_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', -- queued, downloading, paused, completed, failed
    progress DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    download_speed BIGINT DEFAULT 0,
    bytes_downloaded BIGINT DEFAULT 0,
    total_bytes BIGINT NOT NULL,
    estimated_time INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.downloads ENABLE ROW LEVEL SECURITY;

-- RLS policies for file_versions
CREATE POLICY "Users can view versions of their files" 
ON public.file_versions 
FOR SELECT 
USING (EXISTS (
    SELECT 1 FROM public.files 
    WHERE files.id = file_versions.file_id 
    AND files.user_id = auth.uid()
));

CREATE POLICY "Users can create versions for their files" 
ON public.file_versions 
FOR INSERT 
WITH CHECK (EXISTS (
    SELECT 1 FROM public.files 
    WHERE files.id = file_versions.file_id 
    AND files.user_id = auth.uid()
) AND created_by = auth.uid());

-- RLS policies for downloads
CREATE POLICY "Users can view their own downloads" 
ON public.downloads 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own downloads" 
ON public.downloads 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own downloads" 
ON public.downloads 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own downloads" 
ON public.downloads 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to auto-delete trashed files after 30 days
CREATE OR REPLACE FUNCTION public.cleanup_trashed_files()
RETURNS void AS $$
BEGIN
    DELETE FROM public.files 
    WHERE is_deleted = true 
    AND deleted_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to move file to trash
CREATE OR REPLACE FUNCTION public.move_to_trash(file_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.files 
    SET 
        is_deleted = true,
        deleted_at = NOW(),
        original_parent_folder = parent_folder,
        parent_folder = 'trash'
    WHERE id = file_uuid 
    AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to restore from trash
CREATE OR REPLACE FUNCTION public.restore_from_trash(file_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.files 
    SET 
        is_deleted = false,
        deleted_at = NULL,
        parent_folder = original_parent_folder
    WHERE id = file_uuid 
    AND user_id = auth.uid()
    AND is_deleted = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;