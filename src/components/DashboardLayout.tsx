import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import DashboardSidebar from './DashboardSidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
  isAdmin?: boolean;
  userEmail?: string;
  onFileClick: () => void;
  onTrashClick: () => void;
  onSharedClick: () => void;
  onSettingsClick: () => void;
  onAnalyticsClick: () => void;
  onLogout: () => void;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  isAdmin = false,
  userEmail = '',
  onFileClick,
  onTrashClick,
  onSharedClick,
  onSettingsClick,
  onAnalyticsClick,
  onLogout,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <DashboardSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onFileClick={onFileClick}
        onTrashClick={onTrashClick}
        onSharedClick={onSharedClick}
        onSettingsClick={onSettingsClick}
        onAnalyticsClick={onAnalyticsClick}
        onLogout={onLogout}
        isAdmin={isAdmin}
        userEmail={userEmail}
      />

      {/* Main Content */}
      <div
        className={cn(
          'flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300',
          sidebarOpen ? 'ml-64' : 'ml-20'
        )}
      >
        {/* Content Area */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
