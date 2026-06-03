#!/usr/bin/env node

/**
 * SquidLab SDK CLI
 * Commands:
 * - squidlab-sdk create <extension-name> - Create a new extension project
 * - squidlab-sdk convert <filename> - Convert extension to .sqe format
 * - squidlab-sdk validate <manifest> - Validate extension manifest
 * - squidlab-sdk dev - Start development server
 * - squidlab-sdk build - Build extension for production
 * - squidlab-sdk publish - Publish extension to marketplace
 */

const { program } = require('commander');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const archiver = require('archiver');

// Inline validation function
function validateManifest(manifest) {
  const errors = [];
  
  if (!manifest.name) errors.push('Missing required field: name');
  if (!manifest.version) errors.push('Missing required field: version');
  if (!manifest.description) errors.push('Missing required field: description');
  if (!manifest.author) errors.push('Missing required field: author');
  if (!manifest.entry) errors.push('Missing required field: entry');
  if (!manifest.permissions || !Array.isArray(manifest.permissions)) {
    errors.push('Missing or invalid field: permissions (must be array)');
  }
  
  return { valid: errors.length === 0, errors };
}

program
  .name('squidlab-sdk')
  .description('CLI tools for building SquidCloud extensions')
  .version('1.0.0');

// Create new extension project
program
  .command('create <extension-name>')
  .description('Create a new extension project from template')
  .option('-t, --template <type>', 'Template type: typescript, javascript, react', 'typescript')
  .option('-c, --category <category>', 'Extension category', 'utility')
  .action(async (extensionName, options) => {
    console.log(chalk.blue('🚀 Creating SquidCloud Extension...'));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'Extension description:',
        default: 'A SquidCloud extension'
      },
      {
        type: 'input',
        name: 'author',
        message: 'Author name:',
        default: 'Your Name'
      },
      {
        type: 'input',
        name: 'email',
        message: 'Author email:',
        default: 'you@example.com'
      },
      {
        type: 'checkbox',
        name: 'permissions',
        message: 'Select required permissions:',
        choices: [
          { name: 'Read files (files.read)', value: 'files.read', checked: true },
          { name: 'Write files (files.write)', value: 'files.write' },
          { name: 'Delete files (files.delete)', value: 'files.delete' },
          { name: 'User profile (user.profile)', value: 'user.profile' },
          { name: 'Storage quota (storage.quota)', value: 'storage.quota' },
          { name: 'Notifications (notifications)', value: 'notifications', checked: true }
        ]
      }
    ]);

    const projectDir = path.join(process.cwd(), extensionName);
    
    if (fs.existsSync(projectDir)) {
      console.log(chalk.red(`❌ Directory ${extensionName} already exists!`));
      process.exit(1);
    }

    fs.mkdirSync(projectDir);
    
    // Create project structure
    await createProjectStructure(projectDir, extensionName, options.template, answers);
    
    console.log(chalk.green(`✅ Extension "${extensionName}" created successfully!`));
    console.log(chalk.yellow('\n📦 Next steps:'));
    console.log(chalk.cyan(`  cd ${extensionName}`));
    console.log(chalk.cyan('  npm install'));
    console.log(chalk.cyan('  npm run dev'));
    console.log(chalk.yellow('\n📚 Documentation: https://docs.squidcloud.com/extensions\n'));
  });

