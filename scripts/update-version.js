import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Increment patch version
const versionParts = packageJson.version.split('.');
versionParts[2] = (parseInt(versionParts[2]) + 1).toString();
const newVersion = versionParts.join('.');

// Update package.json
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

// Create version info for public/version.json
const timestamp = Date.now().toString();
const buildDate = new Date().toISOString();

const versionInfo = {
  version: newVersion,
  timestamp: timestamp,
  buildDate: buildDate
};

// Write to public/version.json
const versionJsonPath = path.join(__dirname, '..', 'public', 'version.json');
fs.writeFileSync(versionJsonPath, JSON.stringify(versionInfo) + '\n');

// Update service worker cache name
const serviceWorkerPath = path.join(__dirname, '..', 'public', 'service-worker.js');
let serviceWorkerContent = fs.readFileSync(serviceWorkerPath, 'utf8');

// Replace cache name with timestamp
serviceWorkerContent = serviceWorkerContent.replace(
  /const CACHE_NAME = '[^']*';.*$/m,
  `const CACHE_NAME = 'squidcloud-v${newVersion}-${timestamp}'; // Dynamic cache name`
);

fs.writeFileSync(serviceWorkerPath, serviceWorkerContent);

console.log(`✅ Version updated to ${newVersion} with timestamp ${timestamp}`);
console.log(`📦 Updated files: package.json, public/version.json, public/service-worker.js`);