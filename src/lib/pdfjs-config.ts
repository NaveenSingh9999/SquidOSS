/**
 * Centralized PDF.js worker configuration
 * This module ensures GlobalWorkerOptions is properly configured before any PDF operations
 */

import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Flag to ensure we only configure once
let isConfigured = false;

/**
 * Configure PDF.js GlobalWorkerOptions
 * This function safely configures the worker source with multiple fallback attempts
 */
export function configurePDFJS(): void {
  if (isConfigured) {
    return;
  }

  try {
    // Try multiple paths to find GlobalWorkerOptions
    // This handles different import patterns and build/minification scenarios

    if (typeof pdfjsLib === 'object' && pdfjsLib !== null) {
      // Try direct access on the imported module
      if ('GlobalWorkerOptions' in pdfjsLib && typeof (pdfjsLib as any).GlobalWorkerOptions === 'object') {
        (pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
        isConfigured = true;
        console.log('[PDF.js] Worker configured via pdfjsLib.GlobalWorkerOptions');
        return;
      }
    }

    // Fallback: Try to access via window object (for browser environments)
    if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
      const windowPdfjs = (window as any).pdfjsLib;
      if (windowPdfjs.GlobalWorkerOptions) {
        windowPdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
        isConfigured = true;
        console.log('[PDF.js] Worker configured via window.pdfjsLib.GlobalWorkerOptions');
        return;
      }
    }

    console.warn('[PDF.js] GlobalWorkerOptions not found, worker configuration may fail');
  } catch (error) {
    console.error('[PDF.js] Error configuring worker:', error);
  }
}

/**
 * Get the configured PDF.js library
 * This ensures configuration happens before returning the library
 */
export function getPDFJS(): typeof pdfjsLib {
  configurePDFJS();
  return pdfjsLib;
}

/**
 * Get the PDF.js library cast to any for cases where TypeScript definitions are incomplete
 */
export function getPDFJSAny(): any {
  configurePDFJS();
  return pdfjsLib as any;
}

// Auto-configure on module load
configurePDFJS();

export default pdfjsLib;