// Convert extension to .sqe format
program
  .command('convert [directory]')
  .description('Convert extension to .sqe (SquidExtension) format')
  .option('-o, --output <path>', 'Output file path')
  .action(async (directory, options) => {
    console.log(chalk.blue('📦 Converting extension to .sqe format...'));
    
    // Use provided directory or current directory
    const sourceDir = directory ? path.resolve(directory) : process.cwd();
    
    // Validate source directory exists
    if (!fs.existsSync(sourceDir)) {
      console.log(chalk.red(`❌ Directory not found: ${sourceDir}`));
      process.exit(1);
    }
    
    // Validate manifest exists
    const manifestPath = path.join(sourceDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.log(chalk.red('❌ manifest.json not found in directory!'));
      console.log(chalk.yellow(`   Looking in: ${sourceDir}`));
      console.log(chalk.yellow('   Make sure you run this command from your extension directory'));
      process.exit(1);
    }
    
    // Read and validate manifest
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      console.log(chalk.red('❌ Invalid JSON in manifest.json'));
      process.exit(1);
    }
    
    const validation = validateManifest(manifest);
    
    if (!validation.valid) {
      console.log(chalk.red('❌ Invalid manifest:'));
      validation.errors.forEach(err => console.log(chalk.red(`  - ${err}`)));
      process.exit(1);
    }
    
    // Determine output path
    const extensionName = manifest.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const defaultOutput = path.join(sourceDir, `${extensionName}-v${manifest.version}.sqe`);
    const outputPath = options.output ? path.resolve(options.output) : defaultOutput;
    
    console.log(chalk.cyan(`📋 Extension: ${manifest.name} v${manifest.version}`));
    console.log(chalk.cyan(`📁 Source: ${sourceDir}`));
    console.log(chalk.cyan(`📦 Output: ${outputPath}`));
    
    // Create .sqe archive
    await createSQEArchive(sourceDir, outputPath);
    
    const stats = fs.statSync(outputPath);
    const fileSizeInKB = (stats.size / 1024).toFixed(2);
    
    console.log(chalk.green(`✅ Extension packaged successfully!`));
    console.log(chalk.green(`   Size: ${fileSizeInKB} KB`));
    console.log(chalk.green(`   File: ${path.basename(outputPath)}`));
    console.log(chalk.yellow('\n📤 Ready to publish or install locally!\n'));
  });

