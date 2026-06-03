-- Create transcoding jobs table
CREATE TABLE IF NOT EXISTS transcode_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    output_qualities TEXT[] NOT NULL DEFAULT '{}',
    priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    error TEXT,
    output_files JSONB, -- Array of output file metadata
    estimated_time INTEGER, -- Estimated completion time in minutes
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create HLS storage table for generated files
CREATE TABLE IF NOT EXISTS hls_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quality VARCHAR(20) NOT NULL,
    manifest_path TEXT NOT NULL,
    segment_paths TEXT[] NOT NULL DEFAULT '{}',
    file_size BIGINT NOT NULL DEFAULT 0,
    duration DECIMAL(10,3), -- Duration in seconds
    bandwidth INTEGER, -- Bitrate in bps
    resolution VARCHAR(20), -- e.g., "1920x1080"
    codec VARCHAR(50), -- e.g., "h264"
    container VARCHAR(20), -- e.g., "mp4", "ts"
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(file_id, quality)
);

-- Create video processing queue table
CREATE TABLE IF NOT EXISTS video_processing_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('transcode', 'thumbnail', 'metadata', 'analyze')),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL DEFAULT 5 CHECK (priority >= 1 AND priority <= 10), -- 1 = highest, 10 = lowest
    parameters JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    worker_id VARCHAR(100), -- ID of the worker processing this job
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    error_message TEXT,
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transcode_jobs_file_id ON transcode_jobs(file_id);
CREATE INDEX IF NOT EXISTS idx_transcode_jobs_user_id ON transcode_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_transcode_jobs_status ON transcode_jobs(status);
CREATE INDEX IF NOT EXISTS idx_transcode_jobs_created_at ON transcode_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_transcode_jobs_priority ON transcode_jobs(priority);

CREATE INDEX IF NOT EXISTS idx_hls_files_file_id ON hls_files(file_id);
CREATE INDEX IF NOT EXISTS idx_hls_files_user_id ON hls_files(user_id);
CREATE INDEX IF NOT EXISTS idx_hls_files_quality ON hls_files(quality);

CREATE INDEX IF NOT EXISTS idx_video_processing_queue_status ON video_processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_video_processing_queue_priority ON video_processing_queue(priority);
CREATE INDEX IF NOT EXISTS idx_video_processing_queue_scheduled_for ON video_processing_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_video_processing_queue_job_type ON video_processing_queue(job_type);

-- Enable RLS
ALTER TABLE transcode_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hls_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_processing_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies for transcode_jobs
CREATE POLICY "Users can view own transcode jobs" ON transcode_jobs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own transcode jobs" ON transcode_jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transcode jobs" ON transcode_jobs
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS policies for hls_files
CREATE POLICY "Users can view own HLS files" ON hls_files
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can manage HLS files" ON hls_files
    FOR ALL USING (true); -- Service role can manage all

-- RLS policies for video_processing_queue
CREATE POLICY "Users can view own processing jobs" ON video_processing_queue
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own processing jobs" ON video_processing_queue
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_transcode_jobs_updated_at
    BEFORE UPDATE ON transcode_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hls_files_updated_at
    BEFORE UPDATE ON hls_files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_processing_queue_updated_at
    BEFORE UPDATE ON video_processing_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to get transcode job status
