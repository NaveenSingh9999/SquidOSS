
import React from 'react';
import JWPlayer from './JWPlayer';
import { FileItem } from '@/lib/api';

interface CustomMediaPlayerProps {
  file: FileItem;
  src: string;
  open: boolean;
  onClose: () => void;
}

const CustomMediaPlayer: React.FC<CustomMediaPlayerProps> = ({
  file,
  src,
  open,
  onClose
}) => {
  return (
    <JWPlayer
      src={src}
      title={file.name}
      open={open}
      onClose={onClose}
    />
  );
};

export default CustomMediaPlayer;
