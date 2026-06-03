-- Create extensions table
CREATE TABLE IF NOT EXISTS extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  author TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  icon_url TEXT,
  category TEXT NOT NULL DEFAULT 'utility',
  downloads INTEGER DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 0,
  total_ratings INTEGER DEFAULT 0,
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  manifest_url TEXT NOT NULL,
  repository_url TEXT,
  permissions TEXT[] DEFAULT '{}',
  screenshots TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create installed_extensions table
CREATE TABLE IF NOT EXISTS installed_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id UUID NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT TRUE,
  settings JSONB DEFAULT '{}',
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(extension_id, user_id)
);

-- Create extension_ratings table
CREATE TABLE IF NOT EXISTS extension_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id UUID NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(extension_id, user_id)
);

-- Create extension_analytics table for tracking usage
CREATE TABLE IF NOT EXISTS extension_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id UUID NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'install', 'uninstall', 'enable', 'disable', 'usage'
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_extensions_author_id ON extensions(author_id);
CREATE INDEX IF NOT EXISTS idx_extensions_category ON extensions(category);
CREATE INDEX IF NOT EXISTS idx_extensions_is_active ON extensions(is_active);
CREATE INDEX IF NOT EXISTS idx_extensions_downloads ON extensions(downloads DESC);
CREATE INDEX IF NOT EXISTS idx_extensions_rating ON extensions(rating DESC);
CREATE INDEX IF NOT EXISTS idx_installed_extensions_user_id ON installed_extensions(user_id);
CREATE INDEX IF NOT EXISTS idx_installed_extensions_extension_id ON installed_extensions(extension_id);
CREATE INDEX IF NOT EXISTS idx_extension_ratings_extension_id ON extension_ratings(extension_id);
CREATE INDEX IF NOT EXISTS idx_extension_analytics_extension_id ON extension_analytics(extension_id);
CREATE INDEX IF NOT EXISTS idx_extension_analytics_user_id ON extension_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_extension_analytics_created_at ON extension_analytics(created_at);

-- Enable RLS
ALTER TABLE extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE installed_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE extension_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE extension_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for extensions
CREATE POLICY "Public extensions are viewable by everyone"
  ON extensions FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Users can insert their own extensions"
  ON extensions FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their own extensions"
  ON extensions FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Users can delete their own extensions"
  ON extensions FOR DELETE
  USING (auth.uid() = author_id);

-- RLS Policies for installed_extensions
CREATE POLICY "Users can view their installed extensions"
  ON installed_extensions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can install extensions"
  ON installed_extensions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their installed extensions"
  ON installed_extensions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can uninstall their extensions"
  ON installed_extensions FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for extension_ratings
CREATE POLICY "Extension ratings are viewable by everyone"
  ON extension_ratings FOR SELECT
  USING (TRUE);

CREATE POLICY "Users can insert their own ratings"
  ON extension_ratings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ratings"
  ON extension_ratings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ratings"
  ON extension_ratings FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for extension_analytics
CREATE POLICY "Extension authors can view analytics for their extensions"
  ON extension_analytics FOR SELECT
  USING (
    auth.uid() IN (
      SELECT author_id FROM extensions WHERE id = extension_id
    )
  );

CREATE POLICY "System can insert analytics"
  ON extension_analytics FOR INSERT
  WITH CHECK (TRUE);

-- Function to update extension rating
CREATE OR REPLACE FUNCTION update_extension_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE extensions
  SET 
    rating = (
      SELECT AVG(rating)::DECIMAL(3,2)
      FROM extension_ratings
      WHERE extension_id = NEW.extension_id
    ),
    total_ratings = (
      SELECT COUNT(*)
      FROM extension_ratings
      WHERE extension_id = NEW.extension_id
    )
  WHERE id = NEW.extension_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update rating when a new rating is added
CREATE TRIGGER update_extension_rating_trigger
AFTER INSERT OR UPDATE OR DELETE ON extension_ratings
FOR EACH ROW
EXECUTE FUNCTION update_extension_rating();

-- Function to log extension events
CREATE OR REPLACE FUNCTION log_extension_event()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO extension_analytics (extension_id, user_id, event_type, event_data)
    VALUES (NEW.extension_id, NEW.user_id, 'install', jsonb_build_object('installed_at', NEW.installed_at));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO extension_analytics (extension_id, user_id, event_type, event_data)
    VALUES (OLD.extension_id, OLD.user_id, 'uninstall', jsonb_build_object('uninstalled_at', NOW()));
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to log install/uninstall events
CREATE TRIGGER log_extension_install_trigger
AFTER INSERT OR DELETE ON installed_extensions
FOR EACH ROW
EXECUTE FUNCTION log_extension_event();

-- Create storage bucket for extension manifests
INSERT INTO storage.buckets (id, name, public)
VALUES ('extension-manifests', 'extension-manifests', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for extension manifests
CREATE POLICY "Extension manifests are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'extension-manifests');

CREATE POLICY "Users can upload their extension manifests"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'extension-manifests' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their extension manifests"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'extension-manifests' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their extension manifests"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'extension-manifests' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Grant necessary permissions
GRANT ALL ON extensions TO authenticated;
GRANT ALL ON installed_extensions TO authenticated;
GRANT ALL ON extension_ratings TO authenticated;
GRANT ALL ON extension_analytics TO authenticated;
