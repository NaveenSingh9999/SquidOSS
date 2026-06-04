#!/usr/bin/env node
import { spawn, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const ROOT = dirname(fileURLToPath(import.meta.url))
const BACKEND = resolve(ROOT, 'backend')
const SCRIPTS = resolve(ROOT, 'scripts')
const ENV_FILE = resolve(BACKEND, '.env')
const ENV_EXAMPLE = resolve(BACKEND, '.env.example')
const PID_FILE = resolve(ROOT, '.crd-pids.json')
const LOG_DIR = resolve(ROOT, '.crd-logs')
const LOG_BACKEND = resolve(LOG_DIR, 'backend.log')
const LOG_FRONTEND = resolve(LOG_DIR, 'frontend.log')
const MIGRATION_FILE = resolve(BACKEND, 'migrations/001_schema.sql')

const log = (...a) => console.log('[crd]', ...a)
const warn = (...a) => console.warn('[crd]', ...a)
const err = (...a) => console.error('[crd]', ...a)

function readPids() {
  try { return JSON.parse(readFileSync(PID_FILE, 'utf-8')) } catch { return {} }
}
function writePids(p) { writeFileSync(PID_FILE, JSON.stringify({ ...p, timestamp: Date.now() })) }
function isRunning(pid) { try { return process.kill(pid, 0) } catch { return false } }

function detectPM(cwd = ROOT) {
  if (existsSync(resolve(cwd, 'bun.lockb'))) try { execSync('bun --version', { stdio: 'ignore' }); return 'bun' } catch {}
  if (existsSync(resolve(cwd, 'pnpm-lock.yaml'))) try { execSync('pnpm --version', { stdio: 'ignore' }); return 'pnpm' } catch {}
  if (existsSync(resolve(cwd, 'yarn.lock'))) try { execSync('yarn --version', { stdio: 'ignore' }); return 'yarn' } catch {}
  return 'npm'
}

function getPlatform() {
  const p = process.platform
  if (p === 'darwin') return 'macos'
  if (p === 'win32') return 'windows'
  return 'linux'
}

function getOS() {
  try {
    if (getPlatform() === 'linux') {
      const id = execSync('cat /etc/os-release 2>/dev/null | grep "^ID=" | cut -d= -f2', { encoding: 'utf-8' }).trim().replace(/"/g, '')
      if (id === 'termux' || process.env.PREFIX === '/data/data/com.termux/files/usr') return 'termux'
      return id || 'linux'
    }
    if (getPlatform() === 'macos') return 'macos'
    return 'windows'
  } catch { return 'linux' }
}

async function sh(program, args, cwd = ROOT) {
  return new Promise(r => {
    const c = spawn(program, args, { cwd, stdio: 'inherit', shell: true })
    c.on('close', code => r(code ?? 0))
    c.on('error', () => r(1))
  })
}

async function run(cmd, cwd = ROOT) {
  return new Promise(r => {
    const c = spawn('sh', ['-c', cmd], { cwd, stdio: 'inherit', shell: true })
    c.on('close', code => r(code ?? 0))
    c.on('error', () => r(1))
  })
}

async function out(cmd, cwd = ROOT) {
  try { return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 15000 }).trim() } catch { return '' }
}

function getPkgManagerInstall() {
  const os = getOS()
  if (os === 'termux') return 'pkg install -y'
  if (os === 'macos') return 'brew install'
  if (os.includes('debian') || os.includes('ubuntu') || os === 'linux') return 'apt-get install -y'
  return ''
}