// Validate manifest
program
  .command('validate <manifest>')
  .description('Validate extension manifest.json')
  .action((manifestPath) => {
    console.log(chalk.blue('🔍 Validating manifest...'));
    
    if (!fs.existsSync(manifestPath)) {
      console.log(chalk.red('❌ Manifest file not found!'));
      process.exit(1);
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const validation = validateManifest(manifest);
    
    if (validation.valid) {
      console.log(chalk.green('✅ Manifest is valid!'));
      console.log(chalk.cyan(`\n📋 Extension: ${manifest.name} v${manifest.version}`));
      console.log(chalk.cyan(`📝 Description: ${manifest.description}`));
      console.log(chalk.cyan(`🔐 Permissions: ${manifest.permissions.join(', ')}`));
    } else {
      console.log(chalk.red('❌ Manifest validation failed:'));
      validation.errors.forEach(err => console.log(chalk.red(`  - ${err}`)));
      process.exit(1);
    }
  });

// Development server
program
  .command('dev')
  .description('Start development server')
  .option('-p, --port <port>', 'Port number', '3000')
  .action((options) => {
    console.log(chalk.blue(`🚀 Starting development server on port ${options.port}...`));
    
    const express = require('express');
    const app = express();
    
    app.use(express.static('.'));
    app.use('/node_modules', express.static('node_modules'));
    
    app.listen(options.port, () => {
      console.log(chalk.green(`✅ Server running at http://localhost:${options.port}`));
      console.log(chalk.yellow('📝 Edit your files and refresh to see changes\n'));
    });
  });

// Build for production
program
  .command('build')
  .description('Build extension for production')
  .action(async () => {
    console.log(chalk.blue('🔨 Building extension...'));
    
    // Run build script
    const { execSync } = require('child_process');
    
    try {
      if (fs.existsSync('package.json')) {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        if (pkg.scripts && pkg.scripts.build) {
          execSync('npm run build', { stdio: 'inherit' });
        }
      }
      
      console.log(chalk.green('✅ Build completed successfully!'));
    } catch (error) {
      console.log(chalk.red('❌ Build failed!'));
      process.exit(1);
    }
  });

// Publish to marketplace
program
  .command('publish')
  .description('Publish extension to SquidCloud marketplace')
  .option('-k, --api-key <key>', 'SquidCloud API key')
  .action(async (options) => {
    console.log(chalk.blue('📤 Publishing extension to marketplace...'));
    
    // Read manifest
    const manifestPath = 'manifest.json';
    if (!fs.existsSync(manifestPath)) {
      console.log(chalk.red('❌ manifest.json not found!'));
      process.exit(1);
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const validation = validateManifest(manifest);
    
    if (!validation.valid) {
      console.log(chalk.red('❌ Invalid manifest:'));
      validation.errors.forEach(err => console.log(chalk.red(`  - ${err}`)));
      process.exit(1);
    }
    
    // Get API key
    const apiKey = options.apiKey || process.env.SQUIDCLOUD_API_KEY;
    if (!apiKey) {
      console.log(chalk.red('❌ API key required! Use --api-key or set SQUIDCLOUD_API_KEY'));
      process.exit(1);
    }
    
    // Create .sqe package
    const sqePath = `${manifest.name}.sqe`;
    await createSQEArchive('.', sqePath);
    
    console.log(chalk.yellow('📦 Uploading extension...'));
    
    // Upload to marketplace (implement API call)
    const FormData = require('form-data');
    const axios = require('axios');
    
    const form = new FormData();
    form.append('extension', fs.createReadStream(sqePath));
    form.append('manifest', JSON.stringify(manifest));
    
    try {
      const response = await axios.post(
        'https://squidcloud.inflate.live/api/v1/extensions/publish',
        form,
        {
          headers: {
            ...form.getHeaders(),
            'Authorization': `Bearer ${apiKey}`,
            'X-API-Key': apiKey
          }
        }
      );
      
      console.log(chalk.green('✅ Extension published successfully!'));
      console.log(chalk.cyan(`🔗 View at: https://squidcloud.inflate.live/extensions/${manifest.name}`));
    } catch (error) {
      console.log(chalk.red('❌ Publish failed:', error.message));
      if (error.response) {
        console.log(chalk.red(`   Status: ${error.response.status}`));
        console.log(chalk.red(`   Details: ${JSON.stringify(error.response.data)}`));
      }
      process.exit(1);
    }
  });

// API Commands - Direct API interaction without curl
const os = require('os');
const configPath = path.join(os.homedir(), '.squidlab-config.json');

// Helper to load config
function loadConfig() {
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  return {};
}

// Helper to save config
function saveConfig(config) {
  try {
    // Ensure directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (error) {
    console.error(chalk.red('❌ Failed to save config:', error.message));
    throw error;
  }
}

// Helper to make API requests
async function makeAPIRequest(endpoint, method = 'GET', data = null) {
  const config = loadConfig();
  const apiKey = config.apiKey;
  
  if (!apiKey) {
    console.log(chalk.red('❌ Not logged in! Run: squidlab-sdk login'));
    process.exit(1);
  }
  
  const axios = require('axios');
  const baseURL = 'https://aouqcwbdoyrccjcrhzzi.supabase.co/functions/v1/cloudbliss-api';
  
  try {
    const response = await axios({
      method,
      url: `${baseURL}${endpoint}`,
      data,
      headers: {
        'X-SquidCloud-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    // Check if response has success field
    if (response.data && response.data.success === false) {
      throw new Error(response.data.error || 'API request failed');
    }
    
    return response.data;
  } catch (error) {
    if (error.response) {
      const errorMsg = error.response.data?.error || error.response.data?.message || error.response.statusText;
      throw new Error(`API Error (${error.response.status}): ${errorMsg}`);
    }
    throw error;
  }
}

// Login command
program
  .command('login')
  .description('Login to SquidCloud API')
  .option('-k, --api-key <key>', 'Your API key')
  .action(async (options) => {
    console.log(chalk.blue('🔐 SquidCloud API Login'));
    
    let apiKey = options.apiKey;
    
    if (!apiKey) {
      const answers = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: 'Enter your API key (starts with cb_):',
          mask: '*',
          validate: (input) => {
            if (!input || input.trim().length === 0) {
              return 'API key cannot be empty';
            }
            if (!input.startsWith('cb_')) {
              return 'API key must start with cb_';
            }
            if (input.length < 20) {
              return 'API key seems too short';
            }
            return true;
          }
        }
      ]);
      apiKey = answers.apiKey.trim();
    }
    
    // Validate API key format
    if (!apiKey.startsWith('cb_')) {
      console.log(chalk.red('❌ Invalid API key format. Key must start with cb_'));
      process.exit(1);
    }
    
    // Validate API key by making a test request
    try {
      const axios = require('axios');
      console.log(chalk.yellow('🔍 Validating API key...'));
      
      const response = await axios.get('https://aouqcwbdoyrccjcrhzzi.supabase.co/functions/v1/cloudbliss-api/whoami', {
        headers: {
          'X-SquidCloud-Key': apiKey
        }
      });
      
      const userData = response.data;
      
      if (!userData.success) {
        throw new Error(userData.error || 'Invalid API key');
      }
      
      // Show user confirmation
      console.log(chalk.green('\n✅ API Key Valid!'));
      console.log(chalk.blue('\n👤 Account Information:'));
      console.log(chalk.cyan(`   Email: ${userData.email || 'N/A'}`));
      console.log(chalk.cyan(`   Name: ${userData.full_name || 'Not set'}`));
      console.log(chalk.cyan(`   User ID: ${userData.id}`));
      console.log(chalk.cyan(`   Account Created: ${new Date(userData.created_at).toLocaleDateString()}`));
      
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Is this the correct account?',
          default: true
        }
      ]);
      
      if (!confirm) {
        console.log(chalk.yellow('⚠️  Login cancelled'));
        process.exit(0);
      }
      
      // Save config
      saveConfig({ 
        apiKey, 
        userId: userData.id,
        email: userData.email,
        loggedInAt: new Date().toISOString() 
      });
      
      console.log(chalk.green('\n✅ Login successful!'));
      console.log(chalk.cyan(`📝 Config saved to: ${configPath}`));
      console.log(chalk.yellow('\n💡 You can now use API commands!'));
      console.log(chalk.gray('\nTry: squidlab-sdk whoami'));
    } catch (error) {
      console.log(chalk.red('\n❌ Login failed!'));
      if (error.response) {
        const errorMsg = error.response.data?.error || error.response.statusText;
        console.log(chalk.red(`   Error: ${errorMsg}`));
        console.log(chalk.red(`   Status: ${error.response.status}`));
      } else {
        console.log(chalk.red(`   Error: ${error.message}`));
      }
      console.log(chalk.yellow('\n💡 Make sure you:'));
      console.log(chalk.yellow('   1. Have a valid API key from https://squidcloud.inflate.live'));
      console.log(chalk.yellow('   2. The API key starts with cb_'));
      console.log(chalk.yellow('   3. The API key is active and not revoked'));
      process.exit(1);
    }
  });

