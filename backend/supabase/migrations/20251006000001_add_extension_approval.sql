-- Add approval column to extensions table
ALTER TABLE extensions 
ADD COLUMN IF NOT EXISTS approval TEXT NOT NULL DEFAULT 'pending' 
CHECK (approval IN ('pending', 'on_review', 'approved'));

-- Add approval_notes column for admin feedback
ALTER TABLE extensions 
ADD COLUMN IF NOT EXISTS approval_notes TEXT;

-- Add approved_at timestamp
ALTER TABLE extensions 
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Add approved_by admin reference
ALTER TABLE extensions 
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);

-- Create index for faster approval queries
CREATE INDEX IF NOT EXISTS idx_extensions_approval ON extensions(approval);

-- Update existing extensions to approved if is_verified is true
UPDATE extensions 
SET approval = 'approved', approved_at = NOW() 
WHERE is_verified = TRUE;

-- Create extension_approval_history table for audit trail
CREATE TABLE IF NOT EXISTS extension_approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id UUID NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  previous_status TEXT,
  new_status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for history
CREATE INDEX IF NOT EXISTS idx_extension_approval_history_extension ON extension_approval_history(extension_id);
CREATE INDEX IF NOT EXISTS idx_extension_approval_history_created ON extension_approval_history(created_at DESC);

-- RLS for approval history
ALTER TABLE extension_approval_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view all approval history"
  ON extension_approval_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM api_keys 
      WHERE api_keys.user_id = auth.uid() 
      AND api_keys.key_prefix = 'cb_926d45e'
      AND api_keys.is_active = true
    )
  );

CREATE POLICY "Admin can insert approval history"
  ON extension_approval_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM api_keys 
      WHERE api_keys.user_id = auth.uid() 
      AND api_keys.key_prefix = 'cb_926d45e'
      AND api_keys.is_active = true
    )
  );

-- Add RLS policy for admin to update extension approval
CREATE POLICY "Admin can update extension approval"
  ON extensions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM api_keys 
      WHERE api_keys.user_id = auth.uid() 
      AND api_keys.key_prefix = 'cb_926d45e'
      AND api_keys.is_active = true
    )
  );

-- Function to handle approval status change
CREATE OR REPLACE FUNCTION handle_extension_approval_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only track if approval status changed
  IF OLD.approval IS DISTINCT FROM NEW.approval THEN
    INSERT INTO extension_approval_history (
      extension_id,
      admin_id,
      previous_status,
      new_status,
      notes
    ) VALUES (
      NEW.id,
      auth.uid(),
      OLD.approval,
      NEW.approval,
      NEW.approval_notes
    );
    
    -- Set approved_at timestamp if approved
    IF NEW.approval = 'approved' AND OLD.approval != 'approved' THEN
      NEW.approved_at = NOW();
      NEW.approved_by = auth.uid();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for approval changes
DROP TRIGGER IF EXISTS extension_approval_change_trigger ON extensions;
CREATE TRIGGER extension_approval_change_trigger
  BEFORE UPDATE ON extensions
  FOR EACH ROW
  EXECUTE FUNCTION handle_extension_approval_change();

-- Update marketplace visibility policy to only show approved extensions
DROP POLICY IF EXISTS "Public extensions are viewable by everyone" ON extensions;
CREATE POLICY "Public extensions are viewable by everyone"
  ON extensions FOR SELECT
  USING (
    (is_active = TRUE AND approval = 'approved') 
    OR 
    auth.uid() = author_id
    OR
    EXISTS (
      SELECT 1 FROM api_keys 
      WHERE api_keys.user_id = auth.uid() 
      AND api_keys.key_prefix = 'cb_926d45e'
      AND api_keys.is_active = true
    )
  );
