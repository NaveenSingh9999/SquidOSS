// Simple CSV parser for spreadsheet viewer
export function parseCSV(csvText: string): string[][] {
  const lines = csvText.split('\n');
  const result: string[][] = [];
  
  for (const line of lines) {
    if (line.trim()) {
      // Simple CSV parsing - would need more robust parsing for production
      const fields = line.split(',').map(field => 
        field.trim().replace(/^"(.*)"$/, '$1') // Remove quotes
      );
      result.push(fields);
    }
  }
  
  return result;
}

// Convert array data to CSV
export function arrayToCSV(data: string[][]): string {
  return data.map(row => 
    row.map(cell => 
      // Add quotes if cell contains comma, newline, or quote
      /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
    ).join(',')
  ).join('\n');
}

// Convert spreadsheet data to CSV format
export function spreadsheetToCSV(sheetData: any): string {
  // Extract all cell references and sort them
  const cellRefs = Object.keys(sheetData).sort((a, b) => {
    const [rowA, colA] = cellToCoords(a);
    const [rowB, colB] = cellToCoords(b);
    if (rowA !== rowB) return rowA - rowB;
    return colA - colB;
  });
  
  if (cellRefs.length === 0) return '';
  
  // Find the bounds
  let maxRow = 0;
  let maxCol = 0;
  
  cellRefs.forEach(ref => {
    const [row, col] = cellToCoords(ref);
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
  });
  
  // Create the grid
  const grid: string[][] = [];
  for (let row = 0; row <= maxRow; row++) {
    const rowData: string[] = [];
    for (let col = 0; col <= maxCol; col++) {
      const cellRef = coordsToCell(row, col);
      const cellData = sheetData[cellRef];
      rowData.push(cellData ? String(cellData.value || '') : '');
    }
    grid.push(rowData);
  }
  
  return arrayToCSV(grid);
}

// Helper functions for cell coordinate conversion
function cellToCoords(cell: string): [number, number] {
  const match = cell.match(/^([A-Z]+)(\d+)$/);
  if (!match) return [0, 0];
  
  let col = 0;
  for (let i = 0; i < match[1].length; i++) {
    col = col * 26 + (match[1].charCodeAt(i) - 64);
  }
  col -= 1;
  
  const row = parseInt(match[2]) - 1;
  return [row, col];
}

function coordsToCell(row: number, col: number): string {
  let result = '';
  while (col >= 0) {
    result = String.fromCharCode(65 + (col % 26)) + result;
    col = Math.floor(col / 26) - 1;
  }
  return result + (row + 1);
}