-- Clean migration to remove any stale nodes table references
-- This migration ensures no nodes table exists and cleans up any potential references

-- Drop nodes table if it exists (should not exist based on current schema)
DROP TABLE IF EXISTS nodes CASCADE;

-- Drop any functions that might reference nodes
DROP FUNCTION IF EXISTS create_node(text, jsonb, text) CASCADE;
DROP FUNCTION IF EXISTS get_nodes(text) CASCADE;
DROP FUNCTION IF EXISTS update_node(text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS delete_node(text) CASCADE;

-- Drop any views that might reference nodes
DROP VIEW IF EXISTS nodes_view CASCADE;

-- Remove any indexes that might be related to nodes
DROP INDEX IF EXISTS idx_nodes_user_id CASCADE;
DROP INDEX IF EXISTS idx_nodes_parent_id CASCADE;
DROP INDEX IF EXISTS idx_nodes_created_at CASCADE;

-- Ensure files table exists and is properly structured
CREATE TABLE IF NOT EXISTS files (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    type text NOT NULL,
    size bigint NOT NULL,
    storage_path text NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    encrypted boolean DEFAULT false,
    shared boolean DEFAULT false,
    encryption_key text,
    tags text[],
    parent_folder text,
    original_parent_folder text,
    is_public boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    github_repo text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);

-- Ensure proper RLS policies on files table
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to reset
DROP POLICY IF EXISTS "Users can view their own files" ON files;
DROP POLICY IF EXISTS "Users can insert their own files" ON files;
DROP POLICY IF EXISTS "Users can update their own files" ON files;
DROP POLICY IF EXISTS "Users can delete their own files" ON files;

-- Create proper RLS policies for files table
CREATE POLICY "Users can view their own files" ON files
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own files" ON files
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own files" ON files
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own files" ON files
    FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_parent_folder ON files(parent_folder);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_is_deleted ON files(is_deleted) WHERE is_deleted = false;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_files_updated_at ON files;
CREATE TRIGGER update_files_updated_at 
    BEFORE UPDATE ON files 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