// ── Install ──────────────────────────────────────────────────
async function install() {
  log(`Platform: ${getPlatform()}, OS: ${getOS()}`)
  const pm = getPkgManagerInstall()
  const installs = []

  // Check Node.js
  try {
    const v = execSync('node --version', { encoding: 'utf-8' }).trim()
    log(`Node.js ${v}`)
  } catch {
    if (getOS() === 'termux') installs.push('nodejs-lts')
    else if (getOS() === 'macos') { await run('brew install node'); await run('brew install node') }
    else warn('Install Node.js manually: https://nodejs.org')
  }

  // Check PostgreSQL
  try {
    execSync('psql --version', { stdio: 'ignore' })
    log('PostgreSQL found')
  } catch {
    if (pm) {
      if (getOS() === 'termux') installs.push('postgresql')
      else if (getOS() === 'macos') installs.push('postgresql@16')
      else installs.push('postgresql postgresql-client')
    }
  }

  // Check Redis
  try {
    const pong = await out('redis-cli ping')
    if (pong === 'PONG') log('Redis running')
    else throw new Error()
  } catch {
    if (pm) {
      if (getOS() === 'termux') installs.push('redis')
      else if (getOS() === 'macos') installs.push('redis')
      else installs.push('redis-server')
    }
  }

  if (installs.length > 0) {
    log(`Installing: ${installs.join(', ')}`)
    await run(`${pm} ${installs.join(' ')}`)
  }

  // npm deps
  if (!existsSync(resolve(BACKEND, 'node_modules'))) {
    log('Installing backend deps...')
    await run(`${detectPM(BACKEND)} install`, BACKEND)
  }
  if (!existsSync(resolve(ROOT, 'node_modules'))) {
    log('Installing frontend deps...')
    await run(`${detectPM(ROOT)} install`, ROOT)
  }

  log('Dependencies installed')
}

// ── Configure ────────────────────────────────────────────────
async function configure() {
  if (existsSync(ENV_FILE)) { log('.env exists'); return }

  if (!existsSync(ENV_EXAMPLE)) { err('.env.example missing'); return }

  let corsOrigin = 'http://localhost:5173'
  try {
    const codespace = execSync('echo $CODESPACE_NAME', { encoding: 'utf-8' }).trim()
    if (codespace) corsOrigin = `https://${codespace}-8080.app.github.dev`
  } catch {}

  let config = readFileSync(ENV_EXAMPLE, 'utf-8')
  config = config.replace(/DATABASE_URL=.*/, `DATABASE_URL=postgres://${getOS() === 'termux' ? '' : 'postgres:postgres@'}localhost:5432/squidoss`)
  config = config.replace(/REDIS_URL=.*/, 'REDIS_URL=redis://localhost:6379')
  config = config.replace(/JWT_SECRET=.*/, `JWT_SECRET=${randomBytes(32).toString('hex')}`)
  config = config.replace(/ENCRYPTION_KEY_SALT=.*/, `ENCRYPTION_KEY_SALT=${randomBytes(16).toString('hex')}`)
  config = config.replace(/CORS_ORIGIN=.*/, `CORS_ORIGIN=${corsOrigin}`)

  if (corsOrigin.includes('app.github.dev')) {
    config += `\nVITE_SQUIDOSS_API_URL=${corsOrigin.replace('-8080.', '-3000.')}`
  }
  writeFileSync(ENV_FILE, config)
  log('.env created')
}

// ── DB Setup ────────────────────────────────────────────────
function pg(sql, opts = {}) {
  const os = getOS()
  const methods = []
  if (os === 'termux') {
    methods.push(() => execSync(`psql -d squidoss -c "${sql.replace(/"/g, '\\"')}"`, { ...opts, stdio: 'ignore', timeout: 15000 }))
  }
  methods.push(
    () => execSync(`sudo -u postgres psql -c "${sql.replace(/"/g, '\\"')}" 2>/dev/null`, { ...opts, stdio: 'ignore', timeout: 15000 }),
    () => execSync(`psql -h localhost -U postgres -c "${sql.replace(/"/g, '\\"')}" 2>/dev/null`, { ...opts, stdio: 'ignore', timeout: 15000, env: { ...process.env, PGPASSWORD: 'postgres' } }),
    () => execSync(`psql -c "${sql.replace(/"/g, '\\"')}" 2>/dev/null`, { ...opts, stdio: 'ignore', timeout: 15000 }),
  )
  for (const m of methods) { try { return m() } catch {} }
}

