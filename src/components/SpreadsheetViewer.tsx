import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal
} from '@/components/ui/dropdown-menu';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Calculator,
  Download,
  Upload,
  Save,
  Undo,
  Redo,
  Copy,
  ClipboardPaste,
  Search,
  Filter,
  SortAsc,
  SortDesc,
  BarChart3,
  PieChart,
  TrendingUp,
  Settings,
  Plus,
  Minus,
  Grid3X3,
  FileSpreadsheet,
  ChevronDown,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Layers,
  Merge,
  Split,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Maximize2,
  Minimize2,
  MoreHorizontal
} from '@/lib/icon-map';
import { useToast } from '@/hooks/use-toast';
import { parseCSV, arrayToCSV, spreadsheetToCSV } from '@/lib/spreadsheet-utils';

interface CellData {
  value: any;
  formula?: string;
  type: 'text' | 'number' | 'formula' | 'date' | 'boolean';
  format?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;
    backgroundColor?: string;
    fontSize?: number;
    align?: 'left' | 'center' | 'right';
    border?: string;
  };
}

interface SheetData {
  [key: string]: CellData;
}

interface Worksheet {
  id: string;
  name: string;
  data: SheetData;
  columnWidths: { [key: string]: number };
  rowHeights: { [key: number]: number };
}

interface SpreadsheetViewerProps {
  src: string;
  fileName: string;
  onDownload?: () => void;
  onSave?: (data: any) => void;
}

// Built-in spreadsheet functions
const SPREADSHEET_FUNCTIONS = {
  // Math functions
  SUM: (range: number[]) => range.reduce((a, b) => a + b, 0),
  AVERAGE: (range: number[]) => range.reduce((a, b) => a + b, 0) / range.length,
  COUNT: (range: any[]) => range.filter(x => typeof x === 'number').length,
  MIN: (range: number[]) => Math.min(...range),
  MAX: (range: number[]) => Math.max(...range),
  ROUND: (num: number, digits: number = 0) => Math.round(num * Math.pow(10, digits)) / Math.pow(10, digits),
  
  // Logic functions
  IF: (condition: boolean, trueValue: any, falseValue: any) => condition ? trueValue : falseValue,
  AND: (...conditions: boolean[]) => conditions.every(Boolean),
  OR: (...conditions: boolean[]) => conditions.some(Boolean),
  NOT: (condition: boolean) => !condition,
  
  // Text functions
  CONCATENATE: (...texts: any[]) => texts.join(''),
  LEFT: (text: string, chars: number) => text.substring(0, chars),
  RIGHT: (text: string, chars: number) => text.substring(text.length - chars),
  MID: (text: string, start: number, chars: number) => text.substring(start - 1, start - 1 + chars),
  TRIM: (text: string) => text.trim(),
  UPPER: (text: string) => text.toUpperCase(),
  LOWER: (text: string) => text.toLowerCase(),
  
  // Date functions
  TODAY: () => new Date(),
  NOW: () => new Date(),
  YEAR: (date: Date) => date.getFullYear(),
  MONTH: (date: Date) => date.getMonth() + 1,
  DAY: (date: Date) => date.getDate(),
};

