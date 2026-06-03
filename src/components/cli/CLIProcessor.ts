import { supabase } from '@/integrations/supabase/client';
import { uploadFile, downloadFile, getAllFiles, createFolder, deleteFile, formatBytes } from '@/lib/api';

export interface CLIResult {
  output: string;
  error?: boolean;
  type?: 'output' | 'error' | 'success' | 'info';
  newPath?: string;
  action?: 'clear' | 'exit' | 'modal';
}

export class CLIProcessor {
  private commands = new Map<string, (args: string[], currentPath: string) => Promise<CLIResult>>();

  constructor() {
    this.initializeCommands();
  }

  private initializeCommands() {
    // Navigation & Basic Commands
    this.commands.set('ls', this.listFiles.bind(this));
    this.commands.set('cd', this.changeDirectory.bind(this));
    this.commands.set('pwd', this.printWorkingDirectory.bind(this));
    this.commands.set('tree', this.showTree.bind(this));
    this.commands.set('clear', this.clearScreen.bind(this));
    this.commands.set('exit', this.exitTerminal.bind(this));
    this.commands.set('help', this.showHelp.bind(this));
    this.commands.set('whoami', this.showUserInfo.bind(this));
    this.commands.set('uptime', this.showUptime.bind(this));
    this.commands.set('version', this.showVersion.bind(this));

    // File/Folder Management
    this.commands.set('upload', this.uploadFile.bind(this));
    this.commands.set('unzip', this.unzipFile.bind(this));
    this.commands.set('extract', this.unzipFile.bind(this));
    this.commands.set('delete', this.deleteFile.bind(this));
    this.commands.set('rm', this.deleteFile.bind(this));
    this.commands.set('rmdir', this.removeDirectory.bind(this));
    this.commands.set('mkdir', this.makeDirectory.bind(this));
    this.commands.set('touch', this.createFile.bind(this));
    this.commands.set('rename', this.renameFile.bind(this));
    this.commands.set('info', this.showFileInfo.bind(this));
    this.commands.set('open', this.openFile.bind(this));

    // Account & Dev Commands
    this.commands.set('account', this.accountCommands.bind(this));
    this.commands.set('apikey', this.apikeyCommands.bind(this));
    this.commands.set('logs', this.showLogs.bind(this));
    this.commands.set('auth', this.authCommands.bind(this));
    this.commands.set('sync', this.syncData.bind(this));
    this.commands.set('backup', this.backupFiles.bind(this));

    // Analytics & Insights
    this.commands.set('storage', this.showStorage.bind(this));
    this.commands.set('files', this.filesCommands.bind(this));
    this.commands.set('top', this.topCommands.bind(this));
    this.commands.set('analytics', this.showAnalytics.bind(this));

    // Security & Access
    this.commands.set('lock', this.lockTerminal.bind(this));
    this.commands.set('mfa', this.mfaCommands.bind(this));
    this.commands.set('logout', this.logoutUser.bind(this));

    // Experimental
    this.commands.set('echo', this.echo.bind(this));
    this.commands.set('reset', this.resetCommands.bind(this));
  }

