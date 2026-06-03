
import React, { useEffect, useRef } from 'react';

interface MonacoEditorProps {
  value: string;
  language: string;
  theme: 'dark' | 'light';
  onChange?: (value: string) => void;
  options?: any;
}

const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value,
  language,
  theme,
  onChange,
  options = {}
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  useEffect(() => {
    const initMonaco = async () => {
      if (!containerRef.current) return;

      try {
        // Dynamic import of Monaco Editor
        const monaco = await import('monaco-editor');
        monacoRef.current = monaco;

        // Configure themes
        monaco.editor.defineTheme('cocoa-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
            { token: 'keyword', foreground: '60A5FA' },
            { token: 'string', foreground: '34D399' },
            { token: 'number', foreground: 'FBBF24' },
            { token: 'type', foreground: '8B5CF6' },
            { token: 'function', foreground: 'F472B6' },
          ],
          colors: {
            'editor.background': '#111827',
            'editor.foreground': '#F9FAFB',
            'editorLineNumber.foreground': '#6B7280',
            'editor.selectionBackground': '#3B82F640',
            'editor.lineHighlightBackground': '#1F2937',
            'editorCursor.foreground': '#60A5FA',
            'scrollbar.shadow': '#00000000',
            'scrollbarSlider.background': '#4B556330',
            'scrollbarSlider.hoverBackground': '#4B556350',
            'scrollbarSlider.activeBackground': '#4B556370',
          }
        });

        monaco.editor.defineTheme('cocoa-light', {
          base: 'vs',
          inherit: true,
          rules: [
            { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
            { token: 'keyword', foreground: '2563EB' },
            { token: 'string', foreground: '059669' },
            { token: 'number', foreground: 'D97706' },
            { token: 'type', foreground: '7C3AED' },
            { token: 'function', foreground: 'DB2777' },
          ],
          colors: {
            'editor.background': '#ffffff',
            'editor.foreground': '#1f2937',
            'editorLineNumber.foreground': '#9ca3af',
            'editor.selectionBackground': '#dbeafe40',
            'editor.lineHighlightBackground': '#f3f4f6',
            'editorCursor.foreground': '#2563eb',
          }
        });

        // Create editor instance
        editorRef.current = monaco.editor.create(containerRef.current, {
          value: value,
          language: language,
          theme: theme === 'dark' ? 'cocoa-dark' : 'cocoa-light',
          fontSize: 14,
          fontFamily: '"JetBrains Mono", "SF Mono", "Monaco", "Inconsolata", "Roboto Mono", "Consolas", monospace',
          lineHeight: 1.6,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          insertSpaces: true,
          renderWhitespace: 'selection',
          wordWrap: 'on',
          wordWrapColumn: 120,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnCommitCharacter: true,
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            bracketPairsHorizontal: true,
            highlightActiveIndentation: true,
            indentation: true
          },
          ...options
        });

        // Handle content changes
        editorRef.current.onDidChangeModelContent(() => {
          if (onChange) {
            onChange(editorRef.current.getValue());
          }
        });

      } catch (error) {
        console.error('Failed to initialize Monaco Editor:', error);
      }
    };

    initMonaco();

    return () => {
      if (editorRef.current) {
        editorRef.current.dispose();
      }
    };
  }, []);

  // Update theme when it changes
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      monacoRef.current.editor.setTheme(theme === 'dark' ? 'cocoa-dark' : 'cocoa-light');
    }
  }, [theme]);

  // Update value when it changes externally
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== value) {
      editorRef.current.setValue(value);
    }
  }, [value]);

  // Update language when it changes
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        monacoRef.current.editor.setModelLanguage(model, language);
      }
    }
  }, [language]);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full"
      style={{ minHeight: '200px' }}
    />
  );
};

export default MonacoEditor;
