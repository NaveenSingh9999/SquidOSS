import React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import EnhancedFileManager from '@/components/EnhancedFileManager';
import FileManager from '@/components/FileManager';

const StorageTab = () => {
  const isMobile = useIsMobile();

  // For mobile, keep the original detailed file manager
  // For desktop, use the enhanced collections manager
  if (isMobile) {
    return <FileManager />;
  }

  return <EnhancedFileManager />;
};

export default StorageTab;