function pgFile(file) {
  const os = getOS()
  const methods = []
  if (os === 'termux') {
    methods.push(() => execSync(`psql -d squidoss -f "${file}" 2>/dev/null`, { stdio: 'inherit', timeout: 180000 }))
  }
  methods.push(
    () => execSync(`sudo -u postgres psql -f "${file}" 2>/dev/null`, { stdio: 'inherit', timeout: 180000 }),
    () => execSync(`psql -h localhost -U postgres -f "${file}" 2>/dev/null`, { stdio: 'inherit', timeout: 180000, env: { ...process.env, PGPASSWORD: 'postgres' } }),
    () => execSync(`psql -f "${file}" 2>/dev/null`, { stdio: 'inherit', timeout: 180000 }),
  )
  for (const m of methods) { try { return m() } catch {} }
  throw new Error('Could not run psql')
}

async function startPostgres() {
  const os = getOS()
  try {
    if (os === 'termux') {
      await run('pg_ctl -D $PREFIX/var/lib/postgresql start 2>/dev/null || true')
      await new Promise(r => setTimeout(r, 2000))
    } else {
      await run('sudo service postgresql start 2>/dev/null || sudo systemctl start postgresql 2>/dev/null || pg_ctlcluster 16 main start 2>/dev/null || pg_ctlcluster 15 main start 2>/dev/null || pg_ctl -D /var/lib/postgresql/data start 2>/dev/null || true')
      await new Promise(r => setTimeout(r, 3000))
    }
  } catch {}
}

async function startRedis() {
  try {
    const pong = await out('redis-cli ping').catch(() => '')
    if (pong === 'PONG') return
    await run('redis-server --daemonize yes 2>/dev/null || sudo service redis-server start 2>/dev/null || sudo systemctl start redis-server 2>/dev/null || redis-cli 2>/dev/null || true')
    await new Promise(r => setTimeout(r, 2000))
  } catch {}
}

async function setupDatabase() {
  log('Setting up database...')
  await startPostgres()
  const os = getOS()
  if (os === 'termux') {
    pg('CREATE DATABASE squidoss')
  } else {
    pg(`ALTER USER postgres PASSWORD 'postgres'`)
    pg(`CREATE DATABASE squidoss OWNER postgres`)
    // Set trust auth in pg_hba.conf
    try {
      const hba = execSync('find /etc/postgresql -name pg_hba.conf 2>/dev/null | head -1', { encoding: 'utf-8' }).trim()
      if (hba) {
        for (const cmd of [
          `sed -i 's/local\\s\\+all\\s\\+all\\s\\+peer/local   all             all                                     trust/' "${hba}"`,
          `sed -i 's/host\\s\\+all\\s\\+all\\s\\+127.0.0.1\\/32\\s\\+scram-sha-256/host    all             all             127.0.0.1\\/32            trust/' "${hba}"`,
        ]) { try { execSync(cmd, { stdio: 'ignore' }) } catch {} }
        try { execSync('sudo pg_ctlcluster * main reload 2>/dev/null || sudo service postgresql reload 2>/dev/null || true', { stdio: 'ignore' }) } catch {}
      }
    } catch {}
  }
}

async function migrate() {
  if (!existsSync(MIGRATION_FILE)) { log('No migration found'); return }
  await startPostgres()
  await setupDatabase()

  log('Running full schema migration...')
  // Drop tables created by init to avoid conflicts
  const dropTables = [
    'DROP TABLE IF EXISTS public.files CASCADE',
    'DROP TABLE IF EXISTS public.folders CASCADE',
    'DROP TABLE IF EXISTS public.workspaces CASCADE',
    'DROP TABLE IF EXISTS public.github_repos CASCADE',
    'DROP TABLE IF EXISTS public.app_settings CASCADE',
    'DROP TABLE IF EXISTS public.profiles CASCADE',
    'DROP TABLE IF EXISTS auth.users CASCADE',
    'DROP SCHEMA IF EXISTS auth CASCADE',
    'DROP SCHEMA IF EXISTS extensions CASCADE',
  ]
  for (const stmt of dropTables) {
    try { pg(stmt) } catch {}
  }

  try {
    pgFile(MIGRATION_FILE)
    log('Schema applied')
  } catch (e) {
    warn(`Migration error: ${e.message}`)
  }
}

