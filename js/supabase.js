const SUPABASE_URL = 'https://mxoftckkspvjyhggoiaa.supabase.co'
const SUPABASE_KEY = 'sb_publishable_eEKMd13j8l94OCI15Xi-Qg_sGZVAz6a'

const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// Auth helpers
const Auth = {
  async login(email, pin) {
    const { data, error } = await db
      .from('users')
      .select('*, restaurants(*)')
      .eq('email', email.trim().toLowerCase())
      .eq('pin', pin.trim())
      .eq('active', true)
      .single()

    if (error || !data) {
      console.error('Login error:', error, 'data:', data)
      return { error: 'Credenciales incorrectas' }
    }

    sessionStorage.setItem('user', JSON.stringify(data))
    return { data }
  },

  logout() {
    sessionStorage.removeItem('user')
    window.location.href = '/index.html'
  },

  getUser() {
    const raw = sessionStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  },

  require(redirectIfNot = '/index.html') {
    const user = this.getUser()
    if (!user) window.location.href = redirectIfNot
    return user
  },

  can(user, action) {
    const perms = {
      admin:      ['all'],
      gerente:    ['upload', 'incentives', 'notices', 'users', 'metrics', 'reports'],
      supervisor: ['notices', 'metrics', 'reports'],
      mesero:     ['metrics_own']
    }
    const role = perms[user.role] || []
    return role.includes('all') || role.includes(action)
  }
}

// Queries helpers
const DB = {
  // Restaurantes
  async getRestaurants() {
    const { data } = await db.from('restaurants').select('*').eq('active', true).order('name')
    return data || []
  },

  // Usuarios
  async getUsers(restaurantId = null) {
    let q = db.from('users').select('*, restaurants(name)').order('name')
    if (restaurantId) q = q.eq('restaurant_id', restaurantId)
    const { data } = await q
    return data || []
  },

  async createUser(payload) {
    const { data, error } = await db.from('users').insert(payload).select().single()
    return { data, error }
  },

  async updateUser(id, payload) {
    const { data, error } = await db.from('users').update(payload).eq('id', id).select().single()
    return { data, error }
  },

  async deleteUser(id) {
    const { error } = await db.from('users').update({ active: false }).eq('id', id)
    return { error }
  },

  // Métricas
  async getMetrics(restaurantId, from, to, waiterId = null) {
    let q = db.from('metrics_daily')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .gte('metric_date', from)
      .lte('metric_date', to)
      .order('metric_date')
    if (waiterId) q = q.eq('waiter_id', waiterId)
    const { data } = await q
    return data || []
  },

  // Incentivos
  async getIncentives(restaurantId) {
    const { data } = await db.from('incentives')
      .select('*, incentive_progress(*, users(name))')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
    return data || []
  },

  async createIncentive(payload) {
    const { data, error } = await db.from('incentives').insert(payload).select().single()
    return { data, error }
  },

  // Reportes
  async getReports(restaurantId) {
    const { data } = await db.from('reports')
      .select('*, users(name)')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
    return data || []
  },

  // Avisos
  async getNotices(restaurantId) {
    const { data } = await db.from('notices')
      .select('*, users(name)')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
    return data || []
  },

  async createNotice(payload) {
    const { data, error } = await db.from('notices').insert(payload).select().single()
    return { data, error }
  },

  async markNoticeRead(noticeId, userId) {
    await db.from('notice_reads').upsert({ notice_id: noticeId, user_id: userId })
  },

  async getUnreadCount(userId, restaurantId) {
    const { data: reads } = await db.from('notice_reads').select('notice_id').eq('user_id', userId)
    const readIds = (reads || []).map(r => r.notice_id)
    let q = db.from('notices').select('id', { count: 'exact' }).eq('restaurant_id', restaurantId)
    if (readIds.length > 0) q = q.not('id', 'in', `(${readIds.join(',')})`)
    const { count } = await q
    return count || 0
  }
}

// Date helpers
const DateUtils = {
  today() {
    return new Date().toISOString().split('T')[0]
  },
  daysAgo(n) {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString().split('T')[0]
  },
  format(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
  },
  formatMoney(n) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)
  }
}
