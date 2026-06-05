import Fastify from 'fastify'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { sql } from '../db/index.js'
import { createHash } from 'node:crypto'
import { spawnDbInstance, destroyDbInstance, executeSql, listDbInstances } from './db-saas.js'
import { fls } from './fls.js'
import { kzaAuditUser } from './kza-audit.js'

let server: ReturnType<typeof Fastify> | null = null
let activePort: number = 0

function hashCbisKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export async function startHiddenServer(port: number) {
  if (server) {
    await server.close()
  }

  server = Fastify({
    logger: false,
    bodyLimit: 10 * 1024 * 1024,
  })

  server.addHook('onRequest', async (request: any, reply: any) => {
    const url = request.url
    const match = url.match(/^\/fstf\/ec\/([^/]+)(?:\/(.+))?$/)
    if (!match) {
      return reply.status(404).send({ error: 'Not found' })
    }

    const cbisKey = match[1]
    const subPath = match[2] || ''

    const keyHash = hashCbisKey(cbisKey)
    const [key] = await sql`
      SELECT c.user_id, u.role FROM cbis_keys c
      JOIN auth.users u ON u.id = c.user_id
      WHERE c.key_hash = ${keyHash}
    `
    if (!key) {
      return reply.status(403).send({ error: 'Invalid CBIS key' })
    }

    const user = key as any
    ;(request as any).cbisUserId = user.user_id
    ;(request as any).cbisRole = user.role
    ;(request as any).cbisSubPath = subPath

    await sql`UPDATE cbis_keys SET last_used_at = NOW() WHERE key_hash = ${keyHash}`
  })

  server.get('/fstf/ec/:cbisKey', async (request: any, reply: any) => {
    const subPath = request.cbisSubPath || ''
    if (subPath === '' || subPath === 'otdb') {
      return servePanel(request, reply)
    }
    return reply.status(404).send({ error: 'Not found' })
  })

  server.get('/fstf/ec/:cbisKey/otdb', async (request: any, reply: any) => {
    return servePanel(request, reply)
  })

  async function servePanel(request: any, reply: any) {
    const userId = request.cbisUserId
    const role = request.cbisRole
    const isSudo = role === 'sudo'

    const instances = await listDbInstances(userId)

    const kza = await kzaAuditUser(userId, 'Hidden panel access')

    const html = buildPanelHtml(userId, isSudo, instances, kza, port)
    reply.header('Content-Type', 'text/html; charset=utf-8')
    return reply.send(html)
  }

  server.get('/fstf/ec/:cbisKey/otdb/api/instances', async (request: any, reply: any) => {
    const userId = request.cbisUserId
    const instances = await listDbInstances(userId)
    return { success: true, instances }
  })

  server.post('/fstf/ec/:cbisKey/otdb/api/spawn', async (request: any, reply: any) => {
    const userId = request.cbisUserId
    const { name } = request.body as any
    if (!name) return reply.status(400).send({ error: 'Instance name required' })

    try {
      const instance = await spawnDbInstance(userId, name)
      return { success: true, instance, message: 'Instance spawning. Wait 20-25s for ready.' }
    } catch (e: any) {
      return reply.status(500).send({ error: e.message })
    }
  })

  server.post('/fstf/ec/:cbisKey/otdb/api/destroy', async (request: any, reply: any) => {
    const userId = request.cbisUserId
    const { instanceId } = request.body as any
    if (!instanceId) return reply.status(400).send({ error: 'Instance ID required' })

    try {
      await destroyDbInstance(instanceId, userId)
      return { success: true, message: 'Instance destroyed' }
    } catch (e: any) {
      return reply.status(500).send({ error: e.message })
    }
  })

  server.post('/fstf/ec/:cbisKey/otdb/api/execute-sql', async (request: any, reply: any) => {
    const userId = request.cbisUserId
    const { instanceId, query } = request.body as any
    if (!instanceId || !query) return reply.status(400).send({ error: 'instanceId and query required' })

    try {
      const result = await executeSql(instanceId, userId, query)
      return { success: true, rows: result, rowCount: Array.isArray(result) ? result.length : 0 }
    } catch (e: any) {
      return reply.status(500).send({ error: e.message })
    }
  })

  server.get('/fstf/ec/:cbisKey/otdb/api/fls/events', async (request: any, reply: any) => {
    const userId = request.cbisUserId
    const { channel } = request.query as any
    if (!channel) return reply.status(400).send({ error: 'channel query param required' })

    const events = await fls.getChannelEvents(channel)
    return { success: true, events }
  })

  server.get('/fstf/ec/:cbisKey/otdb/api/kza/status', async (request: any, reply: any) => {
    const userId = request.cbisUserId
    const audit = await kzaAuditUser(userId, 'KZA status check')
    return { success: true, audit }
  })

  try {
    await server.listen({ port, host: '127.0.0.1' })
    activePort = port
    console.log(`[FSTF] Hidden server running on 127.0.0.1:${port} (external nmap invisible)`)
    return port
  } catch (e: any) {
    console.error(`[FSTF] Failed to start hidden server: ${e.message}`)
    server = null
    return null
  }
}

