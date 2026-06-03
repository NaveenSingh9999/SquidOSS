import { supabase } from "@/integrations/supabase/client";

export interface SecureFileRecordInput {
  name: string;
  type: string;
  size: number;
  storagePath: string;
  encrypted: boolean;
  encryptionKeyLabel: string;
  metadata?: string | null;
  parentFolder?: string | null;
  workspaceId?: string | null;
  storageProviderId?: string | null;
  externalObjectKey?: string | null;
  processor?: string | null;
  encryptionKey?: string | null;
}

const getAccessToken = async (): Promise<string> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("Authentication required");
  }
  return token;
};

export const createSecureFileRecord = async (
  payload: SecureFileRecordInput
) => {
  const accessToken = await getAccessToken();
  const { data, error } = await supabase.functions.invoke("secure-file-metadata", {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: payload,
  });

  if (error || !data?.success) {
    throw new Error(error?.message || data?.error || "Failed to save file metadata");
  }

  return data.file;
};

export const fetchFileEncryptionKey = async (fileId: string): Promise<string> => {
  const accessToken = await getAccessToken();
  const { data, error } = await supabase.functions.invoke("file-key", {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { fileId },
  });

  if (error || !data?.key) {
    throw new Error(error?.message || data?.error || "Failed to fetch file key");
  }

  return data.key as string;
};
