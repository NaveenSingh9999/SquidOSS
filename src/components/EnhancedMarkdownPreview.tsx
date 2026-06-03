import React, { useMemo, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface EnhancedMarkdownPreviewProps {
  content: string;
  className?: string;
}

// Parse and render LaTeX expressions
const renderLatex = (text: string, displayMode: boolean = false): string => {
  try {
    return katex.renderToString(text, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: false,
    });
  } catch (e) {
    return `<span class="text-destructive">${text}</span>`;
  }
};

const sanitizeHtml = (html: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove high-risk tags entirely.
  doc
    .querySelectorAll('script,iframe,object,embed,style,link,meta,base,form,input,button,textarea,select,option')
    .forEach((node) => node.remove());

  doc.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();

      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        return;
      }

      if (['src', 'href', 'xlink:href'].includes(name)) {
        if (value.startsWith('javascript:') || value.startsWith('data:text/html')) {
          el.removeAttribute(attr.name);
        }
      }
    });
  });

  return doc.body.innerHTML;
};

// Process code blocks with syntax highlighting
const processCodeBlock = (code: string, language: string): string => {
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  return `<div class="liquid-glass-code relative group my-4 rounded-xl overflow-hidden">
    <div class="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border/50">
      <span class="text-xs font-medium text-muted-foreground">${language || 'code'}</span>
      <button class="opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary" onclick="navigator.clipboard.writeText(this.parentElement.nextElementSibling.textContent)">Copy</button>
    </div>
    <pre class="p-4 overflow-x-auto"><code class="text-sm font-mono">${escaped}</code></pre>
  </div>`;
};

// Process tables
const processTable = (tableContent: string): string => {
  const lines = tableContent.trim().split('\n').filter(line => line.trim());
  if (lines.length < 2) return tableContent;
  
  const parseRow = (row: string) => 
    row.split('|').map(cell => cell.trim()).filter(cell => cell);
  
  const headers = parseRow(lines[0]);
  const alignments = lines[1].includes('-') ? parseRow(lines[1]).map(cell => {
    if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
    if (cell.endsWith(':')) return 'right';
    return 'left';
  }) : headers.map(() => 'left');
  
  const bodyRows = lines.slice(2).map(parseRow);
  
  const headerHtml = headers.map((h, i) => 
    `<th class="px-4 py-3 text-left font-semibold text-foreground" style="text-align: ${alignments[i]}">${h}</th>`
  ).join('');
  
  const bodyHtml = bodyRows.map(row => 
    `<tr class="border-b border-border/50 hover:bg-muted/30 transition-colors">${row.map((cell, i) => 
      `<td class="px-4 py-3" style="text-align: ${alignments[i] || 'left'}">${cell}</td>`
    ).join('')}</tr>`
  ).join('');
  
  return `<div class="liquid-glass-table my-4 rounded-xl overflow-hidden border border-border/50">
    <table class="w-full">
      <thead class="bg-muted/50"><tr class="border-b border-border">${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  </div>`;
};

// Main markdown processor
const processMarkdown = (content: string): string => {
  let html = content;
  
  // Process LaTeX block equations ($$...$$)
  html = html.replace(/\$\$([^$]+)\$\$/g, (_, latex) => {
    return `<div class="my-4 overflow-x-auto py-2">${renderLatex(latex.trim(), true)}</div>`;
  });
  
  // Process inline LaTeX ($...$)
  html = html.replace(/\$([^$\n]+)\$/g, (_, latex) => {
    return renderLatex(latex.trim(), false);
  });
  
  // Process code blocks (```language...```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return processCodeBlock(code.trim(), lang);
  });
  
  // Process inline code (`...`)
  html = html.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">$1</code>');
  
  // Process tables
  html = html.replace(/((?:\|[^\n]+\|\n)+)/g, (match) => {
    if (match.includes('---') || match.includes(':--')) {
      return processTable(match);
    }
    return match;
  });
  
  // Headers with anchor links
  html = html.replace(/^######\s+(.+)$/gm, '<h6 class="text-sm font-semibold mt-4 mb-2 text-foreground">$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5 class="text-base font-semibold mt-4 mb-2 text-foreground">$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4 class="text-lg font-semibold mt-5 mb-2 text-foreground">$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3 class="text-xl font-bold mt-6 mb-3 text-foreground">$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2 class="text-2xl font-bold mt-8 mb-4 text-foreground border-b border-border/50 pb-2">$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1 class="text-3xl font-bold mt-8 mb-4 text-foreground">$1</h1>');
  
  // Bold and Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>');
  html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
  html = html.replace(/__(.+?)__/g, '<strong class="font-semibold">$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em class="italic">$1</em>');
  
  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del class="line-through text-muted-foreground">$1</del>');
  
  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote class="border-l-4 border-primary/50 pl-4 py-2 my-4 italic text-muted-foreground bg-muted/30 rounded-r-lg">$1</blockquote>');
  
  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr class="my-8 border-border/50" />');
  html = html.replace(/^\*\*\*+$/gm, '<hr class="my-8 border-border/50" />');
  
  // Unordered lists
  html = html.replace(/^[-*+]\s+(.+)$/gm, '<li class="ml-4 list-disc list-inside py-1">$1</li>');
  
  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal list-inside py-1">$1</li>');
  
  // Task lists
  html = html.replace(/^[-*]\s+\[x\]\s+(.+)$/gmi, '<li class="ml-4 flex items-center gap-2 py-1"><span class="w-4 h-4 rounded border border-primary bg-primary/20 flex items-center justify-center text-xs">✓</span><span class="line-through text-muted-foreground">$1</span></li>');
  html = html.replace(/^[-*]\s+\[\s?\]\s+(.+)$/gm, '<li class="ml-4 flex items-center gap-2 py-1"><span class="w-4 h-4 rounded border border-border bg-background"></span><span>$1</span></li>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary hover:underline" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full h-auto rounded-xl my-4 shadow-lg" loading="lazy" />');
  
  // Paragraphs (wrap remaining text)
  html = html.replace(/\n\n/g, '</p><p class="my-4 leading-relaxed">');
  
  // Line breaks
  html = html.replace(/\n/g, '<br />');
  
  return `<p class="my-4 leading-relaxed">${html}</p>`;
};

const EnhancedMarkdownPreview: React.FC<EnhancedMarkdownPreviewProps> = ({
  content,
  className
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const renderedContent = useMemo(() => {
    if (!content) return '';
    return sanitizeHtml(processMarkdown(content));
  }, [content]);
  
  // Add copy functionality to code blocks after render
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const buttons = Array.from(container.querySelectorAll('button'));
    const listeners: Array<{ button: Element; handler: () => void }> = [];

    buttons.forEach((button) => {
      const handler = () => {
        const codeBlock = button.closest('.liquid-glass-code')?.querySelector('code');
        if (codeBlock) {
          navigator.clipboard.writeText(codeBlock.textContent || '');
        }
      };
      button.addEventListener('click', handler);
      listeners.push({ button, handler });
    });

    return () => {
      listeners.forEach(({ button, handler }) => {
        button.removeEventListener('click', handler);
      });
    };
  }, [renderedContent]);
  
  return (
    <div
      ref={containerRef}
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "prose-headings:text-foreground prose-p:text-foreground/90",
        "prose-a:text-primary prose-strong:text-foreground",
        "prose-code:text-primary prose-pre:bg-transparent",
        className
      )}
      dangerouslySetInnerHTML={{ __html: renderedContent }}
    />
  );
};

export default EnhancedMarkdownPreview;
