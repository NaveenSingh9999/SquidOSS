
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerServiceWorker } from './pwaInstall.ts';

const isDev = import.meta.env.DEV;

if (import.meta.env.PROD) {
  console.log = () => {};
  console.debug = () => {};
}

// Disable right-click
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  return false;
}, { passive: false });

// Disable pinch-zoom
document.addEventListener('touchstart', (e) => {
  if (e.touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });

// Register the service worker for PWA support
registerServiceWorker()
  .then(() => {
    if (isDev) {
      console.log('Service Worker registered successfully');
    }
  })
  .catch(error => {
    console.error('Service Worker registration failed:', error);
  });

// Initialize the root and render the application
createRoot(document.getElementById("root")!).render(
  <App />
);
