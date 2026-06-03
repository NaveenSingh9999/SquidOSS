/**
 * ExtensionContext - Provides context information to extensions
 */

import { ExtensionManifest } from '../types';

export class ExtensionContext {
  private manifest: ExtensionManifest;
  private userId: string;
  private extensionId: string;

  constructor(manifest: ExtensionManifest, userId: string, extensionId: string) {
    this.manifest = manifest;
    this.userId = userId;
    this.extensionId = extensionId;
  }

  /**
   * Get extension manifest
   */
  getManifest(): ExtensionManifest {
    return { ...this.manifest };
  }

  /**
   * Get extension name
   */
  getName(): string {
    return this.manifest.name;
  }

  /**
   * Get extension version
   */
  getVersion(): string {
    return this.manifest.version;
  }

  /**
   * Get current user ID
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * Get extension ID
   */
  getExtensionId(): string {
    return this.extensionId;
  }

  /**
   * Get extension author
   */
  getAuthor(): ExtensionManifest['author'] {
    return { ...this.manifest.author };
  }

  /**
   * Save extension settings (persisted in database)
   */
  async saveSettings(settings: Record<string, any>): Promise<void> {
    if (window.parent) {
      window.parent.postMessage({
        type: 'squidlab:save-settings',
        extensionId: this.extensionId,
        settings
      }, '*');
    }
  }

  /**
   * Load extension settings
   */
  async loadSettings(): Promise<Record<string, any>> {
    return new Promise((resolve) => {
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'squidlab:settings-response' &&
            event.data?.extensionId === this.extensionId) {
          window.removeEventListener('message', handleMessage);
          resolve(event.data.settings || {});
        }
      };

      window.addEventListener('message', handleMessage);

      if (window.parent) {
        window.parent.postMessage({
          type: 'squidlab:load-settings',
          extensionId: this.extensionId
        }, '*');
      }

      // Timeout after 10 seconds
      setTimeout(() => {
        window.removeEventListener('message', handleMessage);
        resolve({});
      }, 10000);
    });
  }
}