// Logout command
program
  .command('logout')
  .description('Logout from SquidCloud API')
  .action(() => {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      console.log(chalk.green('✅ Logged out successfully!'));
    } else {
      console.log(chalk.yellow('⚠️  Not currently logged in'));
    }
  });

// Whoami command
program
  .command('whoami')
  .description('Show current logged in user')
  .action(async () => {
    try {
      const config = loadConfig();
      if (!config.apiKey) {
        console.log(chalk.red('❌ Not logged in! Run: squidlab-sdk login'));
        process.exit(1);
      }
      
      const data = await makeAPIRequest('/whoami');
      console.log(chalk.blue('👤 Current User:'));
      console.log(chalk.cyan(`   Email: ${data.email || 'N/A'}`));
      console.log(chalk.cyan(`   Name: ${data.full_name || 'Not set'}`));
      console.log(chalk.cyan(`   ID: ${data.id}`));
      console.log(chalk.cyan(`   Created: ${new Date(data.created_at).toLocaleDateString()}`));
      
      if (data.storage_used !== undefined) {
        const storageGB = (data.storage_used / (1024 * 1024 * 1024)).toFixed(2);
        console.log(chalk.cyan(`   Storage Used: ${storageGB} GB`));
      }
      
      console.log(chalk.gray(`\n📝 Logged in since: ${new Date(config.loggedInAt).toLocaleString()}`));
    } catch (error) {
      console.log(chalk.red('❌ Error:', error.message));
      console.log(chalk.yellow('\n💡 Try running: squidlab-sdk login'));
      process.exit(1);
    }
  });

