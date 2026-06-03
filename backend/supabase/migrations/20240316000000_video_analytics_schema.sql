-- Create media playback logs table
CREATE TABLE IF NOT EXISTS media_playback_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('play', 'pause', 'seek', 'quality_change', 'speed_change', 'buffer_start', 'buffer_end', 'complete', 'error')),
    "position" DECIMAL(10,3), -- Position in seconds with millisecond precision
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    metadata JSONB, -- Additional event data like quality, speed, error details
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create playback resume table
CREATE TABLE IF NOT EXISTS playback_resume (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    "position" DECIMAL(10,3) NOT NULL DEFAULT 0, -- Last watched position in seconds
    duration DECIMAL(10,3), -- Total duration when position was saved
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, file_id)
);

-- Create video stream sessions table
CREATE TABLE IF NOT EXISTS video_stream_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    quality VARCHAR(20),
    bandwidth_used BIGINT DEFAULT 0, -- Bytes streamed
    stream_duration DECIMAL(10,3) DEFAULT 0, -- Total streaming time in seconds
    errors_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_activity TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    completed BOOLEAN DEFAULT FALSE
);

-- Create video quality metrics table
CREATE TABLE IF NOT EXISTS video_quality_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES video_stream_sessions(session_id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    quality VARCHAR(20) NOT NULL,
    bandwidth INTEGER, -- Current bandwidth in bps
    buffer_level DECIMAL(5,2), -- Buffer level in seconds
    dropped_frames INTEGER DEFAULT 0,
    rebuffer_count INTEGER DEFAULT 0,
    startup_time DECIMAL(6,3) -- Time to start playback in seconds
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_media_playback_logs_user_file ON media_playback_logs(user_id, file_id);
CREATE INDEX IF NOT EXISTS idx_media_playback_logs_session ON media_playback_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_media_playback_logs_timestamp ON media_playback_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_media_playback_logs_event_type ON media_playback_logs(event_type);

CREATE INDEX IF NOT EXISTS idx_playback_resume_user_file ON playback_resume(user_id, file_id);
CREATE INDEX IF NOT EXISTS idx_playback_resume_updated_at ON playback_resume(updated_at);

CREATE INDEX IF NOT EXISTS idx_video_stream_sessions_user ON video_stream_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_video_stream_sessions_file ON video_stream_sessions(file_id);
CREATE INDEX IF NOT EXISTS idx_video_stream_sessions_created_at ON video_stream_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_video_stream_sessions_last_activity ON video_stream_sessions(last_activity);

CREATE INDEX IF NOT EXISTS idx_video_quality_metrics_session ON video_quality_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_video_quality_metrics_timestamp ON video_quality_metrics(timestamp);

-- Create RLS policies for security
ALTER TABLE media_playback_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE playback_resume ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_stream_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_quality_metrics ENABLE ROW LEVEL SECURITY;

-- Policy for media_playback_logs - users can only access their own logs
CREATE POLICY "Users can insert own playback logs" ON media_playback_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own playback logs" ON media_playback_logs
    FOR SELECT USING (auth.uid() = user_id);

-- Policy for playback_resume - users can manage their own resume positions
CREATE POLICY "Users can manage own resume positions" ON playback_resume
    FOR ALL USING (auth.uid() = user_id);

-- Policy for video_stream_sessions - users can access their own sessions
CREATE POLICY "Users can manage own stream sessions" ON video_stream_sessions
    FOR ALL USING (auth.uid() = user_id);

-- Policy for video_quality_metrics - users can access metrics for their sessions
CREATE POLICY "Users can access own quality metrics" ON video_quality_metrics
    FOR SELECT USING (
        session_id IN (
            SELECT session_id FROM video_stream_sessions WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own quality metrics" ON video_quality_metrics
    FOR INSERT WITH CHECK (
        session_id IN (
            SELECT session_id FROM video_stream_sessions WHERE user_id = auth.uid()
        )
    );

-- Create a function to update playback resume position
CREATE OR REPLACE FUNCTION update_playback_resume(
    p_file_id UUID,
    p_position DECIMAL(10,3),
    p_duration DECIMAL(10,3) DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO playback_resume (user_id, file_id, "position", duration)
    VALUES (auth.uid(), p_file_id, p_position, p_duration)
    ON CONFLICT (user_id, file_id)
    DO UPDATE SET
        "position" = EXCLUDED."position",
        duration = COALESCE(EXCLUDED.duration, playback_resume.duration),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to get playback resume position
CREATE OR REPLACE FUNCTION get_playback_resume(p_file_id UUID)
RETURNS TABLE (
    "position" DECIMAL(10,3),
    duration DECIMAL(10,3),
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT pr."position", pr.duration, pr.updated_at
    FROM playback_resume pr
    WHERE pr.user_id = auth.uid() AND pr.file_id = p_file_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to log playback events
CREATE OR REPLACE FUNCTION log_playback_event(
    p_file_id UUID,
    p_session_id UUID,
    p_event_type VARCHAR(50),
    p_position DECIMAL(10,3) DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO media_playback_logs (
        user_id, file_id, session_id, event_type, "position", 
        metadata, ip_address, user_agent
    )
    VALUES (
        auth.uid(), p_file_id, p_session_id, p_event_type, p_position,
        p_metadata, p_ip_address, p_user_agent
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to create or update stream session
CREATE OR REPLACE FUNCTION upsert_stream_session(
    p_session_id UUID,
    p_file_id UUID,
    p_quality VARCHAR(20) DEFAULT NULL,
    p_bandwidth_used BIGINT DEFAULT 0,
    p_stream_duration DECIMAL(10,3) DEFAULT 0,
    p_errors_count INTEGER DEFAULT 0,
    p_completed BOOLEAN DEFAULT FALSE
)
RETURNS void AS $$
BEGIN
    INSERT INTO video_stream_sessions (
        session_id, user_id, file_id, quality, bandwidth_used, 
        stream_duration, errors_count, completed, last_activity
    )
    VALUES (
        p_session_id, auth.uid(), p_file_id, p_quality, p_bandwidth_used,
        p_stream_duration, p_errors_count, p_completed, NOW()
    )
    ON CONFLICT (session_id)
    DO UPDATE SET
        quality = COALESCE(EXCLUDED.quality, video_stream_sessions.quality),
        bandwidth_used = video_stream_sessions.bandwidth_used + EXCLUDED.bandwidth_used,
        stream_duration = GREATEST(video_stream_sessions.stream_duration, EXCLUDED.stream_duration),
        errors_count = video_stream_sessions.errors_count + EXCLUDED.errors_count,
        completed = EXCLUDED.completed,
        last_activity = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a view for video analytics dashboard
CREATE OR REPLACE VIEW video_analytics_summary AS
SELECT 
    f.id as file_id,
    f.name as file_name,
    f.type as file_type,
    f.size as file_size,
    COUNT(DISTINCT mpl.session_id) as total_sessions,
    COUNT(DISTINCT mpl.user_id) as unique_viewers,
    AVG(vss.stream_duration) as avg_watch_time,
    SUM(vss.bandwidth_used) as total_bandwidth,
    COUNT(CASE WHEN mpl.event_type = 'complete' THEN 1 END) as completion_count,
    COUNT(CASE WHEN mpl.event_type = 'error' THEN 1 END) as error_count,
    MAX(mpl.timestamp) as last_viewed,
    AVG(CASE WHEN mpl.event_type = 'complete' THEN mpl."position" END) as avg_completion_time
FROM files f
LEFT JOIN media_playback_logs mpl ON f.id = mpl.file_id
LEFT JOIN video_stream_sessions vss ON mpl.session_id = vss.session_id
WHERE f.type LIKE 'video/%'
GROUP BY f.id, f.name, f.type, f.size;

-- Grant appropriate permissions
GRANT SELECT ON video_analytics_summary TO authenticated;

-- Create a function to clean up old logs (for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_video_logs(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Clean up old playback logs
    DELETE FROM media_playback_logs 
    WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Clean up old quality metrics
    DELETE FROM video_quality_metrics 
    WHERE timestamp < NOW() - INTERVAL '1 day' * days_to_keep;
    
    -- Clean up old stream sessions
    DELETE FROM video_stream_sessions 
    WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add some helpful comments
COMMENT ON TABLE media_playback_logs IS 'Stores detailed playback events for video analytics';
COMMENT ON TABLE playback_resume IS 'Stores user resume positions for videos';
COMMENT ON TABLE video_stream_sessions IS 'Tracks video streaming sessions and bandwidth usage';
COMMENT ON TABLE video_quality_metrics IS 'Stores detailed quality and performance metrics';
COMMENT ON VIEW video_analytics_summary IS 'Aggregated analytics view for video files';

-- Create notification triggers for real-time analytics (optional)
CREATE OR REPLACE FUNCTION notify_playback_event()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('playback_event', json_build_object(
        'user_id', NEW.user_id,
        'file_id', NEW.file_id,
        'event_type', NEW.event_type,
        'position', NEW."position"
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER playback_event_notification
    AFTER INSERT ON media_playback_logs
    FOR EACH ROW
    EXECUTE FUNCTION notify_playback_event();