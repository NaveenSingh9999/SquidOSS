import React, { useState } from 'react';
import { Shield, Lock, ChevronRight } from '@/lib/icon-map';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import SquidVault from './SquidVault';

interface SquidVaultFolderProps {
  userId: string;
  onVaultOpen: () => void;
  viewMode?: 'grid' | 'list';
}

const SquidVaultFolder: React.FC<SquidVaultFolderProps> = ({ 
  userId, 
  onVaultOpen,
  viewMode = 'grid' 
}) => {
  const [showVaultModal, setShowVaultModal] = useState(false);

  const handleClick = () => {
    setShowVaultModal(true);
  };

  const handleVaultOpen = () => {
    setShowVaultModal(false);
    onVaultOpen();
  };

  if (viewMode === 'list') {
    return (
      <>
        <Card 
          className={cn(
            "group cursor-pointer transition-all duration-300",
            "bg-gradient-to-br from-blue-600/10 via-purple-600/10 to-blue-600/10",
            "border-2 border-blue-500/30 hover:border-blue-500/60",
            "hover:shadow-[0_0_30px_rgba(59,130,246,0.3)]",
            "p-3"
          )}
          onClick={handleClick}
        >
          <CardContent className="p-0">
            <div className="flex items-center gap-3">
              {/* Vault Icon */}
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full" />
                <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Shield className="w-7 h-7 text-white" />
                  <Lock className="absolute bottom-1 right-1 w-3 h-3 text-white/90" />
                </div>
              </div>
              
              {/* Vault Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-base">SquidVault</p>
                  <div className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-medium">
                    Secure
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Private encrypted storage
                </p>
              </div>
              
              {/* Arrow */}
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-blue-500 transition-colors" />
            </div>
          </CardContent>
        </Card>

        {showVaultModal && (
          <SquidVault 
            userId={userId} 
            onVaultOpen={handleVaultOpen}
          />
        )}
      </>
    );
  }

  return (
    <>
      <Card 
        className={cn(
          "group cursor-pointer transition-all duration-300 overflow-hidden",
          "bg-gradient-to-br from-blue-600/10 via-purple-600/10 to-blue-600/10",
          "border-2 border-blue-500/30 hover:border-blue-500/60",
          "hover:shadow-[0_0_30px_rgba(59,130,246,0.3)]",
          "hover:scale-105"
        )}
        onClick={handleClick}
      >
        <CardContent className="p-6">
          <div className="flex flex-col items-center space-y-4">
            {/* Vault Icon with Glow Effect */}
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full animate-pulse" />
              <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Shield className="w-12 h-12 text-white" />
                <Lock className="absolute bottom-2 right-2 w-5 h-5 text-white/90" />
              </div>
            </div>
            
            {/* Vault Info */}
            <div className="text-center space-y-1 w-full">
              <h4 className="text-lg font-bold truncate w-full flex items-center justify-center gap-2">
                SquidVault
                <div className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-medium">
                  Secure
                </div>
              </h4>
              <p className="text-sm text-muted-foreground">
                Private encrypted storage
              </p>
            </div>
            
            {/* Features */}
            <div className="w-full space-y-2 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Shield className="w-3 h-3" />
                <span>End-to-end encrypted</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Lock className="w-3 h-3" />
                <span>Password protected</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {showVaultModal && (
        <SquidVault 
          userId={userId} 
          onVaultOpen={handleVaultOpen}
        />
      )}
    </>
  );
};

export default SquidVaultFolder;
