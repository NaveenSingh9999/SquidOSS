const API_URL = import.meta.env.VITE_SQUIDOSS_API_URL || 'http://localhost:3000'

type AuthChangeCallback = (event: string, session: any) => void

let authListeners: AuthChangeCallback[] = []
let currentSession: any = null

function notifyListeners(event: string, session: any) {
  currentSession = session
  for (const cb of authListeners) cb(event, session)
}

async function api(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('squidoss_token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    return { data: null, error: new Error(body.error || body.message || res.statusText) }
  }

  const text = await res.text()
  if (!text) return { data: null, error: null }

  try {
    const data = JSON.parse(text)
    if (data.error) return { data: null, error: new Error(data.error) }
    return { data, error: null }
  } catch {
    return { data: text, error: null }
  }
}

class QueryBuilder {
  private path: string
  private filters: string[] = []
  private orderClause = ''
  private limitClause = ''
  private rangeClause = ''
  private returnSingle = false
  private returnMaybeSingle = false
  private selectCols = '*'

  constructor(private table: string) {
    this.path = `/api/v1/query/${table}`
  }

  select(columns = '*') {
    this.selectCols = columns
    return this
  }

  eq(column: string, value: any) {
    this.filters.push(`eq.${column}.${value}`)
    return this
  }

  neq(column: string, value: any) {
    this.filters.push(`neq.${column}.${value}`)
    return this
  }

  gt(column: string, value: any) {
    this.filters.push(`gt.${column}.${value}`)
    return this
  }

  lt(column: string, value: any) {
    this.filters.push(`lt.${column}.${value}`)
    return this
  }

  gte(column: string, value: any) {
    this.filters.push(`gte.${column}.${value}`)
    return this
  }

  lte(column: string, value: any) {
    this.filters.push(`lte.${column}.${value}`)
    return this
  }

  is(column: string, value: any) {
    this.filters.push(`is.${column}.${value}`)
    return this
  }

  in(column: string, values: any[]) {
    this.filters.push(`in.${column}.${values.join(',')}`)
    return this
  }

  order(column: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const dir = opts.ascending === false ? 'desc' : 'asc'
    const nulls = opts.nullsFirst ? 'nullsfirst' : 'nullslast'
    this.orderClause = `&order=${column}.${dir}.${nulls}`
    return this
  }

  limit(n: number) {
    this.limitClause = `&limit=${n}`
    return this
  }

  range(start: number, end: number) {
    this.rangeClause = `&offset=${start}&limit=${end - start + 1}`
    return this
  }

  single() {
    this.returnSingle = true
    return this
  }

  maybeSingle() {
    this.returnMaybeSingle = true
    return this
  }

  private buildUrl() {
    let url = this.path
    if (this.filters.length > 0 || this.orderClause || this.limitClause || this.rangeClause) {
      url += `?select=${this.selectCols}`
      if (this.filters.length > 0) url += `&filter=${this.filters.join(',')}`
      url += this.orderClause + this.limitClause + this.rangeClause
    }
    return url
  }

  async execute() {
    const result = await api(this.buildUrl())
    if (result.error) return { data: null, error: result.error }

    let data = result.data
    if (Array.isArray(data)) {
      if (this.returnSingle) data = data[0] || null
      else if (this.returnMaybeSingle) data = data[0] || null
    }
    return { data, error: null }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject)
  }

  async insert(values: any) {
    return api(this.path, {
      method: 'POST',
      body: JSON.stringify(Array.isArray(values) ? values : [values]),
    })
  }

  async update(values: any) {
    return api(this.path, {
      method: 'PATCH',
      body: JSON.stringify({ values, filters: this.filters }),
    })
  }

  async delete() {
    return api(this.path, {
      method: 'DELETE',
      body: JSON.stringify({ filters: this.filters }),
    })
  }
}

