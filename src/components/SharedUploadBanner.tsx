import React from 'react';
import { useSharedReceiver } from '../hooks/useSharedReceiver';

export default function SharedUploadBanner() {
  const { sharedFiles } = useSharedReceiver();

  if (!sharedFiles || sharedFiles.length === 0) return null;

  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 9999 }}>
      <div style={{ background: '#0f172a', color: '#fff', padding: 12, borderRadius: 8, boxShadow: '0 6px 20px rgba(2,6,23,0.6)' }}>
        <div style={{ fontWeight: 600 }}>Files received from other apps</div>
        <div style={{ fontSize: 13 }}>{sharedFiles.length} file(s) queued for upload in background.</div>
      </div>
    </div>
  );
}
