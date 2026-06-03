-- SquidArchive Extraction System
-- Allows users to extract archive files (.zip, .rar, .7z, .tar, .gz) directly in SquidCloud
-- Created: 2025-11-04

-- Create archive_extractions table to track extraction jobs
CREATE TABLE IF NOT EXISTS archive_extractions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  source_file_name TEXT NOT NULL,
  destination_folder TEXT, -- NULL means root folder
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'extracting', 'completed', 'failed')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  total_files INTEGER DEFAULT 0,
  extracted_files INTEGER DEFAULT 0,
  extracted_file_ids UUID[], -- Array of file IDs created during extraction
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_archive_extractions_user_id ON archive_extractions(user_id);
CREATE INDEX IF NOT EXISTS idx_archive_extractions_status ON archive_extractions(status);
CREATE INDEX IF NOT EXISTS idx_archive_extractions_created_at ON archive_extractions(created_at DESC);

-- Enable RLS
ALTER TABLE archive_extractions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own archive extractions"
  ON archive_extractions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own archive extractions"
  ON archive_extractions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own archive extractions"
  ON archive_extractions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own archive extractions"
  ON archive_extractions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE TRIGGER update_archive_extractions_updated_at
  BEFORE UPDATE ON archive_extractions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to check if file is an archive
CREATE OR REPLACE FUNCTION is_archive_file(file_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN file_name ~* '\.(zip|rar|7z|tar|gz|tgz|bz2|tar\.gz|tar\.bz2)$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION is_archive_file TO authenticated;

-- Add comments
COMMENT ON TABLE archive_extractions IS 'Tracks archive file extraction jobs and their progress';
COMMENT ON FUNCTION is_archive_file IS 'Checks if a filename is an archive based on extension';