export function getActivePort(): number {
  return activePort
}

export function buildPanelHtml(userId: string, isSudo: boolean, instances: any[], kza: any, port: number): string {
  const instanceRows = instances.map((i: any) => `
    <tr>
      <td class="px-4 py-3 text-sm truncate max-w-[150px]">${escapeHtml(i.name)}</td>
      <td class="px-4 py-3"><span class="status-${i.status}">${i.status}</span></td>
      <td class="px-4 py-3 text-sm text-muted">${escapeHtml(i.db_name)}</td>
      <td class="px-4 py-3 text-sm font-mono text-muted">${i.port}</td>
      <td class="px-4 py-3 text-sm text-muted">${new Date(i.created_at).toLocaleString()}</td>
      <td class="px-4 py-3">
        <div class="flex gap-1">
          <button class="btn-ghost text-xs" onclick="showSql('${i.id}')">SQL</button>
          <button class="btn-ghost text-xs text-red-400" onclick="destroyInstance('${i.id}')">Destroy</button>
        </div>
      </td>
    </tr>
  `).join('')

  const warnBadge = kza?.warnings?.length > 0
    ? `<span class="warn-badge">${kza.warnings.length} warning${kza.warnings.length > 1 ? 's' : ''}</span>`
    : '<span class="ok-badge">All clear</span>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FSTF · DB SaaS Panel</title>
<style>
:root {
  --bg: hsl(222, 47%, 9.5%);
  --card: hsl(222, 35%, 11.5%);
  --muted: hsl(220, 20%, 17%);
  --border: hsl(217, 33%, 18%);
  --text: hsl(210, 40%, 96%);
  --text-muted: hsl(215, 16%, 56%);
  --primary: hsl(210, 40%, 60%);
  --red: hsl(0, 62%, 55%);
  --green: hsl(142, 50%, 50%);
  --amber: hsl(38, 80%, 55%);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: ui-monospace, 'SF Mono', monospace; background: var(--bg); color: var(--text); font-size: 14px; }
.container { max-width: 960px; margin: 0 auto; padding: 24px; }
header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
h1 { font-size: 18px; font-weight: 600; }
h2 { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
.subtitle { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 6px; border: none; font-size: 13px; cursor: pointer; background: var(--primary); color: var(--bg); font-family: inherit; }
.btn:hover { opacity: 0.85; }
.btn-ghost { background: transparent; border: 1px solid var(--border); color: var(--text); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
.btn-ghost:hover { background: var(--muted); }
.btn-danger { background: var(--red); }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--border); }
td { border-bottom: 1px solid rgba(255,255,255,0.04); }
.status-booting { color: var(--amber); }
.status-running { color: var(--green); }
.status-error { color: var(--red); }
.status-stopped { color: var(--text-muted); }
.muted { color: var(--text-muted); }
.text-muted { color: var(--text-muted); }
.text-xs { font-size: 12px; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.warn-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; font-size: 11px; background: rgba(255, 180, 0, 0.15); color: var(--amber); }
.ok-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; font-size: 11px; background: rgba(0, 200, 80, 0.15); color: var(--green); }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stat-box { background: var(--muted); border-radius: 6px; padding: 12px; text-align: center; }
.stat-val { font-size: 24px; font-weight: 700; }
.stat-label { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); align-items: center; justify-content: center; z-index: 100; }
.modal-overlay.active { display: flex; }
.modal { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 20px; width: 90%; max-width: 600px; max-height: 80vh; overflow-y: auto; }
.modal h3 { margin-bottom: 12px; }
textarea { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 8px; color: var(--text); font-family: inherit; font-size: 13px; min-height: 120px; resize: vertical; }
textarea:focus { outline: none; border-color: var(--primary); }
.result-box { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 8px; margin-top: 8px; max-height: 200px; overflow: auto; font-size: 12px; white-space: pre-wrap; }
.kza-list { list-style: none; font-size: 12px; }
.kza-list li { padding: 4px 0; display: flex; align-items: center; gap: 6px; }
.severity-low { color: var(--amber); }
.severity-medium { color: orange; }
.severity-high { color: var(--red); }
.severity-critical { color: var(--red); font-weight: 700; }
</style>
</head>
<body>
<div class="container">
  <header>
    <div>
      <h1>FSTF · DB SaaS Panel</h1>
      <div class="subtitle">Hidden port ${port} · 127.0.0.1 only · nmap invisible</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px">
      ${warnBadge}
      <span class="text-xs text-muted">${isSudo ? 'sudo' : 'user'}</span>
    </div>
  </header>

  <div class="grid-3" style="margin-bottom:16px">
    <div class="stat-box">
      <div class="stat-val" id="instanceCount">${instances.length}</div>
      <div class="stat-label">Total Instances</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${instances.filter((i:any) => i.status === 'running').length}</div>
      <div class="stat-label">Running</div>
    </div>
    <div class="stat-box">
      <div class="stat-val" id="kzaLevel">${kza?.threatLevel || 'none'}</div>
      <div class="stat-label">KZA Threat Level</div>
    </div>
  </div>

  <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
    <button class="btn" onclick="openSpawn()">+ Spawn Instance</button>
    <button class="btn-ghost" onclick="refreshInstances()">Refresh</button>
    <button class="btn-ghost" onclick="openSqlModal()">SQL Console</button>
  </div>

  <div class="card">
    <h2>DB SaaS Instances</h2>
    <div style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Database</th>
            <th>Port</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="instanceTable">
          ${instanceRows || '<tr><td colspan="6" class="text-muted text-xs" style="padding:24px;text-align:center">No instances yet. Spawn one to get started.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <h2>KZA Supervision</h2>
    ${kza?.warnings?.length > 0 ? `
    <ul class="kza-list">
      ${kza.warnings.map((w: any) => `
        <li>
          <span class="severity-${w.severity}">●</span>
          <span>${escapeHtml(w.message)}</span>
        </li>
      `).join('')}
    </ul>
    ` : '<p class="text-xs text-muted">No active security concerns.</p>'}
  </div>
</div>

<div class="modal-overlay" id="spawnModal">
  <div class="modal">
    <h3>Spawn DB SaaS Instance</h3>
    <p class="text-xs text-muted" style="margin-bottom:12px">Boot takes ~20-25 seconds. FLS will signal when ready.</p>
    <input type="text" id="spawnName" placeholder="Instance name" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:inherit;font-size:13px;margin-bottom:8px">
    <div id="spawnProgress" style="display:none;margin-bottom:8px">
      <div style="height:4px;background:var(--muted);border-radius:2px;overflow:hidden;margin-bottom:4px">
        <div id="spawnBar" style="height:100%;width:0%;background:var(--primary);transition:width 0.3s"></div>
      </div>
      <div id="spawnMsg" class="text-xs text-muted"></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn-ghost" onclick="closeModal('spawnModal')">Cancel</button>
      <button class="btn" onclick="doSpawn()">Spawn</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="sqlModal">
  <div class="modal">
    <h3>SQL Console</h3>
    <p class="text-xs text-muted" style="margin-bottom:8px">Direct SQL execution on a running instance.</p>
    <select id="sqlInstance" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:inherit;font-size:13px;margin-bottom:8px">
      <option value="">Select instance...</option>
      ${instances.filter((i: any) => i.status === 'running').map((i: any) =>
        `<option value="${i.id}">${escapeHtml(i.name)} (${i.db_name})</option>`
      ).join('')}
    </select>
    <textarea id="sqlQuery" placeholder="SELECT * FROM pg_tables WHERE schemaname = 'public';"></textarea>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn" onclick="doSql()">Execute</button>
      <button class="btn-ghost" onclick="closeModal('sqlModal')">Close</button>
    </div>
    <div class="result-box" id="sqlResult" style="display:none"></div>
  </div>
</div>

<script>
const cbisKey = window.location.pathname.match(/\\/fstf\\/ec\\/([^/]+)/)[1];

function openSpawn() { showModal('spawnModal'); }
function openSqlModal() { showModal('sqlModal'); }
function showModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if(e.target === el) el.classList.remove('active'); });
});