CREATE OR REPLACE FUNCTION get_transcode_job_status(p_file_id UUID)
RETURNS TABLE (
    job_id UUID,
    status VARCHAR(20),
    progress INTEGER,
    output_qualities TEXT[],
    error TEXT,
    estimated_time INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tj.id,
        tj.status,
        tj.progress,
        tj.output_qualities,
        tj.error,
        tj.estimated_time,
        tj.created_at,
        tj.updated_at
    FROM transcode_jobs tj
    WHERE tj.file_id = p_file_id 
      AND tj.user_id = auth.uid()
    ORDER BY tj.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get available HLS files for a video
CREATE OR REPLACE FUNCTION get_hls_files(p_file_id UUID)
RETURNS TABLE (
    quality VARCHAR(20),
    manifest_path TEXT,
    file_size BIGINT,
    duration DECIMAL(10,3),
    bandwidth INTEGER,
    resolution VARCHAR(20),
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        hf.quality,
        hf.manifest_path,
        hf.file_size,
        hf.duration,
        hf.bandwidth,
        hf.resolution,
        hf.created_at
    FROM hls_files hf
    WHERE hf.file_id = p_file_id 
      AND hf.user_id = auth.uid()
    ORDER BY hf.bandwidth DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to queue transcode job
CREATE OR REPLACE FUNCTION queue_transcode_job(
    p_file_id UUID,
    p_output_qualities TEXT[],
    p_priority VARCHAR(10) DEFAULT 'normal'
)
RETURNS UUID AS $$
DECLARE
    job_id UUID;
    file_size BIGINT;
BEGIN
    -- Get file size for estimation
    SELECT size INTO file_size
    FROM files
    WHERE id = p_file_id AND user_id = auth.uid();
    
    IF file_size IS NULL THEN
        RAISE EXCEPTION 'File not found or access denied';
    END IF;
    
    -- Create transcode job
    INSERT INTO transcode_jobs (
        file_id,
        user_id,
        output_qualities,
        priority,
        estimated_time
    )
    VALUES (
        p_file_id,
        auth.uid(),
        p_output_qualities,
        p_priority,
        GREATEST(1, CEIL((file_size / 1073741824.0) * array_length(p_output_qualities, 1))) -- 1 min per GB per quality
    )
    RETURNING id INTO job_id;
    
    -- Queue processing job
    INSERT INTO video_processing_queue (
        job_type,
        file_id,
        user_id,
        priority,
        parameters
    )
    VALUES (
        'transcode',
        p_file_id,
        auth.uid(),
        CASE p_priority
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 5
            WHEN 'low' THEN 8
            ELSE 5
        END,
        json_build_object(
            'transcode_job_id', job_id,
            'output_qualities', p_output_qualities
        )
    );
    
    RETURN job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get next job from processing queue
CREATE OR REPLACE FUNCTION get_next_processing_job(p_worker_id VARCHAR(100))
RETURNS TABLE (
    job_id UUID,
    job_type VARCHAR(50),
    file_id UUID,
    user_id UUID,
    parameters JSONB
) AS $$
DECLARE
    selected_job_id UUID;
BEGIN
    -- Select and lock next job
    SELECT id INTO selected_job_id
    FROM video_processing_queue
    WHERE status = 'pending'
      AND scheduled_for <= NOW()
      AND attempts < max_attempts
    ORDER BY priority ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
    
    IF selected_job_id IS NULL THEN
        RETURN;
    END IF;
    
    -- Update job status
    UPDATE video_processing_queue
    SET status = 'processing',
        worker_id = p_worker_id,
        started_at = NOW(),
        attempts = attempts + 1,
        updated_at = NOW()
    WHERE id = selected_job_id;
    
    -- Return job details
    RETURN QUERY
    SELECT 
        vpq.id,
        vpq.job_type,
        vpq.file_id,
        vpq.user_id,
        vpq.parameters
    FROM video_processing_queue vpq
    WHERE vpq.id = selected_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to complete processing job
CREATE OR REPLACE FUNCTION complete_processing_job(
    p_job_id UUID,
    p_status VARCHAR(20),
    p_error_message TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE video_processing_queue
    SET status = p_status,
        completed_at = CASE WHEN p_status = 'completed' THEN NOW() ELSE NULL END,
        error_message = p_error_message,
        updated_at = NOW()
    WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old completed jobs
CREATE OR REPLACE FUNCTION cleanup_old_processing_jobs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM video_processing_queue 
    WHERE status IN ('completed', 'failed', 'cancelled')
      AND completed_at < NOW() - INTERVAL '1 day' * days_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Also clean up old transcode jobs
    DELETE FROM transcode_jobs
    WHERE status IN ('completed', 'failed')
      AND completed_at < NOW() - INTERVAL '1 day' * days_to_keep;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create view for video processing status
CREATE OR REPLACE VIEW video_processing_status AS
SELECT 
    f.id as file_id,
    f.name as file_name,
    f.type as file_type,
    f.size as file_size,
    tj.id as transcode_job_id,
    tj.status as transcode_status,
    tj.progress as transcode_progress,
    tj.output_qualities,
    tj.error as transcode_error,
    tj.estimated_time,
    array_length(COALESCE(hf.qualities, ARRAY[]::VARCHAR[]), 1) as available_qualities_count,
    hf.qualities as available_qualities,
    tj.created_at as transcode_started,
    tj.updated_at as last_updated
FROM files f
LEFT JOIN transcode_jobs tj ON f.id = tj.file_id
LEFT JOIN (
    SELECT 
        file_id,
        array_agg(quality ORDER BY bandwidth DESC) as qualities
    FROM hls_files
    GROUP BY file_id
) hf ON f.id = hf.file_id
WHERE f.type LIKE 'video/%';

-- Grant permissions
GRANT SELECT ON video_processing_status TO authenticated;

-- Add helpful comments
COMMENT ON TABLE transcode_jobs IS 'Tracks video transcoding jobs and their progress';
COMMENT ON TABLE hls_files IS 'Stores metadata for generated HLS files and segments';
COMMENT ON TABLE video_processing_queue IS 'Queue system for background video processing jobs';
COMMENT ON VIEW video_processing_status IS 'Aggregated view of video processing status';

-- Create notification triggers for real-time updates
CREATE OR REPLACE FUNCTION notify_transcode_progress()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('transcode_progress', json_build_object(
        'job_id', NEW.id,
        'file_id', NEW.file_id,
        'user_id', NEW.user_id,
        'status', NEW.status,
        'progress', NEW.progress
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transcode_progress_notification
    AFTER UPDATE ON transcode_jobs
    FOR EACH ROW
    WHEN (OLD.progress IS DISTINCT FROM NEW.progress OR OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION notify_transcode_progress();