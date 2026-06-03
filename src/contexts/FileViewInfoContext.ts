import { createContext } from 'react';
import type { FileItem } from '@/lib/api';

export const FileViewInfoContext = createContext<((file: FileItem) => void) | null>(null);
export default FileViewInfoContext;