async function api(path, body) {
  const opts = { headers: { 'Content-Type': 'application/json' } };
  if (body) opts.method = 'POST', opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  return r.json();
}

let pollInterval;

async function doSpawn() {
  const name = document.getElementById('spawnName').value.trim();
  if (!name) return;
  document.getElementById('spawnProgress').style.display = 'block';
  document.getElementById('spawnBar').style.width = '0%';
  document.getElementById('spawnMsg').textContent = 'Starting...';

  const data = await api('/fstf/ec/' + cbisKey + '/otdb/api/spawn', { name });
  if (!data.success) {
    document.getElementById('spawnMsg').textContent = 'Error: ' + (data.error || 'Unknown');
    return;
  }

  let progress = 0;
  pollInterval = setInterval(async () => {
    progress = Math.min(progress + 8, 95);
    document.getElementById('spawnBar').style.width = progress + '%';
    document.getElementById('spawnMsg').textContent = 'Booting instance... ' + progress + '%';

    const ev = await api('/fstf/ec/' + cbisKey + '/otdb/api/fls/events?channel=db-saas-' + data.instance?.id);
    if (ev.success && ev.events?.length > 0) {
      const last = ev.events[0];
      document.getElementById('spawnMsg').textContent = last.payload?.message || 'Processing...';
    }

    const instData = await api('/fstf/ec/' + cbisKey + '/otdb/api/instances');
    const inst = instData.instances?.find((i:any) => i.id === data.instance?.id);
    if (inst?.status === 'running') {
      clearInterval(pollInterval);
      document.getElementById('spawnBar').style.width = '100%';
      document.getElementById('spawnMsg').textContent = 'Instance ready!';
      setTimeout(() => { closeModal('spawnModal'); refreshInstances(); }, 1500);
    } else if (inst?.status === 'error') {
      clearInterval(pollInterval);
      document.getElementById('spawnMsg').textContent = 'Error spawning instance';
    }
  }, 2000);
}

