#!/usr/bin/env node
import { spawn, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const BACKEND = resolve(ROOT, 'backend')
const ENV_FILE = resolve(BACKEND, '.env')
const ENV_EXAMPLE = resolve(BACKEND, '.env.example')
const PID_FILE = resolve(ROOT, '.crd-pids.json')

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

async function sh(program, args, cwd = ROOT) {
  return new Promise(r => {
    const c = spawn(program, args, { cwd, stdio: 'inherit', shell: true })
    c.on('close', code => r(code ?? 0))
    c.on('error', () => r(1))
  })
}

async function out(program, args, cwd = ROOT) {
  try { return execSync(`${program} ${args.join(' ')}`, { cwd, encoding: 'utf-8' }).trim() } catch { return '' }
}

async function doctor() {
  log('Running diagnostics...')
  const pg = await out('pg_isready', ['-q']).then(() => true).catch(() => false)
  const redis = await out('redis-cli', ['ping']).then(r => r === 'PONG').catch(() => false)
  const backendMods = existsSync(resolve(BACKEND, 'node_modules'))
  const rootMods = existsSync(resolve(ROOT, 'node_modules'))
  const envOk = existsSync(ENV_FILE)

  const checks = [
    ['Node.js', process.version, parseInt(process.version.slice(1)) >= 18],
    ['PostgreSQL', pg ? 'running' : 'stopped', pg],
    ['Redis', redis ? 'running' : 'stopped', redis],
    ['Backend deps', backendMods ? 'installed' : 'missing', backendMods],
    ['Frontend deps', rootMods ? 'installed' : 'missing', rootMods],
    ['.env', envOk ? 'configured' : 'missing', envOk],
  ]
  let ok = true
  for (const [name, status, healthy] of checks) {
    console.log(`  ${healthy ? '✓' : '✗'} ${name}: ${status}`)
    if (!healthy) ok = false
  }
  if (ok) log('All good')
  else warn('Some issues found')
}

async function configure() {
  if (!existsSync(ENV_EXAMPLE)) { err('.env.example missing'); return false }
  if (existsSync(ENV_FILE)) { log('.env already exists'); return true }

  // Detect Codespaces URL for CORS
  let corsOrigin = 'http://localhost:5173'
  try {
    const codespace = execSync('echo $CODESPACE_NAME', { encoding: 'utf-8' }).trim()
    if (codespace) corsOrigin = `https://${codespace}-8080.app.github.dev`
  } catch {}

  let config = readFileSync(ENV_EXAMPLE, 'utf-8')
  config = config.replace(/DATABASE_URL=.*/, 'DATABASE_URL=postgres://postgres:postgres@localhost:5432/squidoss')
  config = config.replace(/REDIS_URL=.*/, 'REDIS_URL=redis://localhost:6379')
  config = config.replace(/JWT_SECRET=.*/, `JWT_SECRET=${(await import('node:crypto')).randomBytes(32).toString('hex')}`)
  config = config.replace(/CORS_ORIGIN=.*/, `CORS_ORIGIN=${corsOrigin}`)
  writeFileSync(ENV_FILE, config)
  log('.env created')
}

function dbUrl() {
  try {
    const raw = readFileSync(ENV_FILE, 'utf-8')
    const line = raw.split('\n').find(l => l.startsWith('DATABASE_URL='))
    if (!line) return ''
    return line.split('=').slice(1).join('=')
  } catch { return '' }
}

// Run psql using the connection URI (password is embedded)
function psqlRun(sqlOrFile) {
  const url = dbUrl()
  if (!url) throw new Error('DATABASE_URL not set')
  const isFile = existsSync(sqlOrFile)
  const cmd = isFile
    ? `psql "${url}" -f "${sqlOrFile}"`
    : `psql "${url}" -c "${sqlOrFile}"`
  return execSync(cmd, { stdio: 'inherit', encoding: 'utf-8', timeout: 60000 })
}

async function setupPostgres() {
  const url = dbUrl()
  if (!url) return
  log('Ensuring PostgreSQL database exists...')
  try {
    // Try to create database (ignore if exists)
    execSync(`psql "${url}" -c "SELECT 1"`, { stdio: 'ignore', timeout: 5000 })
    log('Database already accessible')
    return
  } catch {}
  // Create DB via postgres default connection
  try {
    execSync(`createdb "$(echo "${url}" | sed 's/.*\\///' | sed 's/\\?.*//')" 2>/dev/null`, { stdio: 'ignore' })
  } catch {}
}

async function migrate() {
  const migration = resolve(BACKEND, 'migrations/001_schema.sql')
  if (!existsSync(migration)) { log('No schema migration found, skipping'); return }
  if (!existsSync(ENV_FILE)) { warn('No .env file, skipping migration'); return }

  await setupPostgres()

  try {
    log('Running schema migration...')
    psqlRun(migration)
    log('Schema migrated')
  } catch (e) {
    warn(`Migration had partial errors: ${e.message}`)
  }
}

async function build() {
  log('Building SquidOSS...')
  await configure()

  log('Installing backend dependencies...')
  await sh(detectPM(BACKEND), ['install', '--no-optional'], BACKEND)

  log('Installing frontend dependencies...')
  await sh(detectPM(ROOT), ['install', '--no-optional'], ROOT)

  await migrate()
  log('Build complete')
}

async function start() {
  if (!existsSync(ENV_FILE)) await configure()
  if (!existsSync(resolve(BACKEND, 'node_modules'))) {
    warn('Dependencies not installed, run ./crd build first')
    return
  }

  // Ensure PostgreSQL is running
  const pgUrl = dbUrl()
  try {
    if (pgUrl) execSync(`psql "${pgUrl}" -c "SELECT 1" 2>/dev/null`, { stdio: 'ignore', timeout: 5000 })
  } catch {
    log('Starting PostgreSQL...')
    try {
      execSync('sudo pg_ctlcluster 16 main start 2>/dev/null || sudo pg_ctlcluster 15 main start 2>/dev/null || sudo pg_ctlcluster 14 main start 2>/dev/null || sudo service postgresql start 2>/dev/null || pg_ctl start -l /dev/null 2>/dev/null', { stdio: 'ignore' })
      await new Promise(r => setTimeout(r, 3000))
    } catch { warn('Could not auto-start PostgreSQL, try: sudo service postgresql start') }
  }

  // Ensure Redis is running
  if (await out('redis-cli', ['ping']).then(r => r !== 'PONG').catch(() => true)) {
    log('Starting Redis...')
    try {
      // Try installing Redis first (Codespaces, bare OS)
      if (!existsSync('/usr/bin/redis-server')) {
        try {
          execSync('sudo apt-get install redis-server -y 2>/dev/null || sudo apt install redis -y 2>/dev/null', { stdio: 'ignore' })
        } catch {}
      }
      execSync('redis-server --daemonize yes 2>/dev/null || sudo service redis-server start 2>/dev/null || sudo systemctl start redis-server 2>/dev/null', { stdio: 'ignore' })
      await new Promise(r => setTimeout(r, 2000))
    } catch { warn('Could not auto-start Redis') }
  }

  const pids = readPids()

  if (!pids.backend || !isRunning(pids.backend)) {
    log('Starting backend...')
    const tsx = resolve(BACKEND, 'node_modules/tsx/dist/cli.mjs')
    const serverScript = resolve(BACKEND, 'src/server.ts')

    // Use nohup + /dev/null redirect for reliable detaching across platforms
    const cmd = `nohup node ${tsx} ${serverScript} </dev/null >/dev/null 2>&1 & echo $!`
    const pidStr = execSync(cmd, { cwd: BACKEND, encoding: 'utf-8', env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' } }).trim()
    const pid = parseInt(pidStr, 10)
    if (!isNaN(pid)) {
      pids.backend = pid
      writePids(pids)
      await new Promise(r => setTimeout(r, 3000))
      log(`Backend running (PID ${pid})`)
    } else {
      warn('Backend PID not captured, check process list')
    }
  } else {
    log(`Backend already running (PID ${pids.backend})`)
  }

  // Check backend is responding
  const healthy = await out('curl', ['-s', '--connect-timeout', '3', 'http://localhost:3000/health']).catch(() => '')
  if (healthy) log('Backend health check passed')
  else warn('Backend may still be starting...')

  // Frontend dev server (optional)
  const viteConfig = existsSync(resolve(ROOT, 'vite.config.ts')) || existsSync(resolve(ROOT, 'vite.config.js'))
  const hasFrontendMods = existsSync(resolve(ROOT, 'node_modules'))
  if (viteConfig && hasFrontendMods) {
    if (!pids.frontend || !isRunning(pids.frontend)) {
      log('Starting frontend dev server...')
      const pm = detectPM(ROOT)
      const cmd = `nohup ${pm} run dev -- --host 0.0.0.0 </dev/null >/dev/null 2>&1 & echo $!`
      const pidStr = execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim()
      const pid = parseInt(pidStr, 10)
      if (!isNaN(pid)) {
        pids.frontend = pid
        writePids(pids)
        log(`Frontend starting (PID ${pid})`)
      }
    } else {
      log(`Frontend already running (PID ${pids.frontend})`)
    }
  } else if (viteConfig && !hasFrontendMods) {
    warn('Frontend dependencies missing. Run ./crd build to install, or skip frontend with: ./crd start --backend-only')
  } else {
    log('No frontend Vite config found, skipping frontend')
  }

  // Read frontend port from vite config
  let frontendPort = '5173'
  try {
    const viteConfig = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf-8')
    const portMatch = viteConfig.match(/port:\s*(\d+)/)
    if (portMatch) frontendPort = portMatch[1]
  } catch {}

  log('SquidOSS is running')
  log(`  Backend:  http://localhost:3000`)
  if (pids.frontend) log(`  Frontend: http://localhost:${frontendPort}`)
}

async function stop() {
  log('Stopping...')
  const pids = readPids()
  for (const key of ['frontend', 'backend']) {
    if (pids[key]) {
      try { process.kill(pids[key], 'SIGTERM'); log(`${key} stopped`) } catch {}
    }
  }
  try { execSync('pkill -f "tsx.*server" 2>/dev/null', { stdio: 'ignore' }) } catch {}
  try { execSync('pkill -f "vite" 2>/dev/null', { stdio: 'ignore' }) } catch {}
  writePids({})
  log('Stopped')
}

async function status() {
  const pids = readPids()
  const back = pids.backend && isRunning(pids.backend)
  const front = pids.frontend && isRunning(pids.frontend)
  const pg = await out('psql', [`"${dbUrl()}"`, '-c', 'SELECT 1']).then(() => true).catch(() => false) || await out('pg_isready', ['-q']).then(() => true).catch(() => false)
  const redis = await out('redis-cli', ['ping']).then(r => r === 'PONG').catch(() => false)
  const backendResp = await out('curl', ['-s', '--connect-timeout', '2', 'http://localhost:3000/health']).catch(() => '')

  console.log(`\n=== SquidOSS Status ===`)
  console.log(`Backend:   ${back ? 'running' : 'stopped'}${backendResp ? ' (responding)' : ''}`)
  console.log(`Frontend:  ${front ? 'running' : 'stopped'}`)
  console.log(`PostgreSQL: ${pg ? 'running' : 'stopped'}`)
  console.log(`Redis:     ${redis ? 'running' : 'stopped'}\n`)
}

async function codespace() {
  log('Setting up SquidOSS for GitHub Codespaces...')
  // Install deps
  try { execSync('sudo apt-get update && sudo apt-get install -y redis-server postgresql 2>&1', { stdio: 'inherit', timeout: 120000 }) } catch {}
  // Start services
  try { execSync('sudo service redis-server start', { stdio: 'ignore' }) } catch {}
  try { execSync('sudo service postgresql start', { stdio: 'ignore' }) } catch {}
  await new Promise(r => setTimeout(r, 2000))
  // Set postgres password
  try { execSync(`sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"`, { stdio: 'ignore' }) } catch {}
  // Build and start
  await build()
  await start()
}

const CMD = process.argv[2] || 'help'
const CMDS = { build, start, stop, status, doctor, configure, codespace }

if (CMD === 'help') {
  console.log(`
SquidOSS CLI — one-command management

Usage:  ./crd <command>

Commands:
  build       Install deps, configure, run migrations
  start       Start backend + frontend
  stop        Stop all servers
  status      Show running services
  doctor      Diagnose environment
  configure   Generate .env
  codespace   Full setup for GitHub Codespaces (one-shot)
`)
} else if (CMDS[CMD]) {
  CMDS[CMD]().then(ok => { if (ok === false) process.exit(1) }).catch(e => { err(e.message); process.exit(1) })
} else {
  err(`Unknown command: ${CMD}`)
  process.exit(1)
}
