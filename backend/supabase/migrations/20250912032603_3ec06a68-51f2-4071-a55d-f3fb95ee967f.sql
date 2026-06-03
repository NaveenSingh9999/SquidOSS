-- Fix search path security warnings for functions
CREATE OR REPLACE FUNCTION public.cleanup_trashed_files()
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.files 
    WHERE is_deleted = true 
    AND deleted_at < NOW() - INTERVAL '30 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_trash(file_uuid UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.restore_from_trash(file_uuid UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.update_migration_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_api_key()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  key_string TEXT;
BEGIN
  -- Generate a secure random key with cb_ prefix
  key_string := 'cb_' || encode(gen_random_bytes(32), 'hex');
  RETURN key_string;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_file_info(file_uuid uuid)
RETURNS TABLE(file_id uuid, file_name text, file_type text, file_size bigint, is_public boolean, shared boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.get_public_folder_contents(folder_uuid uuid)
RETURNS TABLE(item_id uuid, item_name text, item_type text, item_size bigint, is_folder boolean, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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