async function destroyInstance(id) {
  if (!confirm('Destroy instance? All data will be lost.')) return;
  await api('/fstf/ec/' + cbisKey + '/otdb/api/destroy', { instanceId: id });
  refreshInstances();
}

async function doSql() {
  const instanceId = document.getElementById('sqlInstance').value;
  const query = document.getElementById('sqlQuery').value.trim();
  if (!instanceId || !query) return;

  const resultEl = document.getElementById('sqlResult');
  resultEl.style.display = 'block';
  resultEl.textContent = 'Executing...';

  const data = await api('/fstf/ec/' + cbisKey + '/otdb/api/execute-sql', { instanceId, query });
  if (data.success) {
    resultEl.textContent = JSON.stringify(data.rows || data, null, 2);
  } else {
    resultEl.textContent = 'Error: ' + (data.error || 'Unknown');
  }
}

async function refreshInstances() {
  const data = await api('/fstf/ec/' + cbisKey + '/otdb/api/instances');
  if (!data.success) return;
  const tbody = document.getElementById('instanceTable');
  if (data.instances?.length > 0) {
    document.getElementById('instanceCount').textContent = data.instances.length;
    tbody.innerHTML = data.instances.map(i => \`
      <tr>
        <td class="px-4 py-3 text-sm truncate max-w-[150px]">\${i.name}</td>
        <td class="px-4 py-3"><span class="status-\${i.status}">\${i.status}</span></td>
        <td class="px-4 py-3 text-sm text-muted">\${i.db_name}</td>
        <td class="px-4 py-3 text-sm font-mono text-muted">\${i.port}</td>
        <td class="px-4 py-3 text-sm text-muted">\${new Date(i.created_at).toLocaleString()}</td>
        <td class="px-4 py-3">
          <div class="flex gap-1">
            <button class="btn-ghost text-xs" onclick="showSql('\${i.id}')">SQL</button>
            <button class="btn-ghost text-xs text-red-400" onclick="destroyInstance('\${i.id}')">Destroy</button>
          </div>
        </td>
      </tr>
    \`).join('');
  }
}

function showSql(instanceId) {
  document.getElementById('sqlInstance').value = instanceId;
  openSqlModal();
}

refreshInstances();
</script>
</body>
</html>`
}

function escapeHtml(str: string): string {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
