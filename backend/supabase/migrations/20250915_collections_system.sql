-- SquidCloud Collections and Smart File Management
-- Migration for quidJam v7 update
-- Creates collections system for custom and smart file organization

-- Create collections table for user-defined collections
CREATE TABLE IF NOT EXISTS collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
  color TEXT DEFAULT NULL CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  icon TEXT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique collection names per user
  UNIQUE(user_id, name)
);

-- Create collections_files junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS collections_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique file-collection pairs per user
  UNIQUE(user_id, collection_id, file_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS collections_user_id_idx ON collections(user_id);
CREATE INDEX IF NOT EXISTS collections_user_id_name_idx ON collections(user_id, name);
CREATE INDEX IF NOT EXISTS collections_files_user_id_idx ON collections_files(user_id);
CREATE INDEX IF NOT EXISTS collections_files_collection_id_idx ON collections_files(collection_id);
CREATE INDEX IF NOT EXISTS collections_files_file_id_idx ON collections_files(file_id);
CREATE INDEX IF NOT EXISTS collections_files_user_file_idx ON collections_files(user_id, file_id);

-- Enable RLS on both tables
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections_files ENABLE ROW LEVEL SECURITY;

-- RLS policies for collections table
DROP POLICY IF EXISTS "Users can view their own collections" ON collections;
CREATE POLICY "Users can view their own collections" ON collections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own collections" ON collections;
CREATE POLICY "Users can create their own collections" ON collections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own collections" ON collections;
CREATE POLICY "Users can update their own collections" ON collections
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own collections" ON collections;
CREATE POLICY "Users can delete their own collections" ON collections
  FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for collections_files table
DROP POLICY IF EXISTS "Users can view their own collection files" ON collections_files;
CREATE POLICY "Users can view their own collection files" ON collections_files
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can add files to their collections" ON collections_files;
CREATE POLICY "Users can add files to their collections" ON collections_files
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM collections WHERE id = collection_id AND user_id = auth.uid()) AND
    EXISTS (SELECT 1 FROM files WHERE id = file_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can remove files from their collections" ON collections_files;
CREATE POLICY "Users can remove files from their collections" ON collections_files
  FOR DELETE USING (auth.uid() = user_id);

-- Function to create a new collection
CREATE OR REPLACE FUNCTION create_collection(
  collection_name TEXT,
  collection_color TEXT DEFAULT NULL,
  collection_icon TEXT DEFAULT NULL,
  collection_description TEXT DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_collection_id UUID;
  current_user_id UUID;
BEGIN
  -- Get the current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Validate input
  IF collection_name IS NULL OR LENGTH(TRIM(collection_name)) = 0 THEN
    RAISE EXCEPTION 'Collection name is required';
  END IF;
  
  IF LENGTH(collection_name) > 100 THEN
    RAISE EXCEPTION 'Collection name cannot exceed 100 characters';
  END IF;
  
  -- Check for duplicate collection name
  IF EXISTS (
    SELECT 1 FROM collections 
    WHERE user_id = current_user_id AND LOWER(name) = LOWER(TRIM(collection_name))
  ) THEN
    RAISE EXCEPTION 'Collection with this name already exists';
  END IF;
  
  -- Create the collection
  INSERT INTO collections (user_id, name, color, icon, description)
  VALUES (current_user_id, TRIM(collection_name), collection_color, collection_icon, collection_description)
  RETURNING id INTO new_collection_id;
  
  RETURN new_collection_id;
END;
$$ LANGUAGE plpgsql;

-- Function to add file to collection
CREATE OR REPLACE FUNCTION add_file_to_collection(
  collection_id_param UUID,
  file_id_param UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Get the current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Verify collection belongs to user
  IF NOT EXISTS (
    SELECT 1 FROM collections 
    WHERE id = collection_id_param AND user_id = current_user_id
  ) THEN
    RAISE EXCEPTION 'Collection not found or access denied';
  END IF;
  
  -- Verify file belongs to user
  IF NOT EXISTS (
    SELECT 1 FROM files 
    WHERE id = file_id_param AND user_id = current_user_id
  ) THEN
    RAISE EXCEPTION 'File not found or access denied';
  END IF;
  
  -- Add file to collection (ignore if already exists)
  INSERT INTO collections_files (user_id, collection_id, file_id)
  VALUES (current_user_id, collection_id_param, file_id_param)
  ON CONFLICT (user_id, collection_id, file_id) DO NOTHING;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to remove file from collection
CREATE OR REPLACE FUNCTION remove_file_from_collection(
  collection_id_param UUID,
  file_id_param UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  deleted_count INTEGER;
BEGIN
  -- Get the current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Remove the file from collection
  DELETE FROM collections_files 
  WHERE user_id = current_user_id 
    AND collection_id = collection_id_param 
    AND file_id = file_id_param;
    
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's collections with file counts
CREATE OR REPLACE FUNCTION get_user_collections()
RETURNS TABLE(
  id UUID,
  name TEXT,
  color TEXT,
  icon TEXT,
  description TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  file_count BIGINT
)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Get the current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.color,
    c.icon,
    c.description,
    c.created_at,
    c.updated_at,
    COALESCE(cf.file_count, 0) as file_count
  FROM collections c
  LEFT JOIN (
    SELECT 
      collection_id,
      COUNT(*) as file_count
    FROM collections_files
    WHERE user_id = current_user_id
    GROUP BY collection_id
  ) cf ON c.id = cf.collection_id
  WHERE c.user_id = current_user_id
  ORDER BY c.name;
END;
$$ LANGUAGE plpgsql;

-- Function to get files in a collection
CREATE OR REPLACE FUNCTION get_collection_files(collection_id_param UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  type TEXT,
  size BIGINT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  encrypted BOOLEAN,
  shared BOOLEAN,
  storage_path TEXT,
  tags TEXT[],
  parent_folder TEXT,
  added_to_collection_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Get the current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Verify collection belongs to user
  IF NOT EXISTS (
    SELECT 1 FROM collections 
    WHERE collections.id = collection_id_param AND user_id = current_user_id
  ) THEN
    RAISE EXCEPTION 'Collection not found or access denied';
  END IF;
  
  RETURN QUERY
  SELECT 
    f.id,
    f.name,
    f.type,
    f.size,
    f.created_at,
    f.updated_at,
    f.encrypted,
    f.shared,
    f.storage_path,
    f.tags,
    f.parent_folder,
    cf.added_at as added_to_collection_at
  FROM files f
  JOIN collections_files cf ON f.id = cf.file_id
  WHERE cf.collection_id = collection_id_param 
    AND cf.user_id = current_user_id
    AND f.user_id = current_user_id
  ORDER BY cf.added_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION create_collection(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_file_to_collection(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_file_from_collection(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_collections() TO authenticated;
GRANT EXECUTE ON FUNCTION get_collection_files(UUID) TO authenticated;

-- Add trigger to update updated_at on collections
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_collections_updated_at ON collections;
CREATE TRIGGER update_collections_updated_at
  BEFORE UPDATE ON collections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();