const squidoss = {
  get auth() {
    return {
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const result = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        })
        if (result.data?.token) {
          localStorage.setItem('squidoss_token', result.data.token)
          notifyListeners('SIGNED_IN', { access_token: result.data.token, user: result.data.user })
        }
        return { data: { user: result.data?.user, session: result.data?.token ? { access_token: result.data.token } : null }, error: result.error }
      },

      async signUp({ email, password, options }: any) {
        const result = await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, fullName: options?.data?.full_name || '' }),
        })
        if (result.data?.token) {
          localStorage.setItem('squidoss_token', result.data.token)
          notifyListeners('SIGNED_IN', { access_token: result.data.token, user: result.data.user })
        }
        return { data: { user: result.data?.user, session: result.data?.token ? { access_token: result.data.token } : null }, error: result.error }
      },

      async signOut() {
        localStorage.removeItem('squidoss_token')
        notifyListeners('SIGNED_OUT', null)
        return { error: null }
      },

      async getUser() {
        const token = localStorage.getItem('squidoss_token')
        if (!token) return { data: { user: null }, error: null }
        const result = await api('/auth/me')
        return { data: { user: result.data || null }, error: result.error }
      },

      async getSession() {
        const token = localStorage.getItem('squidoss_token')
        if (!token) return { data: { session: null }, error: null }
        const result = await api('/auth/me')
        return {
          data: {
            session: result.data ? {
              access_token: token,
              user: result.data,
            } : null,
          },
          error: result.error,
        }
      },

      onAuthStateChange(callback: AuthChangeCallback) {
        authListeners.push(callback)
        // Immediately fire with current state
        if (currentSession) callback('SIGNED_IN', currentSession)
        return {
          data: {
            subscription: { unsubscribe: () => { authListeners = authListeners.filter(cb => cb !== callback) } },
          },
        }
      },

      async refreshSession() {
        // JWT tokens don't need refresh in our simple implementation
        return { data: { session: null }, error: null }
      },

      async signInWithOAuth({ provider }: { provider: string }) {
        if (provider === 'github') {
          const result = await api('/auth/oauth/github')
          return { data: { url: result.data?.url, provider }, error: result.error }
        }
        return { data: null, error: new Error(`OAuth provider ${provider} not supported`) }
      },

      async exchangeCodeForSession(code: string) {
        const result = await api('/auth/oauth/callback', {
          method: 'POST',
          body: JSON.stringify({ code }),
        })
        if (result.data?.token) {
          localStorage.setItem('squidoss_token', result.data.token)
          notifyListeners('SIGNED_IN', { access_token: result.data.token, user: result.data.user })
        }
        return { data: { session: result.data?.token ? { access_token: result.data.token } : null, user: result.data?.user }, error: result.error }
      },

      async setSession({ access_token }: { access_token: string }) {
        localStorage.setItem('squidoss_token', access_token)
        notifyListeners('SIGNED_IN', { access_token, user: null })
        return { data: { session: { access_token } }, error: null }
      },

      get admin() {
        return {
          async getUserById(userId: string) {
            const result = await api(`/auth/admin/users/${userId}`)
            return { data: { user: result.data }, error: result.error }
          },
        }
      },
    }
  },

  from(table: string) {
    return new QueryBuilder(table)
  },

  rpc(name: string, params: any = {}) {
    return api(`/api/v1/rpc/${name}`, {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },

  functions: {
    invoke(name: string, options: any = {}) {
      return api(`/api/v1/edge/${name}`, {
        method: 'POST',
        body: options.body ? JSON.stringify(options.body) : undefined,
      })
    },
  },

  storage: {
    from(bucket: string) {
      return {
        async upload(path: string, file: Blob | File, options?: { contentType?: string; upsert?: boolean }) {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('path', path)
          formData.append('bucket', bucket)
          if (options?.contentType) formData.append('contentType', options.contentType)
          if (options?.upsert) formData.append('upsert', 'true')

          const token = localStorage.getItem('squidoss_token')
          const res = await fetch(`${API_URL}/api/v1/storage/upload`, {
            method: 'POST',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            body: formData,
          })
          const data = await res.json()
          if (!res.ok) return { data: null, error: new Error(data.error || 'Upload failed') }
          return { data, error: null }
        },

        async download(path: string) {
          const token = localStorage.getItem('squidoss_token')
          const res = await fetch(`${API_URL}/api/v1/storage/download?bucket=${bucket}&path=${encodeURIComponent(path)}`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          })
          if (!res.ok) return { data: null, error: new Error('Download failed') }
          return { data: await res.blob(), error: null }
        },

        async remove(paths: string[]) {
          return api(`/api/v1/storage/remove`, {
            method: 'POST',
            body: JSON.stringify({ bucket, paths }),
          })
        },

        async list(prefix = '') {
          return api(`/api/v1/storage/list?bucket=${bucket}&prefix=${encodeURIComponent(prefix)}`)
        },
      }
    },
  },

  channel() {
    return { on: () => this, subscribe: () => this, unsubscribe: () => {} }
  },
}

export default squidoss