  async processCommand(input: string, currentPath: string): Promise<CLIResult> {
    const parts = input.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (!command) {
      return { output: '', type: 'output' };
    }

    const handler = this.commands.get(command);
    if (!handler) {
      return {
        output: `Command not found: ${command}. Type 'help' for available commands.`,
        error: true,
        type: 'error'
      };
    }

    try {
      return await handler(args, currentPath);
    } catch (error) {
      return {
        output: `Error executing command: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: true,
        type: 'error'
      };
    }
  }

  // Navigation & Basic Commands
  private async listFiles(args: string[], currentPath: string): Promise<CLIResult> {
    try {
      const files = await getAllFiles(currentPath === '/' ? '' : currentPath);
      
      if (files.length === 0) {
        return { output: 'No files or folders found.', type: 'info' };
      }

      let output = '';
      files.forEach(file => {
        if ('is_folder' in file && file.is_folder) {
          output += `📁 ${file.name}/\n`;
        } else {
          const fileItem = file as any;
          output += `📄 ${fileItem.name} (${formatBytes(fileItem.size)})\n`;
        }
      });

      return { output: output.trim(), type: 'output' };
    } catch (error) {
      return { output: `Error listing files: ${error instanceof Error ? error.message : 'Unknown error'}`, error: true, type: 'error' };
    }
  }

  private async changeDirectory(args: string[], currentPath: string): Promise<CLIResult> {
    if (args.length === 0) {
      return { output: currentPath, newPath: '/', type: 'output' };
    }

    const target = args[0];
    let newPath: string;

    if (target === '/') {
      newPath = '/';
    } else if (target === '..') {
      const parts = currentPath.split('/').filter(p => p);
      parts.pop();
      newPath = parts.length > 0 ? '/' + parts.join('/') : '/';
    } else if (target.startsWith('/')) {
      newPath = target;
    } else {
      newPath = currentPath === '/' ? `/${target}` : `${currentPath}/${target}`;
    }

    return { output: `Changed directory to ${newPath}`, newPath, type: 'success' };
  }

  private async printWorkingDirectory(args: string[], currentPath: string): Promise<CLIResult> {
    return { output: currentPath, type: 'output' };
  }

  private async showTree(args: string[], currentPath: string): Promise<CLIResult> {
    try {
      const files = await getAllFiles(currentPath === '/' ? '' : currentPath);
      let output = currentPath + '\n';
      
      files.forEach((file, index) => {
        const isLast = index === files.length - 1;
        const prefix = isLast ? '└── ' : '├── ';
        
        if ('is_folder' in file && file.is_folder) {
          output += `${prefix}📁 ${file.name}/\n`;
        } else {
          const fileItem = file as any;
          output += `${prefix}📄 ${fileItem.name}\n`;
        }
      });

      return { output: output.trim(), type: 'output' };
    } catch (error) {
      return { output: `Error showing tree: ${error instanceof Error ? error.message : 'Unknown error'}`, error: true, type: 'error' };
    }
  }

  private async clearScreen(): Promise<CLIResult> {
    return { output: '', action: 'clear', type: 'output' };
  }

  private async exitTerminal(): Promise<CLIResult> {
    return { output: 'Goodbye!', action: 'exit', type: 'info' };
  }

  private async showHelp(): Promise<CLIResult> {
    const helpText = `SquidCloud CLI Commands:

📁 Navigation & Basic:
  ls                    List files and folders
  cd <folder>           Change directory
  pwd                   Show current path
  tree                  Display folder tree
  clear                 Clear screen
  exit                  Close terminal
  help                  Show this help
  whoami                Show user info
  version               Show CLI version

📦 File Management:
  mkdir <name>          Create folder
  rmdir <name>          Delete folder
  delete <file>         Delete file
  touch <file>          Create empty file
  rename <old> <new>    Rename file/folder
  info <file>           Show file details
  upload                Trigger file upload
  unzip <file>          Extract zip file

🔧 Account & API:
  account edit          Edit account settings
  apikey create         Create new API key
  apikey list           List API keys
  logs                  Show activity logs
  auth status           Check auth status
  backup                Download all files

📊 Analytics:
  storage               Show storage usage
  files count           Count total files
  analytics             Show analytics

🔒 Security:
  mfa status            Check MFA status
  logout                Sign out

Type any command for more details.`;

    return { output: helpText, type: 'info' };
  }

  private async showUserInfo(): Promise<CLIResult> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { output: 'Not authenticated', error: true, type: 'error' };
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      const output = `User: ${user.email}
ID: ${user.id}
Name: ${profile?.full_name || 'Not set'}
Premium: ${profile?.is_premium ? 'Yes' : 'No'}
Admin: ${profile?.is_admin ? 'Yes' : 'No'}
MFA: ${profile?.mfa_enabled ? 'Enabled' : 'Disabled'}`;

      return { output, type: 'info' };
    } catch (error) {
      return { output: `Error getting user info: ${error instanceof Error ? error.message : 'Unknown error'}`, error: true, type: 'error' };
    }
  }

  private async showUptime(): Promise<CLIResult> {
    // This would typically track session time
    return { output: 'Session active', type: 'info' };
  }

  private async showVersion(): Promise<CLIResult> {
    return { output: 'SquidCloud CLI v1.0.0', type: 'info' };
  }

  // File Management Commands
  private async makeDirectory(args: string[], currentPath: string): Promise<CLIResult> {
    if (args.length === 0) {
      return { output: 'Usage: mkdir <folder_name>', error: true, type: 'error' };
    }

    try {
      const folderName = args[0];
      const parentPath = currentPath === '/' ? '' : currentPath;
      await createFolder(folderName, parentPath);
      return { output: `Created folder: ${folderName}`, type: 'success' };
    } catch (error) {
      return { output: `Error creating folder: ${error instanceof Error ? error.message : 'Unknown error'}`, error: true, type: 'error' };
    }
  }

  private async deleteFile(args: string[], currentPath: string): Promise<CLIResult> {
    if (args.length === 0) {
      return { output: 'Usage: delete <file_name>', error: true, type: 'error' };
    }

    try {
      const fileName = args[0];
      const files = await getAllFiles(currentPath === '/' ? '' : currentPath);
      const fileToDelete = files.find(f => f.name === fileName);
      
      if (!fileToDelete) {
        return { output: `File not found: ${fileName}`, error: true, type: 'error' };
      }

      await deleteFile(fileToDelete.id);
      return { output: `Deleted: ${fileName}`, type: 'success' };
    } catch (error) {
      return { output: `Error deleting file: ${error instanceof Error ? error.message : 'Unknown error'}`, error: true, type: 'error' };
    }
  }

  private async showStorage(): Promise<CLIResult> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { output: 'Not authenticated', error: true, type: 'error' };
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('storage_used')
        .eq('id', user.id)
        .single();

      const storageUsed = profile?.storage_used || 0;
      const storageLimit = 5 * 1024 * 1024 * 1024; // 5GB default

      const output = `Storage Usage:
Used: ${formatBytes(storageUsed)}
Limit: ${formatBytes(storageLimit)}
Available: ${formatBytes(storageLimit - storageUsed)}
Usage: ${((storageUsed / storageLimit) * 100).toFixed(1)}%`;

      return { output, type: 'info' };
    } catch (error) {
      return { output: `Error getting storage info: ${error instanceof Error ? error.message : 'Unknown error'}`, error: true, type: 'error' };
    }
  }

  // Placeholder implementations for remaining commands
  private async uploadFile(): Promise<CLIResult> {
    return { output: 'File upload interface would be triggered here', type: 'info' };
  }

  private async unzipFile(args: string[], currentPath: string): Promise<CLIResult> {
    if (args.length === 0) {
      return { output: 'Usage: unzip <filename.zip>', error: true, type: 'error' };
    }

    try {
      const fileName = args[0];
      const files = await getAllFiles(currentPath === '/' ? '' : currentPath);
      const zipFile = files.find(f => f.name === fileName && f.name.endsWith('.zip'));
      
      if (!zipFile) {
        return { output: `ZIP file not found: ${fileName}`, error: true, type: 'error' };
      }

      // Call the file-operations edge function to extract the ZIP
      const { data, error } = await supabase.functions.invoke('file-operations', {
        body: {
          action: 'extract',
          fileId: zipFile.id,
          userId: (await supabase.auth.getUser()).data.user?.id,
          destinationFolder: currentPath === '/' ? '' : currentPath
        }
      });

      if (error) {
        return { output: `Error extracting ZIP: ${error.message}`, error: true, type: 'error' };
      }

      if (data.error) {
        return { output: `Error extracting ZIP: ${data.error}`, error: true, type: 'error' };
      }

      const extractedCount = data.files?.length || 0;
      return { output: `Successfully extracted ${extractedCount} files from ${fileName}`, type: 'success' };
    } catch (error) {
      return { output: `Error extracting ZIP: ${error instanceof Error ? error.message : 'Unknown error'}`, error: true, type: 'error' };
    }
  }

  private async removeDirectory(): Promise<CLIResult> {
    return { output: 'Directory removal would be implemented here', type: 'info' };
  }

  private async createFile(): Promise<CLIResult> {
    return { output: 'File creation would be implemented here', type: 'info' };
  }

  private async renameFile(): Promise<CLIResult> {
    return { output: 'File renaming would be implemented here', type: 'info' };
  }

  private async showFileInfo(): Promise<CLIResult> {
    return { output: 'File info would be displayed here', type: 'info' };
  }

  private async openFile(): Promise<CLIResult> {
    return { output: 'File preview would open here', type: 'info' };
  }

  private async accountCommands(): Promise<CLIResult> {
    return { output: 'Account management commands would be here', type: 'info' };
  }

  private async apikeyCommands(): Promise<CLIResult> {
    return { output: 'API key management commands would be here', type: 'info' };
  }

  private async showLogs(): Promise<CLIResult> {
    return { output: 'User activity logs would be displayed here', type: 'info' };
  }

  private async authCommands(): Promise<CLIResult> {
    return { output: 'Authentication status and commands would be here', type: 'info' };
  }

  private async syncData(): Promise<CLIResult> {
    return { output: 'Data synchronization would happen here', type: 'info' };
  }

  private async backupFiles(): Promise<CLIResult> {
    return { output: 'Backup download would be initiated here', type: 'info' };
  }

  private async filesCommands(): Promise<CLIResult> {
    return { output: 'File counting and statistics would be here', type: 'info' };
  }

  private async topCommands(): Promise<CLIResult> {
    return { output: 'Top files analysis would be displayed here', type: 'info' };
  }

  private async showAnalytics(): Promise<CLIResult> {
    return { output: 'Analytics dashboard would be opened here', type: 'info' };
  }

  private async lockTerminal(): Promise<CLIResult> {
    return { output: 'Terminal lock functionality would be implemented here', type: 'info' };
  }

  private async mfaCommands(): Promise<CLIResult> {
    return { output: 'MFA management commands would be here', type: 'info' };
  }

  private async logoutUser(): Promise<CLIResult> {
    try {
      await supabase.auth.signOut();
      return { output: 'Logged out successfully', type: 'success' };
    } catch (error) {
      return { output: `Error logging out: ${error instanceof Error ? error.message : 'Unknown error'}`, error: true, type: 'error' };
    }
  }

  private async echo(args: string[]): Promise<CLIResult> {
    return { output: args.join(' '), type: 'output' };
  }

  private async resetCommands(): Promise<CLIResult> {
    return { output: 'Reset commands would require confirmation', type: 'info' };
  }
}