// API Files commands
program
  .command('api:files:list')
  .description('List all your files')
  .option('-l, --limit <number>', 'Limit results', '50')
  .option('-f, --folder <id>', 'Filter by folder ID')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      let endpoint = `/files?limit=${options.limit}`;
      if (options.folder) {
        endpoint += `&folder_id=${options.folder}`;
      }
      
      const data = await makeAPIRequest(endpoint);
      
      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        const files = data.files || data.data || [];
        const count = data.count || data.total || files.length;
        
        console.log(chalk.blue(`📁 Files (${count} total):\n`));
        
        if (files.length === 0) {
          console.log(chalk.yellow('   No files found'));
        } else {
          files.forEach(file => {
            const size = formatFileSize(file.size || 0);
            const date = new Date(file.created_at).toLocaleDateString();
            console.log(chalk.cyan(`  📄 ${file.name}`));
            console.log(chalk.gray(`     ID: ${file.id} | Size: ${size} | Created: ${date}`));
          });
        }
      }
    } catch (error) {
      console.log(chalk.red('❌ Error:', error.message));
      process.exit(1);
    }
  });

// Upload file
program
  .command('api:files:upload <file-path>')
  .description('Upload a file')
  .option('-n, --name <name>', 'Custom file name')
  .option('-f, --folder <id>', 'Upload to folder ID')
  .option('-p, --public', 'Make file public')
  .action(async (filePath, options) => {
    if (!fs.existsSync(filePath)) {
      console.log(chalk.red('❌ File not found:', filePath));
      process.exit(1);
    }
    
    console.log(chalk.blue('📤 Uploading file...'));
    
    try {
      const config = loadConfig();
      const FormData = require('form-data');
      const axios = require('axios');
      
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath));
      if (options.name) form.append('name', options.name);
      if (options.folder) form.append('folder_id', options.folder);
      if (options.public) form.append('is_public', 'true');
      
      const response = await axios.post(
        'https://squidcloud.inflate.live/api/v1/files/upload',
        form,
        {
          headers: {
            ...form.getHeaders(),
            'Authorization': `Bearer ${config.apiKey}`,
            'X-API-Key': config.apiKey
          }
        }
      );
      
      console.log(chalk.green('✅ File uploaded successfully!'));
      console.log(chalk.cyan(`   ID: ${response.data.id}`));
      console.log(chalk.cyan(`   Name: ${response.data.name}`));
      console.log(chalk.cyan(`   Size: ${formatFileSize(response.data.size)}`));
      if (response.data.public_url) {
        console.log(chalk.cyan(`   URL: ${response.data.public_url}`));
      }
    } catch (error) {
      console.log(chalk.red('❌ Upload failed:', error.message));
      process.exit(1);
    }
  });

// Download file
program
  .command('api:files:download <file-id> [output-path]')
  .description('Download a file')
  .action(async (fileId, outputPath) => {
    try {
      console.log(chalk.blue('📥 Downloading file...'));
      
      const config = loadConfig();
      const axios = require('axios');
      
      const response = await axios.get(
        `https://squidcloud.inflate.live/api/v1/files/${fileId}/download`,
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'X-API-Key': config.apiKey
          },
          responseType: 'stream'
        }
      );
      
      const fileName = outputPath || response.headers['content-disposition']?.split('filename=')[1] || fileId;
      const writer = fs.createWriteStream(fileName);
      
      response.data.pipe(writer);
      
      writer.on('finish', () => {
        console.log(chalk.green('✅ File downloaded successfully!'));
        console.log(chalk.cyan(`   Saved to: ${fileName}`));
      });
      
      writer.on('error', (error) => {
        console.log(chalk.red('❌ Download failed:', error.message));
        process.exit(1);
      });
    } catch (error) {
      console.log(chalk.red('❌ Error:', error.message));
      process.exit(1);
    }
  });