// ── Build ────────────────────────────────────────────────────
async function build() {
  log('Building SquidOSS...')
  await configure()
  await setupDatabase()

  if (!existsSync(resolve(BACKEND, 'node_modules'))) {
    log('Installing backend deps...')
    await run(`${detectPM(BACKEND)} install`, BACKEND)
  }
  if (!existsSync(resolve(ROOT, 'node_modules'))) {
    log('Installing frontend deps...')
    await run(`${detectPM(ROOT)} install`, ROOT)
  }

  await migrate()
  log('Build complete')
}

// ── Start ────────────────────────────────────────────────────
async function start() {
  if (!existsSync(ENV_FILE)) await configure()
  if (!existsSync(resolve(BACKEND, 'node_modules'))) { warn('Run ./crd build first'); return }

  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })

  await startPostgres()
  await startRedis()

  const pids = readPids()
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  if (!pids.backend || !isRunning(pids.backend)) {
    log('Starting backend...')
    const tsx = resolve(BACKEND, 'node_modules/.bin/tsx')
    if (!existsSync(tsx)) { warn('tsx not found'); return }

    const cmd = `nohup ${tsx} ${resolve(BACKEND, 'src/server.ts')} </dev/null >>"${LOG_BACKEND}" 2>&1 & echo $!`
    const pidStr = execSync(cmd, { cwd: BACKEND, encoding: 'utf-8', env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' } }).trim()
    const pid = parseInt(pidStr, 10)
    if (!isNaN(pid)) {
      pids.backend = pid
      writePids(pids)
      writeFileSync(LOG_BACKEND, `\n=== Started ${ts} (PID ${pid}) ===\n`, { flag: 'a' })
      await new Promise(r => setTimeout(r, 4000))
      if (isRunning(pid)) log(`Backend running (PID ${pid})`) 
      else { warn('Backend failed to start'); delete pids.backend; writePids(pids) }
    }
  } else {
    log(`Backend running (PID ${pids.backend})`)
  }

  // Health check
  const healthy = await out('curl -s --connect-timeout 3 http://localhost:3000/health 2>/dev/null || curl -s --connect-timeout 3 http://localhost:3000/api/v1 2>/dev/null || true')
  if (healthy) log('Backend responding')
  else warn('Backend not responding yet')

  // Frontend
  if (existsSync(resolve(ROOT, 'vite.config.ts')) && existsSync(resolve(ROOT, 'node_modules'))) {
    if (!pids.frontend || !isRunning(pids.frontend)) {
      log('Starting frontend...')
      const pm = detectPM(ROOT)
      const cmd = `nohup ${pm} run dev -- --host 0.0.0.0 </dev/null >>"${LOG_FRONTEND}" 2>&1 & echo $!`
      const pidStr = execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim()
      const pid = parseInt(pidStr, 10)
      if (!isNaN(pid)) {
        pids.frontend = pid
        writePids(pids)
        writeFileSync(LOG_FRONTEND, `\n=== Started ${ts} (PID ${pid}) ===\n`, { flag: 'a' })
        await new Promise(r => setTimeout(r, 4000))
        if (isRunning(pid)) log(`Frontend running (PID ${pid})`)
        else { warn('Frontend failed to start'); delete pids.frontend; writePids(pids) }
      }
    } else {
      log(`Frontend running (PID ${pids.frontend})`)
    }
  }

  // Determine frontend port
  let frontendPort = '5173'
  try {
    const vc = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf-8')
    const m = vc.match(/port:\s*(\d+)/)
    if (m) frontendPort = m[1]
  } catch {}

  log('SquidOSS running')
  log(`  Backend:  http://localhost:3000`)
  if (pids.frontend) log(`  Frontend: http://localhost:${frontendPort}`)
}

// ── Stop ─────────────────────────────────────────────────────
async function stop() {
  log('Stopping...')
  const pids = readPids()
  for (const key of ['frontend', 'backend']) {
    if (pids[key]) { try { process.kill(pids[key], 'SIGTERM') } catch {} }
  }
  // Kill any orphaned processes
  try { execSync('pkill -f "tsx.*server" 2>/dev/null; pkill -f "vite" 2>/dev/null', { stdio: 'ignore' }) } catch {}
  writePids({})
  log('Stopped')
}

// ── Status ───────────────────────────────────────────────────
async function status() {
  const pids = readPids()
  const back = pids.backend && isRunning(pids.backend)
  const front = pids.frontend && isRunning(pids.frontend)
  const pgOk = !!pg('SELECT 1')
  const redisOk = await out('redis-cli ping').then(r => r === 'PONG').catch(() => false)
  try {
    const resp = await out('curl -s --connect-timeout 2 http://localhost:3000/health').catch(() => '')
    console.log(`\n=== SquidOSS Status ===`)
    console.log(`Backend:   ${back ? 'running' : 'stopped'}${resp ? ' (responding)' : ''}`)
    console.log(`Frontend:  ${front ? 'running' : 'stopped'}`)
    console.log(`PostgreSQL: ${pgOk ? 'running' : 'stopped'}`)
    console.log(`Redis:     ${redisOk ? 'running' : 'stopped'}`)
    console.log(`Platform:  ${getPlatform()} (${getOS()})\n`)
  } catch { console.log('Status check failed\n') }
}

// ── Doctor ───────────────────────────────────────────────────
async function doctor() {
  log('Running diagnostics...')
  const pgOk = !!pg('SELECT 1')
  const redisOk = await out('redis-cli ping').then(r => r === 'PONG').catch(() => false)
  const backendMods = existsSync(resolve(BACKEND, 'node_modules'))
  const rootMods = existsSync(resolve(ROOT, 'node_modules'))
  const envOk = existsSync(ENV_FILE)
  const dbOk = !!pg("SELECT 1 FROM pg_database WHERE datname='squidoss'").catch(() => false)

  const checks = [
    ['Node.js', process.version],
    ['Platform', `${getPlatform()} (${getOS()})`],
    ['PostgreSQL', pgOk ? 'running' : 'stopped'],
    ['Redis', redisOk ? 'running' : 'stopped'],
    ['Backend deps', backendMods ? 'installed' : 'missing'],
    ['Frontend deps', rootMods ? 'installed' : 'missing'],
    ['.env', envOk ? 'configured' : 'missing'],
    ['Database', dbOk ? 'exists' : 'missing'],
  ]
  let allOk = true
  for (const [name, status] of checks) {
    const ok = !['stopped', 'missing'].includes(status)
    console.log(`  ${ok ? '✓' : '✗'} ${name}: ${status}`)
    if (!ok) allOk = false
  }

  // Check running services
  const pids = readPids()
  if (pids.backend && isRunning(pids.backend)) console.log(`  ✓ Backend process: PID ${pids.backend}`)
  if (pids.frontend && isRunning(pids.frontend)) console.log(`  ✓ Frontend process: PID ${pids.frontend}`)

  if (allOk) log('All good')
  else warn('Issues found — run ./crd install && ./crd build')
}

// ── Logs ─────────────────────────────────────────────────────
async function logs() {
  const target = process.argv[3] || 'all'
  const files = []
  if (target === 'backend' || target === 'all') files.push(LOG_BACKEND)
  if (target === 'frontend' || target === 'all') files.push(LOG_FRONTEND)
  if (target === 'all') files.push(resolve(LOG_DIR, 'install.log'))

  for (const f of files) {
    if (!existsSync(f)) { warn(`No log: ${basename(f)}`); continue }
    console.log(`\n=== ${basename(f)} ===`)
    const lines = readFileSync(f, 'utf-8').split('\n').slice(-50).join('\n')
    console.log(lines)
  }
}

// ── Reset ────────────────────────────────────────────────────
async function reset() {
  log('Resetting database...')
  if (!pg('SELECT 1')) { warn('PostgreSQL not running'); await startPostgres() }
  try {
    pg('DROP DATABASE IF EXISTS squidoss')
    pg('CREATE DATABASE squidoss')
    log('Database reset. Run ./crd migrate to re-apply schema, or ./crd build for full setup')
  } catch (e) { err(`Reset failed: ${e.message}`) }
}

// ── Update ───────────────────────────────────────────────────
async function update() {
  log('Updating SquidOSS...')
  await run('git pull')
  await migrate()
  if (existsSync(resolve(BACKEND, 'node_modules'))) {
    await run(`${detectPM(BACKEND)} install`, BACKEND)
  }
  if (existsSync(resolve(ROOT, 'node_modules'))) {
    await run(`${detectPM(ROOT)} install`, ROOT)
  }
  log('Update complete — run ./crd restart')
}

// ── Restart ──────────────────────────────────────────────────
async function restart() {
  await stop()
  await new Promise(r => setTimeout(r, 2000))
  await start()
}

// ── Launcher ─────────────────────────────────────────────────
async function launcher() {
  const platform = getPlatform()
  log(`Creating launcher for ${platform}...`)

  // Use favicon for logo
  const favicon = resolve(ROOT, 'public/favicon.ico')
  const placeholder = resolve(ROOT, 'public/placeholder.svg')
  const logoSource = existsSync(favicon) ? favicon : placeholder

  if (platform === 'macos') {
    const appDir = resolve('/Applications', 'SquidOSS.app')
    const contentsDir = resolve(appDir, 'Contents')
    const macosDir = resolve(contentsDir, 'MacOS')
    const resourcesDir = resolve(contentsDir, 'Resources')
    mkdirSync(macosDir, { recursive: true })
    mkdirSync(resourcesDir, { recursive: true })

    const launcherScript = `#!/bin/bash
cd "${ROOT}"
osascript -e 'tell app "Terminal" to do script "cd ${ROOT} && ./crd logs backend"'
open http://localhost:5173
./crd start
echo "SquidOSS running. Close this window to stop."
read -p "Press Enter to stop..." _
./crd stop
`
    writeFileSync(resolve(macosDir, 'SquidOSS'), launcherScript)
    execSync(`chmod +x "${resolve(macosDir, 'SquidOSS')}"`)

    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>SquidOSS</string>
  <key>CFBundleIdentifier</key><string>com.squidoss.app</string>
  <key>CFBundleName</key><string>SquidOSS</string>
  <key>CFBundleDisplayName</key><string>SquidOSS</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>`
    writeFileSync(resolve(contentsDir, 'Info.plist'), plist)
    copyFileSync(logoSource, resolve(resourcesDir, 'icon.ico'))
    log(`Created ${appDir}`)
    log('   Drag SquidOSS.app to Applications folder')

  } else if (platform === 'windows') {
    const launcher = `@echo off
cd /d "${ROOT}"
start "" "http://localhost:5173"
start "SquidOSS Backend" cmd /c "crd logs backend"
crd start
echo.
echo SquidOSS running. Close this window to stop all services.
pause
crd stop
`
    writeFileSync(resolve(ROOT, 'start-squidoss.bat'), launcher)
    log('Created start-squidoss.bat — double-click to run')

    // Also create a PowerShell launcher
    const psLauncher = `$ROOT = "${ROOT}"
$ws = New-Object -ComObject WScript.Shell
Start-Process "http://localhost:5173"
Start-Process powershell -ArgumentList "-NoExit -Command cd '$ROOT'; .\\crd logs backend" -WindowStyle Normal
Set-Location $ROOT
.\\crd start
Write-Host "SquidOSS running. Press any key to stop..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
.\\crd stop
`
    writeFileSync(resolve(ROOT, 'start-squidoss.ps1'), psLauncher)
    log('Created start-squidoss.ps1')

  } else {
    // Linux desktop shortcut
    const hasDE = !!await out('echo $XDG_CURRENT_DESKTOP').catch(() => '') || !!await out('echo $DISPLAY').catch(() => '')
    if (hasDE) {
      const desktopDir = resolve(process.env.HOME || '/tmp', '.local/share/applications')
      mkdirSync(desktopDir, { recursive: true })
      const desktopEntry = `[Desktop Entry]
Version=1.0
Type=Application
Name=SquidOSS
Comment=SquidOSS File Storage
Exec=${ROOT}/crd start && xdg-open http://localhost:5173
Icon=${logoSource}
Terminal=true
Categories=Utility;FileTools;Network;
StartupNotify=true
`
      writeFileSync(resolve(desktopDir, 'squidoss.desktop'), desktopEntry)
      execSync(`chmod +x "${resolve(desktopDir, 'squidoss.desktop')}"`)
      log(`Created ${desktopDir}/squidoss.desktop`)
    } else {
      warn('No desktop environment detected, skipping shortcut')
    }

    // Also create a .desktop on the desktop
    try {
      const desktopPath = resolve(process.env.HOME || '/tmp', 'Desktop/squidoss.desktop')
      const desktopEntry = `[Desktop Entry]
Version=1.0
Type=Application
Name=SquidOSS
Comment=SquidOSS File Storage
Exec=${ROOT}/crd run
Icon=${logoSource}
Terminal=true
Categories=Utility;FileTools;Network;
`
      writeFileSync(desktopPath, desktopEntry)
      execSync(`chmod +x "${desktopPath}"`)
      log(`Created ~/Desktop/squidoss.desktop`)
    } catch {}
  }
}

// ── Run (foreground) ─────────────────────────────────────────
async function runForeground() {
  log('Running SquidOSS in foreground...')
  if (!existsSync(ENV_FILE)) await configure()
  if (!existsSync(resolve(BACKEND, 'node_modules'))) { warn('Run ./crd build first'); return }

  await startPostgres()
  await startRedis()

  // Start backend in foreground
  const backendMod = resolve(BACKEND, 'src/server.ts')
  log(`Backend: http://localhost:3000`)
  log(`Frontend: http://localhost:5173`)
  log('Press Ctrl+C to stop\n')

  // Run both processes
  const backend = spawn(resolve(BACKEND, 'node_modules/.bin/tsx'), [backendMod], {
    cwd: BACKEND, stdio: 'inherit', env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' },
  })
  backend.on('exit', () => process.exit(0))
}

// ── Main ─────────────────────────────────────────────────────
const CMD = process.argv[2] || 'help'
const CMDS = {
  install, build, start, stop, restart, status, doctor,
  configure, migrate, logs, reset, update, launcher, run: runForeground,
}

if (CMD === 'help') {
  console.log(`
SquidOSS CLI — universal management tool
Usage: ./crd <command> [options]

Commands:
  install     Install system deps (PostgreSQL, Redis, Node)
  build       Configure, install deps, migrate DB
  start       Start backend + frontend daemons
  stop        Stop all daemons
  restart     Stop then start
  status      Show service status
  doctor      Diagnose environment
  configure   Generate .env from example
  migrate     Run database schema migration
  logs        [backend|frontend] Show recent logs (default: all)
  reset       Drop and recreate database
  update      Git pull + rebuild
  launcher    Create platform app launcher
  run         Run in foreground (Ctrl+C to stop)
`)
} else if (CMDS[CMD]) {
  CMDS[CMD]().then(ok => { if (ok === false) process.exit(1) }).catch(e => { err(e.message); process.exit(1) })
} else {
  err(`Unknown: ${CMD}`)
  process.exit(1)
}
