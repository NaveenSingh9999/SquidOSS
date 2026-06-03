/**
 * SquidLab SDK - Official SDK for building SquidCloud extensions
 * @version 1.0.0
 * @license MIT
 */

export { SquidLab } from './core/SquidLab';
export { ExtensionContext } from './core/ExtensionContext';
export { PermissionManager } from './core/PermissionManager';

// SquidCloud Matched UI Components (Recommended)
export { 
  SQButton, 
  SQInput, 
  SQCard, 
  SQBadge,
  SquidCloudColors,
  SquidCloudTypography,
  SquidCloudSpacing,
  SquidCloudRadius,
  SquidCloudShadows,
  type SQButtonProps,
  type SQInputProps,
  type SQCardProps,
  type SQBadgeProps,
} from './components/SquidCloudUI';

// Legacy UI Components (kept for compatibility)
export { Button } from './components/Button';
export { Input } from './components/Input';
export { Card } from './components/Card';
export { Modal } from './components/Modal';
export { Toast, showToast, ToastContainer } from './components/Toast';
export { Badge, Select, Checkbox, Switch, Table, Form, Tabs, FileUploader, DataTable, Chart } from './components/OtherComponents';

// Utilities
export { validateManifest, createExtension, formatFileSize, formatDate, debounce, throttle } from './utils/validation';

// Types
export * from './types';
