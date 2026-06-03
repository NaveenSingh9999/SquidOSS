
-- Update files table to support public sharing
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

-- Update folders table to support public sharing  
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

-- Create policy for public file access
CREATE POLICY "Allow public access to public files" ON public.files
FOR SELECT USING (is_public = true);

-- Create policy for public folder access
CREATE POLICY "Allow public access to public folders" ON public.folders
FOR SELECT USING (is_public = true);

-- Update the download shared file function to work with public files
CREATE OR REPLACE FUNCTION public.get_public_file_info(file_uuid uuid)
RETURNS TABLE (
  file_id uuid,
  file_name text,
  file_type text,
  file_size bigint,
  is_public boolean,
  shared boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    f.id as file_id,
    f.name as file_name,
    f.type as file_type,
    f.size as file_size,
    f.is_public,
    f.shared
  FROM files f
  WHERE f.id = file_uuid 
    AND (f.is_public = true OR f.shared = true);
END;
$$;

-- Create function to get public folder contents
CREATE OR REPLACE FUNCTION public.get_public_folder_contents(folder_uuid uuid)
RETURNS TABLE (
  item_id uuid,
  item_name text,
  item_type text,
  item_size bigint,
  is_folder boolean,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return files in the folder
  RETURN QUERY
  SELECT 
    f.id as item_id,
    f.name as item_name,
    f.type as item_type,
    f.size as item_size,
    false as is_folder,
    f.created_at
  FROM files f
  JOIN folders folder ON folder.path = f.parent_folder
  WHERE folder.id = folder_uuid 
    AND folder.is_public = true;
    
  -- Return subfolders
  RETURN QUERY  
  SELECT
    sf.id as item_id,
    sf.name as item_name,
    'folder' as item_type,
    0::bigint as item_size,
    true as is_folder,
    sf.created_at
  FROM folders sf
  JOIN folders parent ON parent.path = sf.parent_folder
  WHERE parent.id = folder_uuid
    AND parent.is_public = true;
END;
$$;
