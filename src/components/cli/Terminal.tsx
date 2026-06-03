
import React, { useState, useEffect, useRef } from 'react';
import { X, Maximize2, Minimize2 } from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CLIProcessor } from './CLIProcessor';
import { useAuth } from '@/contexts/AuthContext';

interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'success' | 'info';
  content: string;
  timestamp: Date;
}

interface TerminalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Terminal: React.FC<TerminalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentPath, setCurrentPath] = useState('/');
  const [isMaximized, setIsMaximized] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cliProcessor = new CLIProcessor();

  useEffect(() => {
    if (isOpen) {
      addLine('info', `SquidCloud CLI v1.0.0 - Welcome ${user?.email}`);
      addLine('info', 'Type "help" for available commands');
      // Focus input after terminal opens
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, user]);

  useEffect(() => {
    scrollToBottom();
  }, [lines]);

  // Ensure input stays focused when terminal is open
  useEffect(() => {
    if (isOpen) {
      const handleClick = () => {
        if (inputRef.current && isOpen) {
          inputRef.current.focus();
        }
      };
      
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [isOpen]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  };

  const addLine = (type: TerminalLine['type'], content: string) => {
    const newLine: TerminalLine = {
      id: Date.now().toString() + Math.random(),
      type,
      content,
      timestamp: new Date()
    };
    setLines(prev => [...prev, newLine]);
  };

  const handleCommand = async (command: string) => {
    if (!command.trim()) return;

    // Add command to history
    setCommandHistory(prev => [...prev, command]);
    setHistoryIndex(-1);

    // Show command in terminal
    addLine('input', `${currentPath}$ ${command}`);
    
    setIsProcessing(true);
    
    try {
      const result = await cliProcessor.processCommand(command, currentPath);
      
      if (result.error) {
        addLine('error', result.output);
      } else {
        addLine(result.type || 'output', result.output);
      }
      
      // Update current path if changed
      if (result.newPath) {
        setCurrentPath(result.newPath);
      }
      
      // Handle special commands
      if (result.action === 'clear') {
        setLines([]);
      } else if (result.action === 'exit') {
        onClose();
      }
    } catch (error) {
      addLine('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (currentInput.trim()) {
        handleCommand(currentInput);
        setCurrentInput('');
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCurrentInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setCurrentInput('');
        } else {
          setHistoryIndex(newIndex);
          setCurrentInput(commandHistory[newIndex]);
        }
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Auto-complete functionality can be added here
    }
  };

  const getLineColor = (type: TerminalLine['type']) => {
    switch (type) {
      case 'error': return 'text-red-400';
      case 'success': return 'text-green-400';
      case 'info': return 'text-blue-400';
      case 'input': return 'text-white';
      default: return 'text-gray-300';
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className={`fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 z-50 transition-all duration-300 ${
        isMaximized ? 'top-0' : 'h-80'
      }`}
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300 font-mono">SquidCloud CLI</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMaximized(!isMaximized)}
            className="text-gray-400 hover:text-white h-6 w-6 p-0"
          >
            {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-400 hover:text-white h-6 w-6 p-0"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Terminal Content */}
      <div className="flex flex-col h-full">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="font-mono text-sm space-y-1">
            {lines.map((line) => (
              <div key={line.id} className={`${getLineColor(line.type)} whitespace-pre-wrap break-words`}>
                {line.content}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Input Line */}
        <div className="p-4 border-t border-gray-700 bg-gray-900">
          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="text-green-400 flex-shrink-0">{currentPath}$</span>
            <input
              ref={inputRef}
              type="text"
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-white outline-none border-none placeholder-gray-500"
              placeholder={isProcessing ? "Processing..." : "Type a command..."}
              disabled={isProcessing}
              autoComplete="off"
              spellCheck={false}
              style={{ 
                background: 'transparent',
                border: 'none',
                outline: 'none',
                boxShadow: 'none'
              }}
            />
            {isProcessing && (
              <div className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-white rounded-full flex-shrink-0"></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
