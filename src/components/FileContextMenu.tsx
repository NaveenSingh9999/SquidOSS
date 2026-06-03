
import React from 'react';
import UniversalContextMenu from './UniversalContextMenu';

interface FileContextMenuProps {
  x: number;
  y: number;
  file: any;
  onClose: () => void;
  onView?: () => void;
  onInfo?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
}

const FileContextMenu: React.FC<FileContextMenuProps> = (props) => {
  // Simply pass through to UniversalContextMenu for consistency
  return <UniversalContextMenu {...props} item={props.file} />;
};

export default FileContextMenu;