// Delete file
program
  .command('api:files:delete <file-id>')
  .description('Delete a file')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (fileId, options) => {
    if (!options.yes) {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to delete this file?',
          default: false
        }
      ]);
      
      if (!answers.confirm) {
        console.log(chalk.yellow('❌ Cancelled'));
        return;
      }
    }
    
    try {
      await makeAPIRequest(`/files/${fileId}`, 'DELETE');
      console.log(chalk.green('✅ File deleted successfully!'));
    } catch (error) {
      console.log(chalk.red('❌ Error:', error.message));
      process.exit(1);
    }
  });

// API Keys commands
program
  .command('api:keys:list')
  .description('List all your API keys')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const data = await makeAPIRequest('/api-keys');
      
      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(chalk.blue(`🔑 API Keys (${data.length} total):\n`));
        data.forEach(key => {
          const created = new Date(key.created_at).toLocaleDateString();
          const status = key.is_active ? chalk.green('✓ Active') : chalk.red('✗ Inactive');
          console.log(chalk.cyan(`  ${key.name || 'Unnamed Key'}`));
          console.log(chalk.gray(`     Key: ${key.key_prefix}... | Created: ${created} | ${status}`));
        });
      }
    } catch (error) {
      console.log(chalk.red('❌ Error:', error.message));
      process.exit(1);
    }
  });

// Create API key
program
  .command('api:keys:create <name>')
  .description('Create a new API key')
  .option('-e, --expires <days>', 'Expiration in days')
  .action(async (name, options) => {
    try {
      const data = await makeAPIRequest('/api-keys', 'POST', {
        name,
        expires_in_days: options.expires ? parseInt(options.expires) : null
      });
      
      console.log(chalk.green('✅ API key created successfully!'));
      console.log(chalk.yellow('\n⚠️  IMPORTANT: Save this key now! You won\'t see it again.\n'));
      console.log(chalk.cyan(`   Name: ${data.name}`));
      console.log(chalk.cyan(`   Key: ${data.key}`));
      console.log(chalk.cyan(`   Created: ${new Date(data.created_at).toLocaleString()}`));
      if (data.expires_at) {
        console.log(chalk.cyan(`   Expires: ${new Date(data.expires_at).toLocaleString()}`));
      }
    } catch (error) {
      console.log(chalk.red('❌ Error:', error.message));
      process.exit(1);
    }
  });

// Revoke API key
program
  .command('api:keys:revoke <key-id>')
  .description('Revoke an API key')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (keyId, options) => {
    if (!options.yes) {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to revoke this API key?',
          default: false
        }
      ]);
      
      if (!answers.confirm) {
        console.log(chalk.yellow('❌ Cancelled'));
        return;
      }
    }
    
    try {
      await makeAPIRequest(`/api-keys/${keyId}`, 'DELETE');
      console.log(chalk.green('✅ API key revoked successfully!'));
    } catch (error) {
      console.log(chalk.red('❌ Error:', error.message));
      process.exit(1);
    }
  });

// Storage info
program
  .command('api:storage:info')
  .description('Get storage usage information')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const data = await makeAPIRequest('/storage/info');
      
      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        const used = formatFileSize(data.used);
        const total = formatFileSize(data.total);
        const percent = ((data.used / data.total) * 100).toFixed(1);
        
        console.log(chalk.blue('💾 Storage Information:\n'));
        console.log(chalk.cyan(`   Used: ${used}`));
        console.log(chalk.cyan(`   Total: ${total}`));
        console.log(chalk.cyan(`   Usage: ${percent}%`));
        console.log(chalk.cyan(`   Files: ${data.file_count}`));
        
        // Progress bar
        const barLength = 30;
        const filled = Math.round((data.used / data.total) * barLength);
        const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
        console.log(chalk.gray(`   [${bar}] ${percent}%`));
      }
    } catch (error) {
      console.log(chalk.red('❌ Error:', error.message));
      process.exit(1);
    }
  });

