-- Migration to create pdf_secure_urls table for tracking secure PDF URLs

CREATE TABLE IF NOT EXISTS pdf_secure_urls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    secure_url TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- Ensure one active URL per file per user
    UNIQUE(file_id, user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pdf_secure_urls_file_user ON pdf_secure_urls(file_id, user_id);
CREATE INDEX IF NOT EXISTS idx_pdf_secure_urls_expires ON pdf_secure_urls(expires_at);

-- Enable RLS
ALTER TABLE pdf_secure_urls ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own secure URLs
CREATE POLICY "Users can manage their own PDF secure URLs" ON pdf_secure_urls
    FOR ALL USING (auth.uid() = user_id);

-- Function to clean up expired URLs
CREATE OR REPLACE FUNCTION cleanup_expired_pdf_urls()
RETURNS void AS $$
BEGIN
    DELETE FROM pdf_secure_urls 
    WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set up periodic cleanup (run every hour)
-- Note: This requires pg_cron extension to be enabled
-- SELECT cron.schedule('cleanup-expired-pdf-urls', '0 * * * *', 'SELECT cleanup_expired_pdf_urls();');