const SpreadsheetViewer: React.FC<SpreadsheetViewerProps> = ({
  src,
  fileName,
  onDownload,
  onSave
}) => {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Spreadsheet state
  const [worksheets, setWorksheets] = useState<Worksheet[]>([
    {
      id: 'sheet1',
      name: 'Sheet1',
      data: {},
      columnWidths: {},
      rowHeights: {}
    }
  ]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [selectedCell, setSelectedCell] = useState<string>('A1');
  const [selectedRange, setSelectedRange] = useState<string[]>([]);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [formulaBar, setFormulaBar] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<string | null>(null);
  
  // UI state
  const [showFormulaBar, setShowFormulaBar] = useState(true);
  const [showGridLines, setShowGridLines] = useState(true);
  const [showRowHeaders, setShowRowHeaders] = useState(true);
  const [showColumnHeaders, setShowColumnHeaders] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [viewMode, setViewMode] = useState<'normal' | 'compact' | 'expanded'>('normal');
  
  // History for undo/redo
  const [history, setHistory] = useState<SheetData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Filter and sort state
  const [activeFilters, setActiveFilters] = useState<{[column: string]: string}>({});
  const [sortConfig, setSortConfig] = useState<{column: string; direction: 'asc' | 'desc'} | null>(null);
  
    // Generate column letters (A, B, C, ..., AA, AB, etc.)
  const getColumnLetter = useCallback((index: number): string => {
    let result = '';
    while (index >= 0) {
      result = String.fromCharCode(65 + (index % 26)) + result;
      index = Math.floor(index / 26) - 1;
    }
    return result;
  }, []);
  
  // Convert cell reference to coordinates
  const cellToCoords = useCallback((cell: string): [number, number] => {
    const match = cell.match(/^([A-Z]+)(\d+)$/);
    if (!match) return [0, 0];
    
    let col = 0;
    for (let i = 0; i < match[1].length; i++) {
      col = col * 26 + (match[1].charCodeAt(i) - 64);
    }
    col -= 1;
    
    const row = parseInt(match[2]) - 1;
    return [row, col];
  }, []);
  
  // Convert coordinates to cell reference
  const coordsToCell = useCallback((row: number, col: number): string => {
    return getColumnLetter(col) + (row + 1);
  }, [getColumnLetter]);

  // Load spreadsheet data from URL
  useEffect(() => {
    const loadSpreadsheetData = async () => {
      try {
        const response = await fetch(src);
        const text = await response.text();
        
        // Determine file type and parse accordingly
        if (fileName.endsWith('.csv')) {
          const csvData = parseCSV(text);
          const newData: SheetData = {};
          
          csvData.forEach((row, rowIndex) => {
            row.forEach((cell, colIndex) => {
              const cellRef = coordsToCell(rowIndex, colIndex);
              newData[cellRef] = {
                value: cell,
                type: !isNaN(Number(cell)) && cell !== '' ? 'number' : 'text',
                format: {}
              };
            });
          });
          
          setWorksheets([{
            id: 'sheet1',
            name: 'Sheet1',
            data: newData,
            columnWidths: {},
            rowHeights: {}
          }]);
        } else {
          // Handle other formats (Excel, ODS) - would need specialized parsers
          toast({
            title: "Format not supported",
            description: "Only CSV files are currently supported for editing",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('Failed to load spreadsheet:', error);
        toast({
          title: "Load failed",
          description: "Failed to load spreadsheet data",
          variant: "destructive"
        });
      }
    };
    
    if (src) {
      loadSpreadsheetData();
    }
  }, [src, fileName, toast, coordsToCell]);
  
  // Context menu handling
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cell: string } | null>(null);
  const [clipboard, setClipboard] = useState<{cells: {[key: string]: CellData}, type: 'copy' | 'cut'} | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, cell: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      cell
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu, closeContextMenu]);
  
  // Get cell value with proper evaluation
  const getCellValue = useCallback((cell: string): any => {
    const currentSheet = worksheets[activeSheet];
    const cellData = currentSheet?.data[cell];
    
    if (!cellData) return '';
    
    if (cellData.type === 'formula' && cellData.formula) {
      try {
        return evaluateFormula(cellData.formula, currentSheet.data);
      } catch (error) {
        return '#ERROR!';
      }
    }
    
    return cellData.value || '';
  }, [worksheets, activeSheet]);

  // Get cell display value (what user sees)
  const getCellDisplayValue = useCallback((cell: string): string => {
    const value = getCellValue(cell);
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return String(value);
  }, [getCellValue]);

  // Get cell raw value (for editing)
  const getCellRawValue = useCallback((cell: string): string => {
    const currentSheet = worksheets[activeSheet];
    const cellData = currentSheet?.data[cell];
    
    if (!cellData) return '';
    if (cellData.formula) return cellData.formula;
    return String(cellData.value || '');
  }, [worksheets, activeSheet]);
  
  // Simple formula evaluator (basic implementation)
  const evaluateFormula = useCallback((formula: string, data: SheetData): any => {
    // Remove = sign
    formula = formula.substring(1);
    
    // Handle basic functions
    for (const [funcName, func] of Object.entries(SPREADSHEET_FUNCTIONS)) {
      const regex = new RegExp(`${funcName}\\(([^)]+)\\)`, 'gi');
      const match = regex.exec(formula);
      
      if (match) {
        const args = match[1].split(',').map(arg => {
          arg = arg.trim();
          
          // If it's a cell reference, get the value
          if (/^[A-Z]+\d+$/.test(arg)) {
            const cellData = data[arg];
            return cellData ? cellData.value : 0;
          }
          
          // If it's a number, parse it
          if (!isNaN(Number(arg))) {
            return Number(arg);
          }
          
          // If it's a string, remove quotes
          if (arg.startsWith('"') && arg.endsWith('"')) {
            return arg.slice(1, -1);
          }
          
          return arg;
        });
        
        return (func as any)(...args);
      }
    }
    
    // Handle basic arithmetic
    try {
      // Replace cell references with values
      let processedFormula = formula;
      const cellRefs = formula.match(/[A-Z]+\d+/g) || [];
      
      for (const cellRef of cellRefs) {
        const cellData = data[cellRef];
        const value = cellData ? cellData.value : 0;
        processedFormula = processedFormula.replace(cellRef, String(value));
      }
      
      // Evaluate the expression (unsafe - would need proper parser in production)
      return Function(`"use strict"; return (${processedFormula})`)();
    } catch (error) {
      return '#ERROR!';
    }
  }, []);
  
  // Multi-cell selection functions
  const getRangeFromSelection = useCallback((start: string, end: string): string[] => {
    const [startRow, startCol] = cellToCoords(start);
    const [endRow, endCol] = cellToCoords(end);
    
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);
    
    const range: string[] = [];
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        range.push(coordsToCell(row, col));
      }
    }
    return range;
  }, [cellToCoords, coordsToCell]);

  const isCellInRange = useCallback((cell: string, range: string[]): boolean => {
    return range.includes(cell);
  }, []);

  // Handle cell selection with range support
  const handleCellClick = useCallback((cell: string, event?: React.MouseEvent) => {
    if (event?.shiftKey && selectedCell && !isSelecting) {
      // Extend selection
      const range = getRangeFromSelection(selectedCell, cell);
      setSelectedRange(range);
      setSelectedCell(cell);
    } else if (event?.ctrlKey || event?.metaKey) {
      // Multi-select
      if (selectedRange.includes(cell)) {
        setSelectedRange(prev => prev.filter(c => c !== cell));
      } else {
        setSelectedRange(prev => [...prev, cell]);
      }
    } else {
      // Single select
      setSelectedCell(cell);
      setSelectedRange([]);
      setEditingCell(null);
      
      const rawValue = getCellRawValue(cell);
      setFormulaBar(rawValue);
    }
  }, [selectedCell, isSelecting, getRangeFromSelection, getCellRawValue, selectedRange]);

  // Handle mouse selection for range
  const handleMouseDown = useCallback((cell: string, event: React.MouseEvent) => {
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
      setIsSelecting(true);
      setSelectionStart(cell);
      setSelectedCell(cell);
      setSelectedRange([]);
    }
  }, []);

  const handleMouseEnter = useCallback((cell: string) => {
    if (isSelecting && selectionStart) {
      const range = getRangeFromSelection(selectionStart, cell);
      setSelectedRange(range);
    }
  }, [isSelecting, selectionStart, getRangeFromSelection]);

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false);
    setSelectionStart(null);
  }, []);

  // Handle cell double click for editing
  const handleCellDoubleClick = useCallback((cell: string) => {
    setEditingCell(cell);
    setSelectedRange([]);
    const rawValue = getCellRawValue(cell);
    setFormulaBar(rawValue);
  }, [getCellRawValue]);
  
  // Update cell value with history tracking
  const updateCell = useCallback((cell: string, value: any, type?: CellData['type']) => {
    const currentSheet = worksheets[activeSheet];
    
    // Save to history before change
    if (historyIndex === -1 || historyIndex === history.length - 1) {
      setHistory(prev => [...prev, { ...currentSheet.data }]);
      setHistoryIndex(prev => prev + 1);
    }

    // Determine type if not provided
    let cellType: CellData['type'] = type || 'text';
    if (!type) {
      if (typeof value === 'string' && value.startsWith('=')) {
        cellType = 'formula';
      } else if (!isNaN(Number(value)) && value !== '' && typeof value !== 'string') {
        cellType = 'number';
      } else if (typeof value === 'boolean') {
        cellType = 'boolean';
      } else if (value instanceof Date) {
        cellType = 'date';
      }
    }

    setWorksheets(prev => {
      const newWorksheets = [...prev];
      const newSheet = { ...newWorksheets[activeSheet] };
      
      newSheet.data = {
        ...newSheet.data,
        [cell]: {
          value: cellType === 'formula' ? value : value,
          type: cellType,
          formula: cellType === 'formula' ? value : undefined,
          format: newSheet.data[cell]?.format || {}
        }
      };
      
      newWorksheets[activeSheet] = newSheet;
      return newWorksheets;
    });
  }, [activeSheet, worksheets, history, historyIndex]);
  
  // Copy/paste functionality
  const copySelectedCells = useCallback(() => {
    const cellsToCopy = selectedRange.length > 0 ? selectedRange : (selectedCell ? [selectedCell] : []);
    const clipboardData: {[key: string]: CellData} = {};
    
    cellsToCopy.forEach(cell => {
      const cellData = worksheets[activeSheet].data[cell];
      if (cellData) {
        clipboardData[cell] = { ...cellData };
      }
    });
    
    setClipboard({ cells: clipboardData, type: 'copy' });
    toast({ title: "Copied", description: `${cellsToCopy.length} cells copied to clipboard` });
  }, [selectedRange, selectedCell, worksheets, activeSheet, toast]);

  const pasteClipboardCells = useCallback(() => {
    if (!clipboard || !selectedCell) return;
    
    const [startRow, startCol] = cellToCoords(selectedCell);
    const clipboardCells = Object.keys(clipboard.cells);
    
    if (clipboardCells.length === 0) return;
    
    // Calculate relative positions
    const firstCell = clipboardCells[0];
    const [firstRow, firstCol] = cellToCoords(firstCell);
    
    clipboardCells.forEach(cell => {
      const [row, col] = cellToCoords(cell);
      const relativeRow = row - firstRow;
      const relativeCol = col - firstCol;
      const targetCell = coordsToCell(startRow + relativeRow, startCol + relativeCol);
      
      updateCell(targetCell, clipboard.cells[cell].value, clipboard.cells[cell].type);
    });
    
    toast({ title: "Pasted", description: `${clipboardCells.length} cells pasted` });
  }, [clipboard, selectedCell, cellToCoords, coordsToCell, updateCell, toast]);
  
  // Handle formula bar change
  const handleFormulaBarChange = useCallback((value: string) => {
    setFormulaBar(value);
  }, []);

  // Apply formula bar value to cell
  const applyFormulaBarValue = useCallback(() => {
    if (selectedCell && formulaBar !== undefined) {
      updateCell(selectedCell, formulaBar);
      // Recalculate dependent cells would go here
    }
  }, [selectedCell, formulaBar, updateCell]);

  // Keyboard navigation and shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!selectedCell) return;

    // Handle copy/paste shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'c':
          e.preventDefault();
          copySelectedCells();
          return;
        case 'v':
          e.preventDefault();
          pasteClipboardCells();
          return;
        case 'z':
          e.preventDefault();
          if (e.shiftKey) {
            // Redo
            if (historyIndex < history.length - 1) {
              const nextData = history[historyIndex + 1];
              setWorksheets(prev => {
                const newWorksheets = [...prev];
                newWorksheets[activeSheet] = { ...newWorksheets[activeSheet], data: nextData };
                return newWorksheets;
              });
              setHistoryIndex(prev => prev + 1);
            }
          } else {
            // Undo
            if (historyIndex > 0) {
              const prevData = history[historyIndex - 1];
              setWorksheets(prev => {
                const newWorksheets = [...prev];
                newWorksheets[activeSheet] = { ...newWorksheets[activeSheet], data: prevData };
                return newWorksheets;
              });
              setHistoryIndex(prev => prev - 1);
            }
          }
          return;
      }
    }

    const [row, col] = cellToCoords(selectedCell);
    let newCell = selectedCell;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        newCell = coordsToCell(Math.max(0, row - 1), col);
        break;
      case 'ArrowDown':
        e.preventDefault();
        newCell = coordsToCell(row + 1, col);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        newCell = coordsToCell(row, Math.max(0, col - 1));
        break;
      case 'ArrowRight':
        e.preventDefault();
        newCell = coordsToCell(row, col + 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (editingCell) {
          applyFormulaBarValue();
          setEditingCell(null);
          newCell = coordsToCell(row + 1, col);
        } else {
          setEditingCell(selectedCell);
          return;
        }
        break;
      case 'Tab':
        e.preventDefault();
        if (editingCell) {
          applyFormulaBarValue();
          setEditingCell(null);
        }
        newCell = coordsToCell(row, col + 1);
        break;
      case 'Escape':
        e.preventDefault();
        if (editingCell) {
          setEditingCell(null);
          const rawValue = getCellRawValue(selectedCell);
          setFormulaBar(rawValue);
        }
        return;
      case 'F2':
        e.preventDefault();
        setEditingCell(selectedCell);
        return;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (!editingCell) {
          const cellsToDelete = selectedRange.length > 0 ? selectedRange : [selectedCell];
          cellsToDelete.forEach(cell => updateCell(cell, ''));
        }
        return;
      default:
        if (!editingCell && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          setEditingCell(selectedCell);
          setFormulaBar(e.key);
          return;
        }
        return;
    }

    handleCellClick(newCell);
  }, [selectedCell, editingCell, selectedRange, cellToCoords, coordsToCell, handleCellClick, applyFormulaBarValue, getCellRawValue, updateCell, copySelectedCells, pasteClipboardCells, history, historyIndex, activeSheet, setWorksheets, setHistoryIndex]);

  // Apply range functions
  const applyRangeFunction = useCallback((func: string) => {
    if (selectedRange.length === 0) return;

    const values = selectedRange.map(cell => {
      const value = getCellValue(cell);
      return typeof value === 'number' ? value : parseFloat(value) || 0;
    }).filter(v => !isNaN(v));

    if (values.length === 0) return;

    let result: any = '';
    switch (func) {
      case 'SUM':
        result = values.reduce((a, b) => a + b, 0);
        break;
      case 'AVERAGE':
        result = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'COUNT':
        result = values.length;
        break;
      case 'MIN':
        result = Math.min(...values);
        break;
      case 'MAX':
        result = Math.max(...values);
        break;
    }

    // Find next empty cell to put result
    const [row, col] = cellToCoords(selectedRange[selectedRange.length - 1]);
    const resultCell = coordsToCell(row + 1, col);
    updateCell(resultCell, result, 'number');
    handleCellClick(resultCell);
    
    toast({
      title: "Function Applied",
      description: `${func} result: ${result} placed in ${resultCell}`
    });
  }, [selectedRange, getCellValue, cellToCoords, coordsToCell, updateCell, handleCellClick, toast]);
  
  // Render grid rows with improved cell handling
  const renderRows = useMemo(() => {
    const rows = [];
    const rowCount = 100; // Show more rows
    const colCount = 26; // Show 26 columns (A-Z)
    
    for (let row = 0; row < rowCount; row++) {
      const cells = [];
      
      // Row header
      if (showRowHeaders) {
        cells.push(
          <TableCell 
            key="header" 
            className={`
              w-12 bg-gray-100 dark:bg-gray-800 text-center font-semibold border-r 
              sticky left-0 z-10 text-xs cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700
              ${viewMode === 'compact' ? 'h-6' : viewMode === 'expanded' ? 'h-10' : 'h-8'}
            `}
            style={{ fontSize: `${zoomLevel * 0.01 * 12}px` }}
          >
            {row + 1}
          </TableCell>
        );
      }
      
      // Data cells
      for (let col = 0; col < colCount; col++) {
        const cellRef = coordsToCell(row, col);
        const isSelected = selectedCell === cellRef;
        const isInRange = isCellInRange(cellRef, selectedRange);
        const isEditing = editingCell === cellRef;
        const cellValue = getCellDisplayValue(cellRef);
        const currentSheet = worksheets[activeSheet];
        const cellData = currentSheet?.data[cellRef];
        
        cells.push(
          <TableCell 
            key={cellRef}
            className={`
              min-w-[80px] p-1 border cursor-cell relative group
              ${isSelected ? 'bg-blue-100 dark:bg-blue-900/50 ring-2 ring-blue-500 z-20' : ''}
              ${isInRange ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-300' : ''}
              ${showGridLines ? 'border-gray-200 dark:border-gray-700' : 'border-transparent'}
              ${viewMode === 'compact' ? 'h-6' : viewMode === 'expanded' ? 'h-10' : 'h-8'}
              hover:bg-gray-50 dark:hover:bg-gray-800
            `}
            style={{ 
              fontSize: `${zoomLevel * 0.01 * 12}px`,
              backgroundColor: cellData?.format?.backgroundColor,
              color: cellData?.format?.color,
              fontWeight: cellData?.format?.bold ? 'bold' : 'normal',
              fontStyle: cellData?.format?.italic ? 'italic' : 'normal',
              textDecoration: cellData?.format?.underline ? 'underline' : 'none',
              textAlign: cellData?.format?.align || 'left'
            }}
            onClick={(e) => handleCellClick(cellRef, e)}
            onDoubleClick={() => handleCellDoubleClick(cellRef)}
            onMouseDown={(e) => handleMouseDown(cellRef, e)}
            onMouseEnter={() => handleMouseEnter(cellRef)}
            onMouseUp={handleMouseUp}
            onContextMenu={(e) => handleContextMenu(e, cellRef)}
          >
            {isEditing ? (
              <Input
                value={formulaBar}
                onChange={(e) => handleFormulaBarChange(e.target.value)}
                onBlur={() => {
                  applyFormulaBarValue();
                  setEditingCell(null);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    applyFormulaBarValue();
                    setEditingCell(null);
                    const [r, c] = cellToCoords(cellRef);
                    handleCellClick(coordsToCell(r + 1, c));
                  }
                  if (e.key === 'Escape') {
                    setEditingCell(null);
                    const rawValue = getCellRawValue(cellRef);
                    setFormulaBar(rawValue);
                  }
                }}
                className="w-full h-full p-1 text-xs border-none bg-white dark:bg-gray-900"
                autoFocus
              />
            ) : (
              <div className={`
                truncate text-xs px-1 py-0.5 w-full h-full flex items-center
                ${cellData?.type === 'number' ? 'justify-end' : 'justify-start'}
                ${cellData?.type === 'formula' ? 'italic' : ''}
              `}>
                {cellValue}
              </div>
            )}
            
            {/* Cell indicator for formulas */}
            {cellData?.type === 'formula' && !isEditing && (
              <div className="absolute top-0 left-0 w-2 h-2 bg-green-500 opacity-60"></div>
            )}
            
            {/* Selection handle for dragging */}
            {isSelected && !isEditing && (
              <div className="absolute bottom-0 right-0 w-2 h-2 bg-blue-500 cursor-crosshair opacity-0 group-hover:opacity-100"></div>
            )}
          </TableCell>
        );
      }
      
      rows.push(
        <TableRow key={row} className={viewMode === 'compact' ? 'h-6' : viewMode === 'expanded' ? 'h-10' : 'h-8'}>
          {cells}
        </TableRow>
      );
    }
    
    return rows;
  }, [
    showRowHeaders, 
    showGridLines, 
    selectedCell, 
    selectedRange,
    editingCell, 
    formulaBar, 
    getCellDisplayValue,
    getCellRawValue,
    coordsToCell, 
    cellToCoords,
    handleCellClick, 
    handleCellDoubleClick, 
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp,
    handleFormulaBarChange,
    applyFormulaBarValue,
    isCellInRange,
    worksheets,
    activeSheet,
    zoomLevel,
    viewMode
  ]);
  
  // Column headers
  const renderColumnHeaders = useMemo(() => {
    if (!showColumnHeaders) return null;
    
    const headers = [];
    const colCount = 26;
    
    if (showRowHeaders) {
      headers.push(
        <TableHead key="corner" className="w-12 bg-gray-100 dark:bg-gray-800 sticky left-0 z-20">
        </TableHead>
      );
    }
    
    for (let col = 0; col < colCount; col++) {
      const letter = getColumnLetter(col);
      headers.push(
        <TableHead 
          key={letter} 
          className="min-w-[80px] h-8 bg-gray-100 dark:bg-gray-800 text-center font-semibold text-xs"
        >
          {letter}
        </TableHead>
      );
    }
    
    return (
      <TableHeader className="sticky top-0 z-10">
        <TableRow>
          {headers}
        </TableRow>
      </TableHeader>
    );
  }, [showColumnHeaders, showRowHeaders, getColumnLetter]);
  
  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!isFullscreen && containerRef.current) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };
  
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Mobile UI
  if (isMobile) {
    return (
      <div 
        ref={containerRef}
        className={`flex flex-col h-full bg-[#0a0a0f] ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
      >
        {/* Mobile Header */}
        <div className="flex items-center justify-between p-3 border-b border-white/10 bg-[#0a0a0f]/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-green-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">{fileName}</h2>
              <p className="text-xs text-gray-500">
                {Object.keys(worksheets[activeSheet].data).length} cells • Sheet {activeSheet + 1}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              className="h-9 w-9 p-0 text-gray-400 hover:text-white hover:bg-white/5"
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Cell Info Bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-white/5">
          <span className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 text-sm font-mono font-medium min-w-[50px] text-center">
            {selectedCell}
          </span>
          <Input
            value={formulaBar}
            onChange={(e) => setFormulaBar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleFormulaBarChange(formulaBar);
              }
            }}
            placeholder="Enter value or formula..."
            className="flex-1 h-9 bg-black/30 border-white/10 text-white placeholder:text-gray-500 text-sm rounded-lg"
          />
        </div>

        {/* Mobile Quick Actions */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-white/5 overflow-x-auto">
          {/* Undo/Redo */}
          <button
            disabled={historyIndex <= 0}
            onClick={() => {
              if (historyIndex > 0) {
                const prevData = history[historyIndex - 1];
                setWorksheets(prev => {
                  const newWorksheets = [...prev];
                  newWorksheets[activeSheet] = { ...newWorksheets[activeSheet], data: prevData };
                  return newWorksheets;
                });
                setHistoryIndex(prev => prev - 1);
              }
            }}
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-white/5 text-gray-400 disabled:opacity-40 active:bg-white/10 flex-shrink-0"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            disabled={historyIndex >= history.length - 1}
            onClick={() => {
              if (historyIndex < history.length - 1) {
                const nextData = history[historyIndex + 1];
                setWorksheets(prev => {
                  const newWorksheets = [...prev];
                  newWorksheets[activeSheet] = { ...newWorksheets[activeSheet], data: nextData };
                  return newWorksheets;
                });
                setHistoryIndex(prev => prev + 1);
              }
            }}
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-white/5 text-gray-400 disabled:opacity-40 active:bg-white/10 flex-shrink-0"
          >
            <Redo className="w-4 h-4" />
          </button>
          
          <div className="w-px h-6 bg-white/10 mx-1" />
          
          {/* Formatting */}
          <button className="h-9 w-9 flex items-center justify-center rounded-lg bg-white/5 text-gray-400 active:bg-white/10 flex-shrink-0">
            <Bold className="w-4 h-4" />
          </button>
          <button className="h-9 w-9 flex items-center justify-center rounded-lg bg-white/5 text-gray-400 active:bg-white/10 flex-shrink-0">
            <Italic className="w-4 h-4" />
          </button>
          
          <div className="w-px h-6 bg-white/10 mx-1" />
          
          {/* Functions - Only show when range selected */}
          {selectedRange.length > 1 && (
            <>
              <button
                onClick={() => applyRangeFunction('SUM')}
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-blue-500/20 text-blue-400 active:bg-blue-500/30 text-xs font-medium flex-shrink-0"
              >
                <Calculator className="w-3.5 h-3.5" />
                SUM
              </button>
              <button
                onClick={() => applyRangeFunction('AVERAGE')}
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-purple-500/20 text-purple-400 active:bg-purple-500/30 text-xs font-medium flex-shrink-0"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                AVG
              </button>
            </>
          )}
        </div>

        {/* Mobile Sheet Tabs */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/5 bg-black/20 overflow-x-auto">
          {worksheets.map((sheet, index) => (
            <button
              key={sheet.id}
              onClick={() => setActiveSheet(index)}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0
                ${index === activeSheet 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                  : 'bg-white/5 text-gray-400 border border-transparent'}
              `}
            >
              {sheet.name}
            </button>
          ))}
          <button className="h-7 w-7 flex items-center justify-center rounded-lg bg-white/5 text-gray-500">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile Spreadsheet Grid */}
        <div className="flex-1 overflow-auto bg-[#0a0a0f]">
          <Table className="border-collapse">
            {/* Column Headers */}
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="bg-[#1a1a2e]">
                {showRowHeaders && (
                  <TableHead className="w-10 bg-[#1a1a2e] sticky left-0 z-20 border-r border-b border-white/10 text-gray-500">
                  </TableHead>
                )}
                {Array.from({ length: 26 }, (_, i) => (
                  <TableHead 
                    key={i} 
                    className="min-w-[80px] h-8 bg-[#1a1a2e] text-center font-medium text-xs text-gray-400 border-b border-white/10"
                  >
                    {getColumnLetter(i)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {renderRows}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Bottom Actions */}
        <div className="border-t border-white/10 bg-[#0a0a0f] p-3 space-y-2">
          {/* Range Stats */}
          {selectedRange.length > 1 && (() => {
            const values = selectedRange.map(cell => {
              const cellData = worksheets[activeSheet].data[cell];
              const value = cellData?.value || '';
              return typeof value === 'string' && !isNaN(Number(value)) ? Number(value) : 0;
            }).filter(v => !isNaN(v) && v !== 0);
            
            if (values.length > 0) {
              const sum = values.reduce((a, b) => a + b, 0);
              const avg = sum / values.length;
              return (
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  <div className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs flex-shrink-0">
                    <span className="text-gray-400">Sum:</span>
                    <span className="ml-1 text-blue-400 font-medium">{sum.toFixed(2)}</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-xs flex-shrink-0">
                    <span className="text-gray-400">Avg:</span>
                    <span className="ml-1 text-green-400 font-medium">{avg.toFixed(2)}</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs flex-shrink-0">
                    <span className="text-gray-400">Count:</span>
                    <span className="ml-1 text-purple-400 font-medium">{values.length}</span>
                  </div>
                </div>
              );
            }
            return null;
          })()}
          
          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowGridLines(!showGridLines)}
                className={`h-9 w-9 flex items-center justify-center rounded-lg transition-colors ${
                  showGridLines ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-gray-500'
                }`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              
              {/* Zoom Controls */}
              <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
                <button
                  onClick={() => setZoomLevel(prev => Math.max(50, prev - 10))}
                  className="h-8 w-8 flex items-center justify-center rounded-md text-gray-400"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-500 min-w-[40px] text-center">{zoomLevel}%</span>
                <button
                  onClick={() => setZoomLevel(prev => Math.min(200, prev + 10))}
                  className="h-8 w-8 flex items-center justify-center rounded-md text-gray-400"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onDownload}
                className="h-9 px-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg"
              >
                <Download className="w-4 h-4" />
              </Button>
              
              <Button
                onClick={() => onSave?.(worksheets[activeSheet].data)}
                className="h-9 px-4 rounded-lg font-medium text-sm bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/20"
              >
                <Save className="w-4 h-4 mr-1.5" />
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Desktop UI
  return (
    <div 
      ref={containerRef}
      className={`flex flex-col h-full bg-background border rounded-xl overflow-hidden shadow-lg ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}
    >
      {/* Enhanced Desktop Toolbar */}
      <div className="flex items-center justify-between p-2.5 border-b bg-muted/20 backdrop-blur-sm flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-muted/50">
            <FileSpreadsheet className="w-4 h-4 text-green-500" />
            <span className="font-medium text-sm">{fileName}</span>
          </div>
          <Badge variant="secondary" className="text-xs font-medium">
            {zoomLevel}%
          </Badge>
          {selectedRange.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {selectedRange.length} cells
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-1 flex-wrap">
          {/* File Operations */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8">
                <Save className="w-4 h-4 mr-1" />
                File
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => onSave?.(worksheets[activeSheet].data)}>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download Original
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {
                const csvData = spreadsheetToCSV(worksheets[activeSheet].data);
                navigator.clipboard.writeText(csvData);
                toast({ title: "Copied", description: "Spreadsheet data copied to clipboard" });
              }}>
                <Copy className="mr-2 h-4 w-4" />
                Copy All Data
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Edit Operations */}
          <div className="flex items-center gap-1 border-l pl-2">
            <Button 
              size="sm" 
              variant="ghost" 
              disabled={historyIndex <= 0}
              onClick={() => {
                if (historyIndex > 0) {
                  const prevData = history[historyIndex - 1];
                  setWorksheets(prev => {
                    const newWorksheets = [...prev];
                    newWorksheets[activeSheet] = { ...newWorksheets[activeSheet], data: prevData };
                    return newWorksheets;
                  });
                  setHistoryIndex(prev => prev - 1);
                }
              }}
            >
              <Undo className="w-4 h-4" />
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              disabled={historyIndex >= history.length - 1}
              onClick={() => {
                if (historyIndex < history.length - 1) {
                  const nextData = history[historyIndex + 1];
                  setWorksheets(prev => {
                    const newWorksheets = [...prev];
                    newWorksheets[activeSheet] = { ...newWorksheets[activeSheet], data: nextData };
                    return newWorksheets;
                  });
                  setHistoryIndex(prev => prev + 1);
                }
              }}
            >
              <Redo className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Quick Functions for Selected Range */}
          {selectedRange.length > 1 && (
            <div className="flex items-center gap-1 border-l pl-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost">
                    <Calculator className="w-4 h-4 mr-1" />
                    Functions
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => applyRangeFunction('SUM')}>
                    <Calculator className="mr-2 h-4 w-4" />
                    Sum ({selectedRange.length} cells)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => applyRangeFunction('AVERAGE')}>
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Average
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => applyRangeFunction('COUNT')}>
                    <Grid3X3 className="mr-2 h-4 w-4" />
                    Count
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => applyRangeFunction('MIN')}>
                    <Minus className="mr-2 h-4 w-4" />
                    Minimum
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => applyRangeFunction('MAX')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Maximum
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          
          {/* Format Operations */}
          <div className="flex items-center gap-1 border-l pl-2">
            <Button 
              size="sm" 
              variant="ghost"
              onClick={() => {
                const cellsToFormat = selectedRange.length > 0 ? selectedRange : (selectedCell ? [selectedCell] : []);
                cellsToFormat.forEach(cell => {
                  const currentSheet = worksheets[activeSheet];
                  const cellData = currentSheet.data[cell] || { value: '', type: 'text', format: {} };
                  updateCell(cell, cellData.value, cellData.type);
                });
              }}
            >
              <Bold className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost">
              <Italic className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost">
              <Underline className="w-4 h-4" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost">
                  <Palette className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>
                  <div className="w-4 h-4 bg-red-500 mr-2"></div>
                  Red Background
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <div className="w-4 h-4 bg-green-500 mr-2"></div>
                  Green Background
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <div className="w-4 h-4 bg-blue-500 mr-2"></div>
                  Blue Background
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <div className="w-4 h-4 bg-yellow-500 mr-2"></div>
                  Yellow Background
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {/* View Options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                <Eye className="w-4 h-4 mr-1" />
                View
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setShowFormulaBar(!showFormulaBar)}>
                {showFormulaBar ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                Formula Bar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowGridLines(!showGridLines)}>
                {showGridLines ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                Grid Lines
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowRowHeaders(!showRowHeaders)}>
                {showRowHeaders ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                Row Headers
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowColumnHeaders(!showColumnHeaders)}>
                {showColumnHeaders ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                Column Headers
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setViewMode('compact')}>
                <Grid3X3 className="mr-2 h-4 w-4" />
                Compact View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode('normal')}>
                <Grid3X3 className="mr-2 h-4 w-4" />
                Normal View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode('expanded')}>
                <Grid3X3 className="mr-2 h-4 w-4" />
                Expanded View
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button size="sm" variant="ghost" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      
      {/* Formula Bar */}
      {showFormulaBar && (
        <div className="flex items-center p-2 border-b bg-gray-50 dark:bg-gray-800">
          <Label className="text-sm font-medium mr-2 w-16">
            {selectedCell}
          </Label>
          <div className="flex items-center flex-1 gap-2">
            <Settings className="w-4 h-4 text-gray-500" />
            <Input
              value={formulaBar}
              onChange={(e) => setFormulaBar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleFormulaBarChange(formulaBar);
                }
              }}
              placeholder="Enter formula or value..."
              className="flex-1"
            />
          </div>
        </div>
      )}
      
      {/* Sheet Tabs */}
      <div className="flex items-center gap-1 p-1 border-b bg-gray-50 dark:bg-gray-800">
        {worksheets.map((sheet, index) => (
          <Button
            key={sheet.id}
            size="sm"
            variant={index === activeSheet ? "default" : "ghost"}
            onClick={() => setActiveSheet(index)}
            className="text-xs"
          >
            {sheet.name}
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="text-xs">
          <Plus className="w-3 h-3" />
        </Button>
      </div>
      
      {/* Spreadsheet Grid */}
      <div className="flex-1 overflow-auto">
        <Table>
          {renderColumnHeaders}
          <TableBody>
            {renderRows}
          </TableBody>
        </Table>
      </div>
      
      {/* Status Bar */}
      <div className="flex items-center justify-between p-2 border-t bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-4">
          <span>Sheet: {worksheets[activeSheet]?.name}</span>
          <span>Cell: {selectedCell}</span>
          {selectedRange.length > 0 && (
            <span>Range: {selectedRange.length} cells</span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={zoomLevel.toString()} onValueChange={(value) => setZoomLevel(parseInt(value))}>
            <SelectTrigger className="w-20 h-6 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50%</SelectItem>
              <SelectItem value="75">75%</SelectItem>
              <SelectItem value="100">100%</SelectItem>
              <SelectItem value="125">125%</SelectItem>
              <SelectItem value="150">150%</SelectItem>
              <SelectItem value="200">200%</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t bg-gray-50 dark:bg-gray-800 text-sm">
        <div className="flex items-center gap-4">
          <span className="text-gray-600 dark:text-gray-400">
            {selectedCell && `Cell: ${selectedCell}`}
          </span>
          {selectedRange.length > 1 && (
            <span className="text-gray-600 dark:text-gray-400">
              Range: {selectedRange.length} cells selected
            </span>
          )}
          {selectedRange.length > 1 && (() => {
            const values = selectedRange.map(cell => {
              const cellData = worksheets[activeSheet].data[cell];
              const value = cellData?.value || '';
              return typeof value === 'string' && !isNaN(Number(value)) ? Number(value) : 0;
            }).filter(v => !isNaN(v) && v !== 0);
            
            if (values.length > 0) {
              const sum = values.reduce((a, b) => a + b, 0);
              const avg = sum / values.length;
              const count = values.length;
              return (
                <div className="flex items-center gap-4">
                  <span className="text-blue-600 dark:text-blue-400">
                    Sum: {sum.toFixed(2)}
                  </span>
                  <span className="text-green-600 dark:text-green-400">
                    Avg: {avg.toFixed(2)}
                  </span>
                  <span className="text-purple-600 dark:text-purple-400">
                    Count: {count}
                  </span>
                </div>
              );
            }
            return null;
          })()}
        </div>
        
        <div className="flex items-center gap-4">
          {worksheets.length > 1 && (
            <span className="text-gray-600 dark:text-gray-400">
              Sheet {activeSheet + 1} of {worksheets.length}
            </span>
          )}
          <span className="text-gray-600 dark:text-gray-400">
            {Object.keys(worksheets[activeSheet].data).length} cells with data
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setZoomLevel(prev => Math.max(50, prev - 10))}
              disabled={zoomLevel <= 50}
            >
              <Minus className="w-3 h-3" />
            </Button>
            <span className="text-gray-600 dark:text-gray-400 min-w-[3rem] text-center">
              {zoomLevel}%
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setZoomLevel(prev => Math.min(200, prev + 10))}
              disabled={zoomLevel >= 200}
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 border rounded-md shadow-lg py-1 min-w-[150px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y
          }}
        >
          <button
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            onClick={() => {
              copySelectedCells();
              closeContextMenu();
            }}
          >
            <Copy className="w-4 h-4" />
            Copy
          </button>
          {clipboard && (
            <button
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              onClick={() => {
                pasteClipboardCells();
                closeContextMenu();
              }}
            >
              <ClipboardPaste className="w-4 h-4" />
              Paste
            </button>
          )}
          <div className="border-t my-1" />
          <button
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            onClick={() => {
              const cellsToDelete = selectedRange.length > 0 ? selectedRange : [contextMenu.cell];
              cellsToDelete.forEach(cell => updateCell(cell, '', 'text'));
              closeContextMenu();
            }}
          >
            <Minus className="w-4 h-4" />
            Clear Contents
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            onClick={() => {
              setSelectedCell(contextMenu.cell);
              setEditingCell(contextMenu.cell);
              closeContextMenu();
            }}
          >
            <Calculator className="w-4 h-4" />
            Edit Formula
          </button>
        </div>
      )}
    </div>
  );
};

export default SpreadsheetViewer;