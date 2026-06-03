
import React from 'react';
import { HelpCircle } from '@/lib/icon-map';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import HelpContent from './HelpContent';

const HelpIcon = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-muted-foreground hover:text-foreground flex items-center gap-2">
          <HelpCircle className="h-4 w-4" />
          <span className="text-sm">Help</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>SquidCloud Help & Documentation</DialogTitle>
        </DialogHeader>
        <HelpContent />
      </DialogContent>
    </Dialog>
  );
};

export default HelpIcon;
