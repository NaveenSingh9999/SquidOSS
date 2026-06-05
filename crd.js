#!/usr/bin/env node
import { spawn, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs'
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
    const c = spawn(program, args, { cwd, stdio: 'inherit' })
    c.on('close', code => r(code ?? 0))
    c.on('error', () => r(1))
  })
}

async function run(cmd, cwd = ROOT) {
  return new Promise(r => {
    const c = spawn('sh', ['-c', cmd], { cwd, stdio: 'inherit' })
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
  if (os.includes('debian') || os.includes('ubuntu') || os === 'linux') return 'sudo apt-get install -y'
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
    else if (getOS() === 'macos') { await run('brew install node') }
    else if (getPlatform() === 'windows') {
      try { await run('winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements') }
      catch { try { await run('choco install nodejs-lts -y') }
      catch { warn('Install Node.js from https://nodejs.org') } }
    }
    else warn('Install Node.js manually: https://nodejs.org')
  }

  // Check PostgreSQL
  try {
    execSync('psql --version', { stdio: 'ignore' })
    log('PostgreSQL found')
  } catch {
    if (getPlatform() === 'windows') {
      try { await run('winget install PostgreSQL.PostgreSQL.16 --silent --accept-package-agreements') }
      catch { try { await run('choco install postgresql16 -y') }
      catch { warn('Install PostgreSQL from https://postgresql.org/download/windows/') } }
    } else if (pm) {
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
    if (getPlatform() === 'windows') {
      try { await run('winget install Memurai.Memurai --silent --accept-package-agreements') }
      catch { try { await run('choco install redis-64 -y') }
      catch { warn('Install Redis from https://github.com/microsoftarchive/redis/releases') } }
    } else if (pm) {
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
  const os = getOS()
  const dbUrl = os === 'termux'
    ? 'postgres://localhost:5432/squidoss'
    : 'postgres://postgres:postgres@localhost:5432/squidoss'
  config = config.replace(/DATABASE_URL=.*/, `DATABASE_URL=${dbUrl}`)
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
  const platform = getPlatform()
  const methods = []
  if (os === 'termux') {
    methods.push(
      () => execSync(`psql -d squidoss -c "${sql.replace(/"/g, '\\"')}"`, { ...opts, stdio: 'ignore', timeout: 15000 }),
      () => execSync(`psql -d postgres -c "${sql.replace(/"/g, '\\"')}"`, { ...opts, stdio: 'ignore', timeout: 15000 }),
      () => execSync(`psql -c "${sql.replace(/"/g, '\\"')}"`, { ...opts, stdio: 'ignore', timeout: 15000 }),
    )
  }
  if (platform === 'windows') {
    methods.push(
      () => execSync(`psql -U postgres -c "${sql.replace(/"/g, '\\"')}" 2>nul`, { ...opts, stdio: 'ignore', timeout: 15000 }),
      () => execSync(`psql -c "${sql.replace(/"/g, '\\"')}" 2>nul`, { ...opts, stdio: 'ignore', timeout: 15000 }),
    )
  }
  methods.push(
    // 1. TCP with password (no sudo, works if pg_hba.conf allows md5/scram)
    () => execSync(`psql -h localhost -U postgres -c "${sql.replace(/"/g, '\\"')}"`, { ...opts, timeout: 15000, env: { ...process.env, PGPASSWORD: 'postgres' } }),
    // 2. Peer auth as postgres via Unix socket (works if pg_hba.conf has trust/local)
    () => execSync(`psql -U postgres -c "${sql.replace(/"/g, '\\"')}"`, { ...opts, timeout: 15000 }),
    // 3. Sudo to postgres user + peer auth (works if PG running, `sudo` available)
    () => execSync(`sudo -u postgres psql -c "${sql.replace(/"/g, '\\"')}"`, { ...opts, timeout: 15000 }),
  )
  for (const m of methods) {
    try { return m() }
    catch (e) {
      const msg = (e.stderr?.toString().trim() || e.message || '').split('\n')[0]
      if (msg) log(`pg attempt: ${msg}`)
      // If psql connected but SQL failed (ERROR:), re-throw immediately
      if (msg.startsWith('ERROR:')) throw e
    }
  }
  throw new Error('Could not run psql — is PostgreSQL installed?')
}

function pgFile(file) {
  const os = getOS()
  const platform = getPlatform()
  if (os === 'termux') {
    const methods = [
      () => execSync(`psql -d squidoss -f "${file}"`, { stdio: 'inherit', timeout: 180000 }),
      () => execSync(`psql -d postgres -f "${file}"`, { stdio: 'inherit', timeout: 180000 }),
    ]
    for (const m of methods) { try { return m() } catch {} }
    throw new Error('Could not run psql')
  }
  if (platform === 'windows') {
    const methods = [
      () => execSync(`psql -U postgres -d squidoss -f "${file}"`, { stdio: 'inherit', timeout: 180000 }),
      () => execSync(`psql -d squidoss -f "${file}"`, { stdio: 'inherit', timeout: 180000 }),
    ]
    for (const m of methods) { try { return m() } catch {} }
    throw new Error('Could not run psql migration')
  }
  const methods = [
    // 1. TCP with password (no sudo)
    () => execSync(`PGPASSWORD=postgres psql -h localhost -U postgres -d squidoss -f "${file}"`, { stdio: 'inherit', timeout: 180000 }),
    // 2. Peer auth as postgres via Unix socket
    () => execSync(`psql -U postgres -d squidoss -f "${file}"`, { stdio: 'inherit', timeout: 180000 }),
    // 3. Sudo to postgres user
    () => execSync(`sudo -u postgres psql -d squidoss -f "${file}"`, { stdio: 'inherit', timeout: 180000 }),
  ]
  for (const m of methods) {
    try { return m() }
    catch (e) {
      const msg = (e.stderr?.toString().trim() || e.message || '').split('\n')[0]
      if (msg) log(`pgFile attempt: ${msg}`)
      if (msg.startsWith('ERROR:')) throw e
    }
  }
  throw new Error('Could not run psql')
}

async function startPostgres() {
  const platform = getPlatform()
  const os = getOS()
  try {
    if (platform === 'windows') {
      try { await run('net start postgresql-x64-16 2>nul || net start postgresql-x64-15 2>nul || net start postgresql 2>nul') }
      catch { await run('pg_ctl start -D "C:\\Program Files\\PostgreSQL\\16\\data" 2>nul || pg_ctl start -D "%PGDATA%" 2>nul') }
      await new Promise(r => setTimeout(r, 3000))
    } else if (os === 'termux') {
      const pgDir = `${process.env.PREFIX || '/data/data/com.termux/files/usr'}/var/lib/postgresql`
      if (!existsSync(`${pgDir}/PG_VERSION`)) {
        await run(`initdb -D "${pgDir}" 2>/dev/null || pg_ctl initdb -D "${pgDir}" 2>/dev/null || true`)
      }
      await run(`pg_ctl -D "${pgDir}" start -l "${pgDir}/logfile" 2>/dev/null || true`)
      await new Promise(r => setTimeout(r, 3000))
    } else {
      log('Starting PostgreSQL...')
      await run('sudo service postgresql start 2>/dev/null || sudo pg_ctlcluster 16 main start 2>/dev/null || sudo pg_ctlcluster 15 main start 2>/dev/null || sudo pg_ctlcluster 14 main start 2>/dev/null || true')
      await new Promise(r => setTimeout(r, 3000))
    }
  } catch {}
}

async function startRedis() {
  try {
    const pong = await out('redis-cli ping').catch(() => '')
    if (pong === 'PONG') return
    const platform = getPlatform()
    if (platform === 'windows') {
      await run('net start redis 2>nul || net start memurai 2>nul || redis-server --service-start 2>nul || start /B redis-server 2>nul')
      await new Promise(r => setTimeout(r, 3000))
    } else {
      await run('redis-server --daemonize yes 2>/dev/null || sudo service redis-server start 2>/dev/null || sudo systemctl start redis-server 2>/dev/null || redis-cli 2>/dev/null || true')
      await new Promise(r => setTimeout(r, 2000))
    }
  } catch {}
}

async function setupDatabase() {
  log('Setting up database...')
  await startPostgres()
  const platform = getPlatform()
  const os = getOS()

  // If on Linux (not termux/windows), try to set trust auth in pg_hba.conf
  // before attempting any pg() calls. This works around Codespace sudo restrictions
  // where `sudo -u postgres psql` is blocked but `sudo` to root is available.
  if (os !== 'termux' && platform !== 'windows') {
    try {
      const hba = execSync('find /etc/postgresql -name pg_hba.conf 2>/dev/null | head -1', { encoding: 'utf-8' }).trim()
      if (hba) {
        log(`Found pg_hba.conf at ${hba}, setting trust auth...`)
        for (const cmd of [
          `sed -i 's/local\\s\\+all\\s\\+all\\s\\+peer/local   all             all                                     trust/' "${hba}"`,
          `sed -i 's/host\\s\\+all\\s\\+all\\s\\+127.0.0.1\\/32\\s\\+scram-sha-256/host    all             all             127.0.0.1\\/32            trust/' "${hba}"`,
          `sed -i 's/host\\s\\+all\\s\\+all\\s\\+::1\\/128\\s\\+scram-sha-256/host    all             all             ::1\\/128                 trust/' "${hba}"`,
        ]) {
          const sudoCmd = `sudo sh -c "${cmd.replace(/"/g, '\\"')}"`
          try { execSync(sudoCmd, { stdio: 'pipe' }); log('pg_hba trust set via sudo') } catch (e) {
            try { execSync(cmd, { stdio: 'pipe' }); log('pg_hba trust set directly') } catch {}
          }
        }
        try { execSync('sudo pg_ctlcluster 16 main reload 2>/dev/null || sudo pg_ctlcluster 14 main reload 2>/dev/null || sudo service postgresql reload 2>/dev/null || true', { stdio: 'pipe' }) } catch {}
        await new Promise(r => setTimeout(r, 2000))
      } else {
        log('pg_hba.conf not found, skipping trust setup')
      }
    } catch (e) { log(`pg_hba.conf setup skipped: ${e.message}`) }
  }

  if (os === 'termux') {
    pg('CREATE DATABASE squidoss')
  } else if (platform === 'windows') {
    pg(`CREATE DATABASE squidoss`)
  } else {
    pg(`ALTER USER postgres PASSWORD 'postgres'`)
    try { pg(`CREATE DATABASE squidoss OWNER postgres`) } catch (e) {
      const msg = (e.stderr?.toString().trim() || e.message || '')
      if (msg.includes('already exists')) log('Database already exists')
      else throw e
    }
  }
}

async function migrate() {
  const MIGRATIONS_DIR = resolve(BACKEND, 'migrations')
  if (!existsSync(MIGRATIONS_DIR)) { log('No migrations directory found'); return }
  await startPostgres()
  await setupDatabase()

  const sqlFiles = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  if (sqlFiles.length === 0) { log('No migration files found'); return }

  log(`Running ${sqlFiles.length} migration(s)...`)

  // Drop tables created by init to avoid conflicts (only on first migration)
  const firstFile = sqlFiles[0]
  if (firstFile.startsWith('001_')) {
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
  }

  for (const file of sqlFiles) {
    const filePath = resolve(MIGRATIONS_DIR, file)
    try {
      pgFile(filePath)
      log(`  ✓ ${file}`)
    } catch (e) {
      if (file !== firstFile) {
        warn(`  ⚠ ${file}: ${e.message}`)
      } else {
        warn(`  ✗ ${file}: ${e.message}`)
      }
    }
  }
  log('Migration complete')
}

// ── Build Native Module ──────────────────────────────────────
async function buildNative() {
  const nativeDir = resolve(BACKEND, 'build/Release')
  const nativeFile = resolve(nativeDir, 'local_storage.node')
  const sourceFile = resolve(BACKEND, 'src/native/local_storage.c')
  if (!existsSync(sourceFile)) { log('No C module source found, skipping native build'); return }
  if (existsSync(nativeFile)) {
    const srcMtime = statSync(sourceFile).mtimeMs
    const outMtime = statSync(nativeFile).mtimeMs
    if (outMtime > srcMtime) { log('Native module up to date'); return }
  }
  log('Building native C module...')
  if (!existsSync(resolve(BACKEND, 'build'))) mkdirSync(resolve(BACKEND, 'build'), { recursive: true })
  const nodeInclude = resolve(process.execPath, '..', 'include')
  const cc = process.env.CC || process.platform === 'win32' ? 'cl.exe' : 'gcc'
  const outFlag = process.platform === 'win32' ? '/Fe:' : '-o '
  const incFlag = process.platform === 'win32' ? '/I' : '-I'
  const compileFlags = process.platform === 'win32'
    ? `${incFlag}"${nodeInclude}" /LD /nologo`
    : `-fPIC -shared ${incFlag}"${nodeInclude}" -I"${nodeInclude}/node"`
  const src = `"${sourceFile}"`
  const out = `"${nativeFile}"`
  const ext = process.platform === 'win32' ? '.obj' : '.o'
  const obj = `"${resolve(BACKEND, 'build', 'local_storage' + ext)}"`
  try {
    if (process.platform === 'win32') {
      await run(`${cc} ${compileFlags} ${src} ${outFlag}${out}`, BACKEND)
    } else {
      await run(`${cc} ${compileFlags} ${src} -o ${out}`, BACKEND)
    }
    if (existsSync(nativeFile)) log(`  ✓ local_storage.node (${(statSync(nativeFile).size / 1024).toFixed(1)} KB)`)
    else { warn('  ✗ native build output not found'); return }
  } catch (e) {
    warn(`  ✗ gcc not available — using JS fallback (${e.message})`)
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
  await buildNative()
  log('Build complete')
}

// ── Start ────────────────────────────────────────────────────
async function start() {
  if (!existsSync(ENV_FILE)) await configure()
  if (!existsSync(resolve(BACKEND, 'node_modules'))) { warn('Run ./crd build first'); return }
  await buildNative()

  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })

  await startPostgres()
  await startRedis()

  const pids = readPids()
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  if (!pids.backend || !isRunning(pids.backend)) {
    log('Starting backend...')
    const tsx = resolve(BACKEND, 'node_modules/.bin/tsx')
    if (!existsSync(tsx)) { warn('tsx not found'); return }

    const platform = getPlatform()
    let pid
    if (platform === 'windows') {
      const logFile = LOG_BACKEND.replace(/\//g, '\\')
      const script = resolve(BACKEND, 'src/server.ts')
      // Use PowerShell to start in background
      execSync(`powershell -NoProfile -Command "Start-Process -NoNewWindow -FilePath 'node' -ArgumentList '${tsx}','${script}' -RedirectStandardOutput '${logFile}' -RedirectStandardError '${logFile}' -PassThru | Select-Object -ExpandProperty Id"`, {
        cwd: BACKEND, encoding: 'utf-8', env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' }, timeout: 10000,
      })
      // Try to get PID via WMI
      try {
        const out = execSync(`powershell -NoProfile -Command "Get-WmiObject Win32_Process -Filter \\"CommandLine like '%tsx%server%'\\" | Select-Object -First 1 -ExpandProperty ProcessId"`, { encoding: 'utf-8', timeout: 5000 }).trim()
        pid = parseInt(out, 10)
      } catch { pid = NaN }
    } else {
      const cmd = `nohup ${tsx} ${resolve(BACKEND, 'src/server.ts')} </dev/null >>"${LOG_BACKEND}" 2>&1 & echo $!`
      const pidStr = execSync(cmd, { cwd: BACKEND, encoding: 'utf-8', env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' } }).trim()
      pid = parseInt(pidStr, 10)
    }
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
      const platform = getPlatform()
      let pid
      if (platform === 'windows') {
        execSync(`powershell -NoProfile -Command "Start-Process -NoNewWindow -FilePath '${pm}' -ArgumentList 'run','dev','--','--host','0.0.0.0' -RedirectStandardOutput '${LOG_FRONTEND.replace(/\//g, '\\')}' -RedirectStandardError '${LOG_FRONTEND.replace(/\//g, '\\')}'"`, { cwd: ROOT, timeout: 10000 })
        try {
          const out = execSync(`powershell -NoProfile -Command "Get-WmiObject Win32_Process -Filter \\"CommandLine like '%vite%'\\" | Select-Object -First 1 -ExpandProperty ProcessId"`, { encoding: 'utf-8', timeout: 5000 }).trim()
          pid = parseInt(out, 10)
        } catch { pid = NaN }
      } else {
        const cmd = `nohup ${pm} run dev -- --host 0.0.0.0 </dev/null >>"${LOG_FRONTEND}" 2>&1 & echo $!`
        const pidStr = execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim()
        pid = parseInt(pidStr, 10)
      }
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
  const platform = getPlatform()
  for (const key of ['frontend', 'backend']) {
    if (pids[key]) { try { process.kill(pids[key], 'SIGTERM') } catch {} }
  }
  // Kill any orphaned processes
  if (platform === 'windows') {
    try { execSync('taskkill /F /IM node.exe 2>nul', { stdio: 'ignore' }) } catch {}
  } else {
    try { execSync('pkill -f "tsx.*server" 2>/dev/null; pkill -f "vite" 2>/dev/null', { stdio: 'ignore' }) } catch {}
  }
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

// ── Ensure Node.js is installed ──────────────────────────────
async function ensureNode() {
  const tryNode = (cmd) => {
    try { execSync(`${cmd} --version`, { stdio: 'ignore' }); return cmd }
    catch { return null }
  }
  let found = tryNode('node') || tryNode('nodejs')
  if (found) return found

  const os = getOS()
  const platform = getPlatform()
  warn('Node.js not found — attempting installation...')

  if (platform === 'windows') {
    // Use winget (Win 10+), fall back to downloading MSI
    try {
      log('Trying winget...')
      execSync('winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements', { stdio: 'inherit', timeout: 120000 })
    } catch {
      try {
        log('Trying chocolatey...')
        execSync('choco install nodejs-lts -y', { stdio: 'inherit', timeout: 120000 })
      } catch {
        log('Downloading Node.js installer...')
        const url = 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi'
        const msi = resolve(ROOT, 'node-install.msi')
        try {
          const curl = execSync('where curl', { encoding: 'utf-8', stdio: 'pipe' }).trim()
          execSync(`"${curl}" -fsSL "${url}" -o "${msi}"`, { stdio: 'inherit', timeout: 120000 })
        } catch {
          try {
            const powershell = execSync('where powershell', { encoding: 'utf-8', stdio: 'pipe' }).trim()
            execSync(`"${powershell}" -NoProfile -Command "Invoke-WebRequest -Uri '${url}' -OutFile '${msi}'"`, { stdio: 'inherit', timeout: 120000 })
          } catch {
            err('Download failed — install Node.js from https://nodejs.org')
            return null
          }
        }
        try {
          execSync(`msiexec /i "${msi}" /quiet /norestart`, { stdio: 'inherit', timeout: 180000 })
        } catch {
          err('MSI install failed — run it manually from SquidOSS folder')
          return null
        } finally {
          try { execSync(`del "${msi}"`, { stdio: 'ignore' }) } catch {}
        }
      }
    }
  } else if (os === 'macos') {
    if (!tryNode('brew')) {
      log('Installing Homebrew...')
      try {
        execSync('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"', { stdio: 'inherit', timeout: 300000 })
      } catch {
        err('Homebrew install failed — install Node.js from https://nodejs.org')
        return null
      }
    }
    try {
      execSync('brew install node', { stdio: 'inherit', timeout: 180000 })
    } catch {
      err('brew install node failed'); return null
    }
  } else if (os === 'termux') {
    try {
      execSync('pkg install -y nodejs-lts', { stdio: 'inherit', timeout: 120000 })
    } catch {
      err('pkg install nodejs-lts failed'); return null
    }
  } else {
    // Linux — try package manager
    let installed = false
    for (const [check, installCmd] of [
      ['apt-get --version', 'apt-get install -y nodejs npm'],
      ['pacman --version', 'pacman -S --noconfirm nodejs npm'],
      ['dnf --version', 'dnf install -y nodejs npm'],
      ['yum --version', 'yum install -y nodejs npm'],
      ['apk --version', 'apk add nodejs npm'],
    ]) {
      try {
        execSync(check, { stdio: 'ignore' })
        log(`Installing via ${installCmd.split(' ')[0]}...`)
        execSync(`sudo ${installCmd}`, { stdio: 'inherit', timeout: 180000 })
        installed = true
        break
      } catch {}
    }
    if (!installed) {
      // Try NodeSource as last resort
      try {
        execSync('curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -', { stdio: 'inherit', timeout: 60000 })
        execSync('sudo apt-get install -y nodejs', { stdio: 'inherit', timeout: 120000 })
        installed = true
      } catch {
        err('Could not install Node.js — go to https://nodejs.org')
        return null
      }
    }
  }

  // Re-check after install
  found = tryNode('node') || tryNode('nodejs')
  if (found) {
    log(`Node.js installed successfully (${execSync(`${found} --version`, { encoding: 'utf-8' }).trim()})`)
    return found
  }
  err('Node.js install completed but command not found — restart your terminal')
  return null
}

// ── Launcher ─────────────────────────────────────────────────
async function launcher() {
  const platform = getPlatform()
  log(`Creating launcher for ${platform}...`)

  // ── Validate prerequisites ──────────────────────────────────
  if (!existsSync(resolve(BACKEND, '.env'))) {
    warn('.env not found — run `./crd configure` first')
    return false
  }
  let nodeCmd = await ensureNode()
  if (!nodeCmd) { warn('Node.js required — launcher aborted'); return false }

  // ── Logo: convert favicon to platform-native format ─────────
  // macOS: .png works in plist (no .icns needed for modern macOS)
  // Linux: .png
  // Windows: .ico stays as-is
  const favicon = resolve(ROOT, 'public/favicon.ico')
  const placeholder = resolve(ROOT, 'public/placeholder.svg')
  let logoPng = favicon // default fallback
  if (!existsSync(favicon)) {
    logoPng = placeholder
    warn('No public/favicon.ico found — using placeholder')
  }
  // For platforms needing PNG, try to convert if possible
  const hasConvert = (() => { try { execSync('convert --version', { stdio: 'ignore' }); return true } catch { return false } })()

  if (platform === 'macos') {
    // ── Determine writable Applications dir ───────────────────
    let appDir = resolve('/Applications', 'SquidOSS.app')
    try {
      mkdirSync(resolve(appDir, 'Contents'), { recursive: true })
    } catch {
      warn('/Applications is not writable — falling back to ~/Applications')
      appDir = resolve(process.env.HOME || '/tmp', 'Applications', 'SquidOSS.app')
      try { mkdirSync(resolve(appDir, 'Contents'), { recursive: true }) }
      catch (e) { err(`Cannot create app bundle at ${appDir}: ${e.message}`); return false }
    }

    const contentsDir = resolve(appDir, 'Contents')
    const macosDir = resolve(contentsDir, 'MacOS')
    const resourcesDir = resolve(contentsDir, 'Resources')
    mkdirSync(macosDir, { recursive: true })
    mkdirSync(resourcesDir, { recursive: true })

    // ── Launcher script ───────────────────────────────────────
    const launcherScript = `#!/bin/bash
set -e
cd "${ROOT}" 2>/dev/null || { echo "Project directory not found at ${ROOT}"; exit 1; }
open http://localhost:5173 2>/dev/null || echo "Could not launch browser"
echo "Starting SquidOSS services..."
"${ROOT}/crd" start 2>&1 || { echo "crd start failed — check logs"; exit 1; }
echo ""
echo "SquidOSS running at http://localhost:5173"
echo "Press Ctrl+C to stop all services."
trap "${ROOT}/crd stop 2>/dev/null; exit 0" INT TERM
# Tail backend logs so user sees output
tail -f "${ROOT}/.crd-logs/backend.log" 2>/dev/null || read -r
`
    writeFileSync(resolve(macosDir, 'SquidOSS'), launcherScript)
    execSync(`chmod +x "${resolve(macosDir, 'SquidOSS')}"`)
    if (!existsSync(resolve(macosDir, 'SquidOSS'))) { err('Failed to write launcher script'); return false }

    // ── Info.plist ────────────────────────────────────────────
    // macOS accepts .png icons in modern versions; use favicon or placeholder
    let iconName = 'icon'
    const iconDest = resolve(resourcesDir, 'icon.png')
    const iconSrc = hasConvert
      ? (execSync(`convert "${logoPng}" -resize 256x256 "${iconDest}"`, { stdio: 'pipe' }), iconDest)
      : logoPng
    if (!existsSync(iconDest) && iconSrc !== iconDest) copyFileSync(logoPng, iconDest)

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
  <key>LSMinimumSystemVersion</key><string>10.15</string>
</dict>
</plist>`
    writeFileSync(resolve(contentsDir, 'Info.plist'), plist)
    log(`Created macOS app: ${appDir}`)
    log(`  Open with: open "${appDir}"`)

  } else if (platform === 'windows') {
    // ── Create crd.cmd wrapper so `crd` works on Windows ──────
    const cmdWrapper = `@echo off
node "%~dp0crd.js" %*
`
    writeFileSync(resolve(ROOT, 'crd.cmd'), cmdWrapper)
    log('Created crd.cmd wrapper')

    // ── Verify node is in PATH ────────────────────────────────
    try { execSync('node --version', { stdio: 'pipe' }) }
    catch { warn('node not found in PATH — launcher scripts may fail'); return false }

    // ── Create start-squidoss.bat ─────────────────────────────
    const batLauncher = `@echo off
cd /d "${ROOT}" 2>nul || ( echo Project directory not found & pause & exit /b 1 )
start "" "http://localhost:5173"
echo Starting SquidOSS backend...
start "SquidOSS Backend" cmd /c "node \"${ROOT}\\crd.js\" logs backend"
node "${ROOT}\\crd.js" start
if %errorlevel% neq 0 ( echo crd start failed — check output above & pause & exit /b 1 )
echo.
echo SquidOSS running at http://localhost:5173
echo Close this window to stop all services.
pause >nul
node "${ROOT}\\crd.js" stop
`
    writeFileSync(resolve(ROOT, 'start-squidoss.bat'), batLauncher)
    log('Created start-squidoss.bat')

    // ── Create PowerShell .ps1 launcher ───────────────────────
    const psLauncher = `$ErrorActionPreference = "Stop"
$ROOT = "${ROOT}"
if (!(Test-Path $ROOT)) { Write-Host "Project directory not found: $ROOT" -Foreground Red; Read-Host "Press Enter"; exit 1 }
try { node --version | Out-Null } catch { Write-Host "Node.js not found in PATH" -Foreground Red; Read-Host "Press Enter"; exit 1 }
Start-Process "http://localhost:5173"
Write-Host "Starting SquidOSS..."
Start-Process powershell -ArgumentList "-NoExit -Command cd '$ROOT'; node '$ROOT\\crd.js' logs backend" -WindowStyle Normal
Set-Location $ROOT
node "$ROOT\\crd.js" start
if ($LASTEXITCODE -ne 0) { Write-Host "crd start failed" -Foreground Red; Read-Host "Press Enter"; exit 1 }
Write-Host "SquidOSS running at http://localhost:5173"
Write-Host "Press any key to stop..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
node "$ROOT\\crd.js" stop
`
    writeFileSync(resolve(ROOT, 'start-squidoss.ps1'), psLauncher)
    log('Created start-squidoss.ps1')

    // ── Create .lnk desktop shortcut via PowerShell ───────────
    log('Creating desktop shortcut (SquidOSS)...')
    const homeDir = process.env.USERPROFILE || process.env.HOMEDRIVE + process.env.HOMEPATH || '.'
    try {
      execSync(`powershell -NoProfile -Command "
        $$wshell = New-Object -ComObject WScript.Shell
        $$shortcut = $$wshell.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\\SquidOSS.lnk')
        $$shortcut.TargetPath = '${resolve(ROOT, 'start-squidoss.bat')}'
        $$shortcut.WorkingDirectory = '${ROOT}'
        $$shortcut.Description = 'SquidOSS Self-Hosted File Storage'
        $$shortcut.IconLocation = '${logoPng}'
        $$shortcut.Save()
        if (Test-Path ([Environment]::GetFolderPath('Desktop') + '\\SquidOSS.lnk')) { exit 0 } else { exit 1 }
      "`, { stdio: 'pipe', timeout: 15000 })
      log('Desktop shortcut created')
    } catch {
      warn('Could not create .lnk shortcut — PowerShell may be restricted')
      warn('  Double-click start-squidoss.bat instead')
    }

  } else if (platform === 'linux') {
    // ── Termux check (no desktop environment) ─────────────────
    const os = getOS()
    if (os === 'termux') {
      const termuxLauncher = `#!/data/data/com.termux/files/usr/bin/bash
cd "${ROOT}" 2>/dev/null || { echo "Project not found at ${ROOT}"; exit 1; }
echo "Starting SquidOSS..."
echo "Backend: http://localhost:3000"
echo "Frontend: http://localhost:5173"
"${ROOT}/crd" start
echo ""
echo "Press Enter to stop..."
read -r _
"${ROOT}/crd" stop
`
      const launcherPath = resolve(ROOT, 'start-squidoss.sh')
      writeFileSync(launcherPath, termuxLauncher)
      execSync(`chmod +x "${launcherPath}"`)
      log('Created start-squidoss.sh (Termux)')
      log('  Run with: bash start-squidoss.sh')
      return
    }

    // ── Detect desktop environment ────────────────────────────
    const xdgDesktop = await out('echo "$XDG_CURRENT_DESKTOP"').catch(() => '')
    const hasDisplay = await out('echo "$DISPLAY"').catch(() => '')
    const hasWayland = await out('echo "$WAYLAND_DISPLAY"').catch(() => '')
    if (!xdgDesktop && !hasDisplay && !hasWayland) {
      warn('No desktop environment detected — skipping .desktop shortcut')
      const shLauncher = `#!/bin/sh
cd "${ROOT}" 2>/dev/null || { echo "Project not found at ${ROOT}"; exit 1; }
echo "Starting SquidOSS..."
echo "Backend: http://localhost:3000"
echo "Frontend: http://localhost:5173"
"${ROOT}/crd" start
echo ""
echo "Press Enter to stop..."
read -r _
"${ROOT}/crd" stop
`
      writeFileSync(resolve(ROOT, 'start-squidoss.sh'), shLauncher)
      execSync(`chmod +x "${resolve(ROOT, 'start-squidoss.sh')}"`)
      log('Created start-squidoss.sh fallback launcher')
      return
    }

    // ── Convert favicon to PNG for Linux DE compatibility ─────
    let iconPath = logoPng
    if (logoPng.endsWith('.ico') && hasConvert) {
      const pngPath = resolve(ROOT, '.crd-icon.png')
      try {
        execSync(`convert "${logoPng}" -resize 256x256 "${pngPath}"`, { stdio: 'pipe' })
        if (existsSync(pngPath)) iconPath = pngPath
      } catch { warn('ImageMagick convert failed — using raw icon file') }
    } else if (logoPng.endsWith('.svg')) {
      iconPath = logoPng // SVG works on modern Linux DEs
    }

    // ── Determine XDG data & desktop paths ────────────────────
    const home = process.env.HOME || process.env.HOMEPATH || '/tmp'
    const xdgDataHome = process.env.XDG_DATA_HOME || resolve(home, '.local/share')
    const applicationsDir = resolve(xdgDataHome, 'applications')
    const desktopDir = resolve(home, 'Desktop')
    mkdirSync(applicationsDir, { recursive: true })

    const desktopFile = `[Desktop Entry]
Version=1.0
Type=Application
Name=SquidOSS
Comment=SquidOSS Self-Hosted File Storage
Exec=sh -c '"${ROOT}/crd" start && xdg-open http://localhost:5173'
Icon=${iconPath}
Terminal=true
Categories=Utility;FileTools;Network;
StartupNotify=true
StartupWMClass=SquidOSS
`

    // ── Write to applications dir (app menu) ──────────────────
    const menuPath = resolve(applicationsDir, 'squidoss.desktop')
    writeFileSync(menuPath, desktopFile)
    execSync(`chmod +x "${menuPath}"`)
    if (!existsSync(menuPath)) { err('Failed to write .desktop file'); return false }
    log(`Created app-menu entry: ${menuPath}`)

    // ── Copy to Desktop if it exists ──────────────────────────
    if (existsSync(desktopDir)) {
      const desktopPath = resolve(desktopDir, 'squidoss.desktop')
      try {
        writeFileSync(desktopPath, desktopFile)
        execSync(`chmod +x "${desktopPath}"`)
        log(`Created desktop icon: ${desktopPath}`)
      } catch (e) {
        warn(`Could not write to Desktop (${e.message}) — app-menu entry created instead`)
      }
    } else {
      warn(`No ~/Desktop directory found — icon only in app menu`)
    }
  } else {
    err(`Unsupported platform: ${platform}`)
    return false
  }

  log('Launcher created successfully')
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
