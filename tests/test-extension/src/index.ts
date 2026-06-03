import { SquidLab, Card, Button, showToast } from 'squidlab-sdk';

// Initialize SquidLab SDK
const squidLab = new SquidLab(window.__SQUIDLAB_CONFIG__);

// Main extension function
async function initExtension() {
  const app = document.getElementById('app');
  if (!app) return;

  // Example: List user files
  const result = await squidLab.files.sqfetch('/');
  
  if (result.success) {
    console.log('Files:', result.data);
    showToast('Extension loaded successfully!', { type: 'success' });
  } else {
    showToast('Failed to load files', { type: 'error' });
  }

  // Render UI
  app.innerHTML = `
    <div class="extension-container">
      <h1>test-extension</h1>
      <p>Your extension is running!</p>
    </div>
  `;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initExtension);
} else {
  initExtension();
}
