
import React, { useState } from 'react';
import { Terminal as TerminalIcon } from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { Terminal } from './Terminal';
import { useAuth } from '@/contexts/AuthContext';

export const CLIButton: React.FC = () => {
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const { user } = useAuth();

  if (!user) {
    return null; // Only show CLI for authenticated users
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsTerminalOpen(true)}
        className="flex items-center gap-2"
        title="Open SquidCloud CLI"
      >
        <TerminalIcon className="h-4 w-4" />
        <span className="hidden sm:inline">CLI</span>
      </Button>
      
      <Terminal 
        isOpen={isTerminalOpen} 
        onClose={() => setIsTerminalOpen(false)} 
      />
    </>
  );
};
