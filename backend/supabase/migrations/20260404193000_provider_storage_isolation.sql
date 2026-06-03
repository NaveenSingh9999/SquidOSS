-- Provider-level storage isolation for files and folders
-- Ensures each provider (SquidCloud/R2/Tebi) has an independent namespace per workspace

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.storage_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL,
  encrypted_credentials TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.storage_providers
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS provider_type TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_credentials TEXT,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'storage_providers_provider_type_check'
  ) THEN
    ALTER TABLE public.storage_providers
      ADD CONSTRAINT storage_providers_provider_type_check
      CHECK (provider_type IN ('squidcloud', 'r2', 'tebi', 's3', 'gcp'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS storage_providers_user_provider_type_idx
  ON public.storage_providers (user_id, provider_type);

CREATE INDEX IF NOT EXISTS storage_providers_user_id_idx
  ON public.storage_providers (user_id);

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS storage_provider_id UUID,
  ADD COLUMN IF NOT EXISTS external_object_key TEXT;

ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS storage_provider_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'files_storage_provider_id_fkey'
  ) THEN
    ALTER TABLE public.files
      ADD CONSTRAINT files_storage_provider_id_fkey
      FOREIGN KEY (storage_provider_id)
      REFERENCES public.storage_providers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'folders_storage_provider_id_fkey'
  ) THEN
    ALTER TABLE public.folders
      ADD CONSTRAINT folders_storage_provider_id_fkey
      FOREIGN KEY (storage_provider_id)
      REFERENCES public.storage_providers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS files_workspace_provider_parent_idx
  ON public.files (workspace_id, storage_provider_id, parent_folder);

CREATE INDEX IF NOT EXISTS folders_workspace_provider_parent_idx
  ON public.folders (workspace_id, storage_provider_id, parent_folder);

ALTER TABLE public.storage_providers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'storage_providers'
      AND policyname = 'Users can view own storage providers'
  ) THEN
    CREATE POLICY "Users can view own storage providers"
      ON public.storage_providers
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'storage_providers'
      AND policyname = 'Users can create own storage providers'
  ) THEN
    CREATE POLICY "Users can create own storage providers"
      ON public.storage_providers
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'storage_providers'
      AND policyname = 'Users can update own storage providers'
  ) THEN
    CREATE POLICY "Users can update own storage providers"
      ON public.storage_providers
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'storage_providers'
      AND policyname = 'Users can delete own storage providers'
  ) THEN
    CREATE POLICY "Users can delete own storage providers"
      ON public.storage_providers
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;