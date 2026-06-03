import { supabase } from '@/integrations/supabase/client';
import { SquidAITools } from './squid-ai-tools';

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
}

export interface FileContext {
  fileName?: string;
  fileType?: string;
  filePath?: string;
  fileContent?: string;
  selectedFiles?: any[];
  currentFolder?: string;
  previewContent?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: any;
}

/**
 * SquidAI - Intelligent AI Agent for CloudBliss Storage
 * Features tool-calling capabilities to perform real file operations
 */
export class SquidAI {
  private conversationHistory: Message[] = [];
  private availableTools: ToolDefinition[] = [];

  constructor() {
    this.registerTools();
  }

  private registerTools() {
    this.availableTools = [
      {
        name: 'getFileAnalytics',
        description: 'Get comprehensive file statistics including count, size, type distribution, largest files, and recent files',
        parameters: {
          type: 'object',
          properties: {
            fileType: { type: 'string', description: 'Optional: Filter by file extension (e.g., "pdf", "jpg")' }
          }
        }
      },
      {
        name: 'countFilesByExtension',
        description: 'Count files with a specific extension. Use this for queries like "how many PDFs?" or "count images"',
        parameters: {
          type: 'object',
          properties: {
            extension: { type: 'string', description: 'File extension without dot (e.g., "pdf", "jpg", "mp4")' }
          },
          required: ['extension']
        }
      },
      {
        name: 'searchFiles',
        description: 'Search for files and folders by name or content',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term' },
            searchContent: { type: 'boolean', description: 'Whether to search file content (default: false)' }
          },
          required: ['query']
        }
      },
      {
        name: 'createFile',
        description: 'Create a new file with specific content',
        parameters: {
          type: 'object',
          properties: {
            fileName: { type: 'string', description: 'Name of the file to create' },
            content: { type: 'string', description: 'File content' },
            parentFolder: { type: 'string', description: 'Parent folder path (optional)' },
            fileType: { type: 'string', description: 'MIME type (optional)' }
          },
          required: ['fileName', 'content']
        }
      },
      {
        name: 'createFolder',
        description: 'Create a new folder',
        parameters: {
          type: 'object',
          properties: {
            folderName: { type: 'string', description: 'Name of the folder' },
            parentPath: { type: 'string', description: 'Parent folder path (optional)' }
          },
          required: ['folderName']
        }
      },
      {
        name: 'organizeFilesByType',
        description: 'Automatically organize files into categorized folders by file type',
        parameters: {
          type: 'object',
          properties: {
            files: { type: 'array', description: 'Array of files to organize' },
            currentPath: { type: 'string', description: 'Current folder path (optional)' }
          },
          required: ['files']
        }
      },
      {
        name: 'getStorageUsed',
        description: 'Get total storage used, available, and usage percentage',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'generateContentFromReference',
        description: 'Generate new content based on reference text (e.g., from preview modal)',
        parameters: {
          type: 'object',
          properties: {
            referenceText: { type: 'string', description: 'Reference text to base generation on' },
            outputType: { type: 'string', enum: ['markdown', 'code', 'text'], description: 'Type of output' },
            instructions: { type: 'string', description: 'Generation instructions' }
          },
          required: ['referenceText', 'outputType', 'instructions']
        }
      }
    ];
  }

  async initialize() {
    this.conversationHistory = [
      {
        role: 'system',
        content: `You are SquidAI, an advanced AI agent for CloudBliss Storage with real-time database and file system access.

CORE CAPABILITIES:
- File Analytics: Count files, analyze storage, get statistics
- File Operations: Create, read, update, delete files with content
- Folder Management: Create, delete, organize folders
- Search: Find files and folders by name or content
- Organization: Auto-organize files by type
- Content Generation: Generate code, documents, and content from references

AVAILABLE TOOLS:
You have access to powerful tools that can execute real database queries and file operations:

1. getFileAnalytics - Get comprehensive file statistics (count, size, type distribution, recent files)
2. countFilesByExtension - Count specific file types (e.g., "how many PDFs?")
3. searchFiles - Search files/folders by name or content
4. getFilesInFolder - List files in a specific folder
5. getStorageUsed - Get storage usage statistics
6. createFile - Create new files with content
7. readFileContent - Read content from existing files
8. updateFileContent - Update file content
9. deleteFile - Delete files
10. renameFile - Rename files
11. createFolder - Create new folders
12. deleteFolder - Delete folders
13. listFolders - List all folders
14. organizeFilesByType - Auto-organize files into categorized folders
15. moveFilesToFolder - Move files to specific folders
16. generateContentFromReference - Generate content based on reference text
17. generateCode - Generate code from descriptions

INSTRUCTIONS:
- When users ask questions like "how many PDFs?", use countFilesByExtension
- For file creation requests, use createFile with appropriate content
- Reference preview content when generating new files
- Be proactive - suggest organization when you see unorganized files
- Execute operations directly using tools - don't just describe them
- Provide clear feedback on tool execution results
- Handle errors gracefully and suggest alternatives

RESPONSE FORMAT:
When you need to use a tool, respond with JSON:
{
  "thought": "Why you're using this tool",
  "tool": "toolName",
  "arguments": { "param": "value" }
}

For normal responses, just reply naturally.`
      }
    ];
    return true;
  }

  /**
   * Execute a tool call
   */
  private async executeTool(toolName: string, args: any): Promise<any> {
    console.log(`🔧 Executing tool: ${toolName}`, args);

    try {
      switch (toolName) {
        case 'getFileAnalytics':
          return await SquidAITools.getFileAnalytics(args.fileType);
        
        case 'countFilesByExtension':
          return await SquidAITools.countFilesByExtension(args.extension);
        
        case 'searchFiles':
          return await SquidAITools.searchFiles(args.query, args.searchContent);
        
        case 'getFilesInFolder':
          return await SquidAITools.getFilesInFolder(args.folderPath);
        
        case 'getStorageUsed':
          return await SquidAITools.getStorageUsed();
        
        case 'createFile':
          return await SquidAITools.createFile(
            args.fileName,
            args.content,
            args.parentFolder,
            args.fileType
          );
        
        case 'readFileContent':
          return await SquidAITools.readFileContent(args.fileId);
        
        case 'updateFileContent':
          return await SquidAITools.updateFileContent(args.fileId, args.newContent);
        
        case 'deleteFile':
          return await SquidAITools.deleteFile(args.fileId);
        
        case 'renameFile':
          return await SquidAITools.renameFile(args.fileId, args.newName);
        
        case 'createFolder':
          return await SquidAITools.createFolder(args.folderName, args.parentPath);
        
        case 'deleteFolder':
          return await SquidAITools.deleteFolder(args.folderPath, args.deleteContents);
        
        case 'listFolders':
          return await SquidAITools.listFolders(args.parentPath);
        
        case 'organizeFilesByType':
          return await SquidAITools.organizeFilesByType(args.files, args.currentPath);
        
        case 'moveFilesToFolder':
          return await SquidAITools.moveFilesToFolder(args.fileIds, args.targetFolder);
        
        case 'generateContentFromReference':
          return await SquidAITools.generateContentFromReference(
            args.referenceText,
            args.outputType,
            args.instructions
          );
        
        case 'generateCode':
          return await SquidAITools.generateCode(args.language, args.description, args.context);
        
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error: any) {
      console.error(`❌ Tool execution failed: ${toolName}`, error);
      return { error: error.message };
    }
  }

  /**
   * Parse AI response for tool calls
   */
  private parseToolCall(response: string): { isToolCall: boolean; toolCall?: ToolCall } {
    try {
      // Try to find JSON in the response - be more lenient
      const jsonPatterns = [
        /\{[\s\S]*?"tool"[\s\S]*?\}/,
        /```json\s*(\{[\s\S]*?\})\s*```/,
        /```\s*(\{[\s\S]*?\})\s*```/
      ];
      
      for (const pattern of jsonPatterns) {
        const jsonMatch = response.match(pattern);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.tool && parsed.arguments) {
              console.log('✅ Parsed tool call:', parsed.tool);
              return {
                isToolCall: true,
                toolCall: {
                  id: `tool_${Date.now()}`,
                  name: parsed.tool,
                  arguments: parsed.arguments
                }
              };
            }
          } catch (parseErr) {
            // Try to fix common JSON errors
            const fixed = jsonStr
              .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
              .replace(/'/g, '"') // Replace single quotes
              .replace(/(\w+):/g, '"$1":') // Quote unquoted keys
              .trim();
            
            try {
              const parsed = JSON.parse(fixed);
              if (parsed.tool && parsed.arguments) {
                console.log('✅ Parsed tool call (after fix):', parsed.tool);
                return {
                  isToolCall: true,
                  toolCall: {
                    id: `tool_${Date.now()}`,
                    name: parsed.tool,
                    arguments: parsed.arguments
                  }
                };
              }
            } catch {
              // Still couldn't parse
            }
          }
        }
      }
      
      return { isToolCall: false };
    } catch (error) {
      console.warn('Failed to parse tool call:', error);
      return { isToolCall: false };
    }
  }

  /**
   * Chat with SquidAI - Now with tool execution!
   */
  async chat(userMessage: string, context?: FileContext) {
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    try {
      // ALWAYS try direct tool execution first - this is our primary path
      const directToolResult = await this.tryDirectToolExecution(userMessage, context);
      if (directToolResult) {
        console.log('✅ Direct tool executed:', userMessage);
        this.conversationHistory.push({
          role: 'assistant',
          content: directToolResult
        });
        return { message: directToolResult, action: null };
      }

      // Only call AI if no direct pattern matched
      console.log('🤖 Calling AI for:', userMessage);
      
      // Include preview content and tools in context
      const enhancedContext = {
        ...context,
        availableTools: this.availableTools.map(t => ({ name: t.name, description: t.description }))
      };

      const { data, error } = await supabase.functions.invoke('squid-ai-chat', {
        body: {
          messages: this.conversationHistory,
          context: enhancedContext
        }
      });

      if (error) {
        console.error('AI call error:', error);
        throw error;
      }

      const response = data as { message: string; action?: any };
      const assistantMessage = response.message || 'Sorry, I encountered an error.';
      
      // Check if AI wants to use a tool
      const toolCallCheck = this.parseToolCall(assistantMessage);
      
      if (toolCallCheck.isToolCall && toolCallCheck.toolCall) {
        console.log('🔧 AI requested tool:', toolCallCheck.toolCall.name);
        
        // Execute the tool
        const toolResult = await this.executeTool(
          toolCallCheck.toolCall.name,
          toolCallCheck.toolCall.arguments
        );

        // Format the tool result directly
        const formattedResult = this.formatToolResult(toolCallCheck.toolCall.name, toolResult);
        
        // Add assistant message with tool call
        this.conversationHistory.push({
          role: 'assistant',
          content: formattedResult
        });

        return { message: formattedResult, action: null };
      }

      // Normal response (no tool call)
      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage
      });

      return response;
    } catch (error) {
      console.error('SquidAI Error:', error);
      throw error;
    }
  }

  /**
   * Try to execute tools directly based on simple patterns
   * This provides a fallback when the AI model isn't available
   */
  private async tryDirectToolExecution(userMessage: string, context?: FileContext): Promise<string | null> {
    const lowerMessage = userMessage.toLowerCase().trim();
    
    console.log('🔍 Trying direct execution for:', lowerMessage);

    // Pattern: "how many [filetype]" or "count [filetype]" - VERY BROAD
    if (lowerMessage.includes('how many') || lowerMessage.includes('count') || 
        lowerMessage.includes('total') || lowerMessage.includes('number of') ||
        /\b(pdf|image|video|document|file|photo|movie)s?\b/.test(lowerMessage)) {
      
      // Try to extract file type
      const patterns = [
        /(?:how many|count|total|number of)\s+([a-z]+)(?:s|es|files?)?\??/i,
        /([a-z]+)(?:s|es)?\s+(?:file\s+)?(?:count|total|number)/i,
        /([a-z]+)(?:s|es)?\s+(?:do i have|are there|exist)/i,
        /(?:i have|got)\s+(?:how many|count)\s+([a-z]+)/i,
        /\b(pdf|image|video|document|file|photo|movie|txt|doc|mp3|zip|jpg|png|mp4)s?\s+(?:file|count)/i,
        /(?:file|files)\s+(pdf|image|video|document|photo|txt|doc)/i
      ];
      
      for (const pattern of patterns) {
        const match = lowerMessage.match(pattern);
        if (match && match[1]) {
          const fileType = match[1].toLowerCase();
          const extensions: Record<string, string> = {
            'pdf': 'pdf', 'pdfs': 'pdf',
            'image': 'jpg', 'images': 'jpg', 'img': 'jpg', 'imgs': 'jpg',
            'photo': 'jpg', 'photos': 'jpg', 'picture': 'jpg', 'pictures': 'jpg',
            'video': 'mp4', 'videos': 'mp4', 'movie': 'mp4', 'movies': 'mp4',
            'document': 'pdf', 'documents': 'pdf', 'doc': 'doc', 'docs': 'doc',
            'file': 'pdf', 'files': 'pdf',
            'txt': 'txt', 'text': 'txt',
            'docx': 'docx', 'word': 'docx',
            'xlsx': 'xlsx', 'excel': 'xlsx', 'spreadsheet': 'xlsx',
            'pptx': 'pptx', 'powerpoint': 'pptx', 'presentation': 'pptx',
            'mp3': 'mp3', 'audio': 'mp3', 'song': 'mp3', 'music': 'mp3',
            'zip': 'zip', 'archive': 'zip', 'compressed': 'zip',
            'jpg': 'jpg', 'jpeg': 'jpg',
            'png': 'png',
            'gif': 'gif',
            'mp4': 'mp4',
            'avi': 'avi',
            'mov': 'mov'
          };
          
          const ext = extensions[fileType];
          if (ext) {
            try {
              console.log(`🔧 Counting ${ext} files...`);
              const count = await SquidAITools.countFilesByExtension(ext);
              return this.formatToolResult('countFilesByExtension', count);
            } catch (error) {
              console.error('Count files error:', error);
            }
          }
        }
      }
    }

    // Pattern: "storage" related queries - VERY BROAD
    if (lowerMessage.includes('storage') || lowerMessage.includes('space') ||
        lowerMessage.includes('disk') || lowerMessage.includes('capacity')) {
      if (lowerMessage.includes('usage') || lowerMessage.includes('used') ||
          lowerMessage.includes('much') || lowerMessage.includes('left') ||
          lowerMessage.includes('free') || lowerMessage.includes('available') ||
          lowerMessage.includes('remaining') || lowerMessage.includes('full')) {
        try {
          console.log('🔧 Getting storage usage...');
          const storage = await SquidAITools.getStorageUsed();
          return this.formatToolResult('getStorageUsed', storage);
        } catch (error) {
          console.error('Storage usage error:', error);
        }
      }
    }

    // Pattern: "analytics" or "statistics" - VERY BROAD
    if (lowerMessage.includes('analytics') || lowerMessage.includes('analysis') ||
        lowerMessage.includes('statistics') || lowerMessage.includes('stats') ||
        lowerMessage.includes('breakdown') || lowerMessage.includes('summary') ||
        lowerMessage.includes('overview') || lowerMessage.includes('report')) {
      if (lowerMessage.includes('file') || lowerMessage.includes('storage') ||
          lowerMessage.includes('data') || lowerMessage.length < 30) {
        try {
          console.log('🔧 Getting file analytics...');
          const analytics = await SquidAITools.getFileAnalytics();
          return this.formatToolResult('getFileAnalytics', analytics);
        } catch (error) {
          console.error('Analytics error:', error);
        }
      }
    }

    // Pattern: "search" or "find" - VERY BROAD
    if (lowerMessage.includes('search') || lowerMessage.includes('find') ||
        lowerMessage.includes('look for') || lowerMessage.includes('locate') ||
        lowerMessage.includes('where is') || lowerMessage.includes('show me')) {
      
      const searchPatterns = [
        /(?:search for|find|look for|locate|where is|show me)\s+(.+?)(?:\?|$)/i,
        /(?:search|find)\s*:\s*(.+?)(?:\?|$)/i,
        /(.+?)(?:\s+file|\s+folder)?(?:\?|$)/i
      ];
      
      for (const pattern of searchPatterns) {
        const match = lowerMessage.match(pattern);
        if (match && match[1] && match[1].length > 2 && 
            !match[1].includes('how') && !match[1].includes('what')) {
          const query = match[1].trim();
          try {
            console.log(`🔧 Searching for: ${query}`);
            const results = await SquidAITools.searchFiles(query);
            return this.formatToolResult('searchFiles', results);
          } catch (error) {
            console.error('Search error:', error);
          }
        }
      }
    }

    // Pattern: "organize" or "clean up" or "sort" - VERY BROAD
    if (lowerMessage.includes('organize') || lowerMessage.includes('clean') ||
        lowerMessage.includes('sort') || lowerMessage.includes('arrange') ||
        lowerMessage.includes('categorize') || lowerMessage.includes('tidy')) {
      if (lowerMessage.includes('file') || lowerMessage.includes('my') ||
          lowerMessage.length < 30) {
        if (context?.selectedFiles && context.selectedFiles.length > 0) {
          try {
            console.log('🔧 Organizing files...');
            const result = await SquidAITools.organizeFilesByType(
              context.selectedFiles,
              context.currentFolder || ''
            );
            return this.formatToolResult('organizeFilesByType', result);
          } catch (error) {
            console.error('Organize error:', error);
          }
        } else {
          return "✨ I can organize your files by type! However, I need access to your file list. Please make sure you're viewing files in the file manager, then ask me again.";
        }
      }
    }

    // Pattern: "create folder" - VERY BROAD
    if ((lowerMessage.includes('create') || lowerMessage.includes('make') || 
         lowerMessage.includes('new') || lowerMessage.includes('add')) &&
        (lowerMessage.includes('folder') || lowerMessage.includes('directory'))) {
      
      const folderPatterns = [
        /(?:create|make|new|add)\s+(?:a |an )?folder\s+(?:called |named |called:|named:)?\s*(.+?)(?:\?|$)/i,
        /folder\s+(?:called |named )(.+?)(?:\?|$)/i,
        /(?:create|make)\s+(.+?)\s+folder/i
      ];
      
      for (const pattern of folderPatterns) {
        const match = lowerMessage.match(pattern);
        if (match && match[1]) {
          const folderName = match[1].trim();
          try {
            console.log(`🔧 Creating folder: ${folderName}`);
            const success = await SquidAITools.createFolder(folderName, context?.currentFolder);
            return success 
              ? `✅ Created folder "${folderName}" successfully!`
              : `❌ Failed to create folder "${folderName}"`;
          } catch (error) {
            console.error('Create folder error:', error);
            return `❌ Error creating folder: ${error}`;
          }
        }
      }
    }

    // Pattern: "create file" - VERY BROAD
    if ((lowerMessage.includes('create') || lowerMessage.includes('make') ||
         lowerMessage.includes('new') || lowerMessage.includes('add') ||
         lowerMessage.includes('generate')) &&
        (lowerMessage.includes('file') || lowerMessage.includes('.txt') ||
         lowerMessage.includes('.md') || lowerMessage.includes('readme'))) {
      
      const filePatterns = [
        /(?:create|make|new|add|generate)\s+(?:a |an )?file\s+(?:called |named |called:|named:)?\s*(.+?)(?:\?|$)/i,
        /(?:create|make|generate)\s+(.+?\.(?:txt|md|json|js|ts|py|html|css))\b/i,
        /file\s+(?:called |named )(.+?)(?:\?|$)/i
      ];
      
      for (const pattern of filePatterns) {
        const match = lowerMessage.match(pattern);
        if (match && match[1]) {
          const fileName = match[1].trim();
          const defaultContent = `# ${fileName}\n\nCreated by SquidAI on ${new Date().toLocaleDateString()}\n`;
          try {
            console.log(`🔧 Creating file: ${fileName}`);
            const result = await SquidAITools.createFile(
              fileName,
              defaultContent,
              context?.currentFolder
            );
            return result.success
              ? `✅ Created file "${fileName}" successfully!`
              : `❌ Failed to create file: ${result.error}`;
          } catch (error) {
            console.error('Create file error:', error);
            return `❌ Error creating file: ${error}`;
          }
        }
      }
    }

    // Pattern: "list" or "show" folders - VERY BROAD
    if ((lowerMessage.includes('list') || lowerMessage.includes('show') ||
         lowerMessage.includes('display') || lowerMessage.includes('get')) &&
        (lowerMessage.includes('folder') || lowerMessage.includes('directories') ||
         lowerMessage.includes('directory'))) {
      try {
        console.log('🔧 Listing folders...');
        const folders = await SquidAITools.listFolders(context?.currentFolder);
        if (folders.length === 0) {
          return "📁 No folders found in this location.";
        }
        const folderList = folders.map(f => `📁 ${f.name}`).join('\n');
        return `📁 **Folders** (${folders.length}):\n\n${folderList}`;
      } catch (error) {
        console.error('List folders error:', error);
      }
    }

    console.log('❌ No pattern matched');
    return null;
  }

  /**
   * Format tool results into user-friendly messages
   */
  private formatToolResult(toolName: string, result: any): string {
    if (result.error) {
      return `❌ Error: ${result.error}`;
    }

    switch (toolName) {
      case 'countFilesByExtension':
        return `📊 Found **${result}** file(s) with that extension.`;
      
      case 'getFileAnalytics':
        return `📊 **Storage Analytics:**
- Total Files: ${result.totalFiles}
- Total Size: ${SquidAITools.formatFileSize(result.totalSize)}
- File Types: ${Object.entries(result.filesByType).map(([type, count]) => `${type} (${count})`).join(', ')}
- Largest File: ${result.largestFiles[0]?.name || 'N/A'}`;
      
      case 'createFile':
        return result.success 
          ? `✅ File created successfully!` 
          : `❌ Failed to create file: ${result.error}`;
      
      case 'createFolder':
        return result 
          ? `✅ Folder created successfully!` 
          : `❌ Failed to create folder`;
      
      case 'searchFiles':
        return `🔍 Found ${result.totalResults} results: ${result.files.length} files, ${result.folders.length} folders`;
      
      case 'organizeFilesByType':
        return `✨ ${result.summary}`;
      
      case 'getStorageUsed':
        return `💾 **Storage Usage:**
- Used: ${SquidAITools.formatFileSize(result.used)}
- Total: ${SquidAITools.formatFileSize(result.total)}
- ${result.percentage.toFixed(1)}% used`;
      
      default:
        return `✅ Operation completed: ${JSON.stringify(result)}`;
    }
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  getAvailableTools(): ToolDefinition[] {
    return this.availableTools;
  }
}

export const squidAI = new SquidAI();