// Helper function to format file sizes
function formatFileSize(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

program.parse();

// Helper functions
async function createProjectStructure(projectDir, extensionName, template, answers) {
  // Create directories
  fs.mkdirSync(path.join(projectDir, 'src'));
  fs.mkdirSync(path.join(projectDir, 'assets'));
  fs.mkdirSync(path.join(projectDir, 'assets/icons'));
  
  // Create manifest.json
  const manifest = {
    name: extensionName,
    version: '1.0.0',
    description: answers.description,
    author: {
      name: answers.author,
      email: answers.email
    },
    entry: template === 'react' ? 'dist/index.html' : 'src/index.html',
    permissions: answers.permissions,
    icons: {
      '16': 'assets/icons/icon-16.png',
      '48': 'assets/icons/icon-48.png',
      '128': 'assets/icons/icon-128.png'
    },
    category: 'utility'
  };
  
  fs.writeFileSync(
    path.join(projectDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  
  // Create package.json
  const packageJson = {
    name: extensionName,
    version: '1.0.0',
    description: answers.description,
    main: 'src/index.js',
    scripts: {
      dev: 'squidlab-sdk dev',
      build: template === 'react' ? 'vite build' : 'echo "No build step"',
      convert: 'squidlab-sdk convert .',
      publish: 'squidlab-sdk publish'
    },
    dependencies: {
      'squidlab-sdk': '^1.0.0'
    },
    devDependencies: template === 'react' ? {
      'vite': '^5.0.0',
      '@vitejs/plugin-react': '^4.0.0',
      'typescript': '^5.0.0',
      '@types/react': '^18.0.0',
      '@types/react-dom': '^18.0.0'
    } : {}
  };
  
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  
  // Create template files based on type
  if (template === 'typescript') {
    await createTypeScriptTemplate(projectDir, extensionName);
  } else if (template === 'javascript') {
    await createJavaScriptTemplate(projectDir, extensionName);
  } else if (template === 'react') {
    await createReactTemplate(projectDir, extensionName);
  }
  
  // Create README
  const readme = `# ${extensionName}

${answers.description}

## Development

\`\`\`bash
npm install
npm run dev
\`\`\`

Visit http://localhost:3000 to test your extension.

## Build

\`\`\`bash
npm run build
npm run convert
\`\`\`

This creates a \`.sqe\` file ready for publishing.

## Publish

\`\`\`bash
npm run publish
\`\`\`

## Documentation

- [SquidLab SDK Docs](https://docs.squidcloud.com/sdk)
- [Extension Guide](https://docs.squidcloud.com/extensions)
`;
  
  fs.writeFileSync(path.join(projectDir, 'README.md'), readme);
  
  // Create .gitignore
  fs.writeFileSync(
    path.join(projectDir, '.gitignore'),
    'node_modules/\ndist/\n*.sqe\n.env\n'
  );
}

async function createTypeScriptTemplate(projectDir, extensionName) {
  // tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      lib: ['ES2020', 'DOM'],
      jsx: 'react',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      moduleResolution: 'node'
    },
    include: ['src/**/*']
  };
  
  fs.writeFileSync(
    path.join(projectDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2)
  );
  
  // src/index.ts
  const indexTs = `import { SquidLab, Card, Button, showToast } from 'squidlab-sdk';

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
  app.innerHTML = \`
    <div class="extension-container">
      <h1>${extensionName}</h1>
      <p>Your extension is running!</p>
    </div>
  \`;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initExtension);
} else {
  initExtension();
}
`;
  
  fs.writeFileSync(path.join(projectDir, 'src/index.ts'), indexTs);
  
  // src/index.html
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${extensionName}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="index.ts"></script>
</body>
</html>
`;
  
  fs.writeFileSync(path.join(projectDir, 'src/index.html'), indexHtml);
  
  // src/styles.css
  const stylesCss = `.extension-container {
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

h1 {
  color: #1f2937;
  margin-bottom: 16px;
}
`;
  
  fs.writeFileSync(path.join(projectDir, 'src/styles.css'), stylesCss);
}

async function createJavaScriptTemplate(projectDir, extensionName) {
  // src/index.js
  const indexJs = `const { SquidLab, Card, Button, showToast } = window.SquidLabSDK;

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
  app.innerHTML = \\\`
    <div class="extension-container">
      <h1>${extensionName}</h1>
      <p>Your extension is running!</p>
    </div>
  \\\`;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initExtension);
} else {
  initExtension();
}
`;
  
  fs.writeFileSync(path.join(projectDir, 'src/index.js'), indexJs);
  
  // src/index.html
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${extensionName}</title>
  <script src="https://unpkg.com/squidlab-sdk@latest/dist/index.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/squidlab-sdk@latest/dist/styles.css">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app"></div>
  <script src="index.js"></script>
</body>
</html>
`;
  
  fs.writeFileSync(path.join(projectDir, 'src/index.html'), indexHtml);
  
  // src/styles.css
  const stylesCss = `.extension-container {
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

h1 {
  color: #1f2937;
  margin-bottom: 16px;
}
`;
  
  fs.writeFileSync(path.join(projectDir, 'src/styles.css'), stylesCss);
}

async function createReactTemplate(projectDir, extensionName) {
  // src/App.tsx
  const appTsx = `import React, { useEffect, useState } from 'react';
import { SquidLab, Card, Button, showToast } from 'squidlab-sdk';

const squidLab = new SquidLab(window.__SQUIDLAB_CONFIG__);

function App() {
  const [files, setFiles] = useState([]);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    const result = await squidLab.files.sqfetch('/');
    if (result.success) {
      setFiles(result.data);
      showToast('Files loaded!', { type: 'success' });
    }
  };

  return (
    <div className="p-4">
      <Card title="${extensionName}" subtitle="SquidCloud Extension">
        <p>Total files: {files.length}</p>
        <Button onClick={loadFiles}>Refresh</Button>
      </Card>
    </div>
  );
}

export default App;
`;
  
  fs.writeFileSync(path.join(projectDir, 'src/App.tsx'), appTsx);
  
  // src/main.tsx
  const mainTsx = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'squidlab-sdk/dist/styles.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
  
  fs.writeFileSync(path.join(projectDir, 'src/main.tsx'), mainTsx);
  
  // index.html
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${extensionName}</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
`;
  
  fs.writeFileSync(path.join(projectDir, 'index.html'), indexHtml);
  
  // vite.config.ts
  const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist'
  }
});
`;
  
  fs.writeFileSync(path.join(projectDir, 'vite.config.ts'), viteConfig);
}

async function createSQEArchive(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    
    archive.pipe(output);
    
    // Always include manifest.json
    archive.file(path.join(sourceDir, 'manifest.json'), { name: 'manifest.json' });
    
    // Check if dist folder exists (built project)
    const distPath = path.join(sourceDir, 'dist');
    const srcPath = path.join(sourceDir, 'src');
    
    if (fs.existsSync(distPath)) {
      // Include built files from dist/
      archive.directory(distPath, 'dist');
      console.log(chalk.cyan('   Including built files from dist/'));
    } else if (fs.existsSync(srcPath)) {
      // Include source files from src/
      archive.directory(srcPath, 'src');
      console.log(chalk.cyan('   Including source files from src/'));
    } else {
      // Include all files except excluded ones
      console.log(chalk.cyan('   Including all project files'));
    }
    
    // Always include assets if they exist
    const assetsPath = path.join(sourceDir, 'assets');
    if (fs.existsSync(assetsPath)) {
      archive.directory(assetsPath, 'assets');
    }
    
    // Include package.json if it exists (for dependencies info)
    const packageJsonPath = path.join(sourceDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      archive.file(packageJsonPath, { name: 'package.json' });
    }
    
    // Add all other files except node_modules and .git
    archive.glob('**/*', {
      cwd: sourceDir,
      ignore: [
        'node_modules/**', 
        '.git/**', 
        '*.sqe', 
        'dist/**',  // Already added if exists
        'src/**',   // Already added if exists
        'assets/**', // Already added if exists
        'manifest.json', // Already added
        'package.json',  // Already added if exists
        '.env',
        '.env.local',
        '*.log',
        '.DS_Store',
        'Thumbs.db'
      ]
    });
    
    archive.finalize();
  });
}
