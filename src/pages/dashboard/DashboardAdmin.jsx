import { Link } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import KPICard from '../../components/ui/KPICard'
import { currency, number } from '../../utils/formatters'
import { ROUTES } from '../../constants/routes'

/* ── Mock data (replaced by Supabase queries) ────────── */
const kpis = [
  { label: 'Ventas totales',    value: 284750, trend: 12.4, trendLabel: 'vs. mes anterior', accentColor: 'var(--color-green-500)',  iconBg: 'var(--color-green-100)',  iconColor: 'var(--color-green-600)' },
  { label: 'Órdenes procesadas',value: 1842,   trend: 8.1,  trendLabel: 'vs. mes anterior', accentColor: 'var(--color-blue-500)',   iconBg: 'var(--color-blue-100)',   iconColor: 'var(--color-blue-600)' },
  { label: 'Ticket promedio',   value: 154.6,  trend: 3.9,  trendLabel: 'vs. mes anterior', accentColor: 'var(--color-brand)',      iconBg: 'var(--color-amber-100)',  iconColor: 'var(--color-amber-600)' },
  { label: 'Meseros activos',   value: 24,     trend: 0,    trendLabel: '',                  accentColor: 'var(--color-purple-500)', iconBg: 'var(--color-purple-100)', iconColor: 'var(--color-purple-600)' },
]

const ventas7d = [
  { dia: 'Lun', ventas: 38400, ordenes: 248 },
  { dia: 'Mar', ventas: 42100, ordenes: 272 },
  { dia: 'Mié', ventas: 35200, ordenes: 228 },
  { dia: 'Jue', ventas: 48700, ordenes: 315 },
  { dia: 'Vie', ventas: 61200, ordenes: 396 },
  { dia: 'Sáb', ventas: 74500, ordenes: 481 },
  { dia: 'Dom', ventas: 68300, ordenes: 441 },
]

const topMeseros = [
  { nombre: 'Diego Ruiz',      ventas: 48200, ordenes: 312, ticket: 154 },
  { nombre: 'María González',  ventas: 44100, ordenes: 288, ticket: 153 },
  { nombre: 'Carlos Herrera',  ventas: 41800, ordenes: 270, ticket: 155 },
  { nombre: 'Ana Martínez',    ventas: 39600, ordenes: 256, ticket: 155 },
  { nombre: 'Roberto Lima',    ventas: 37900, ordenes: 244, ticket: 155 },
]

const incentivosActivos = [
  { nombre: 'Mayor upsell del mes', premio: 'Bono $500', participantes: 18, termina: '31 May' },
  { nombre: 'Top ventas semana',    premio: 'Día libre',  participantes: 24, termina: '02 Jun' },
]

const avisos = [
  { titulo: 'Reunión obligatoria viernes', fecha: 'Hoy 14:00', tipo: 'info' },
  { titulo: 'Nuevo menú de temporada disponible', fecha: 'Ayer', tipo: 'success' },
  { titulo: 'Revisión de inventario pendiente', fecha: '24 May', tipo: 'warning' },
]

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 12px', boxShadow: 'var(--shadow-md)' }}>
      <p style={{ fontWeight: 600, marginBottom: 4, fontSize: 13 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ fontSize: 12, color: p.color }}>
          {p.name}: {p.name === 'ventas' ? currency(p.value) : number(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function DashboardAdmin() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Resumen general · Mayo 2026</p>
        </div>
        <div className="page-actions">
          <Link to={ROUTES.REPORT_UPLOAD} className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Subir reporte
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid-kpi">
        {kpis.map((kpi) => (
          <KPICard
            key={kpi.label}
            {...kpi}
            formatter={kpi.label.includes('Ventas') || kpi.label.includes('Ticket') ? currency : number}
          />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid-chart" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Ventas — últimos 7 días</h3>
            <Link to={ROUTES.METRICS} className="btn btn-ghost btn-sm">Ver más →</Link>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={ventas7d} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-brand)" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="dia" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="ventas" stroke="var(--color-brand)" strokeWidth={2} fill="url(#gradVentas)" name="ventas" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Órdenes por día</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ventas7d} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="dia" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="ordenes" fill="var(--color-blue-500)" radius={[4,4,0,0]} name="ordenes" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid-3" style={{ marginBottom: 'var(--space-6)' }}>
        {/* Top meseros */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-header">
            <h3 className="card-title">Top meseros del mes</h3>
            <Link to={ROUTES.RANKINGS} className="btn btn-ghost btn-sm">Ver ranking completo →</Link>
          </div>
          <div className="ranking-list">
            {topMeseros.map((m, i) => (
              <div key={m.nombre} className="ranking-item">
                <div className={`ranking-position rank-${i < 3 ? i+1 : 'other'}`}>{i+1}</div>
                <div className="ranking-avatar">{m.nombre.split(' ').map(w=>w[0]).join('')}</div>
                <div className="ranking-info">
                  <p className="ranking-name">{m.nombre}</p>
                  <p className="ranking-meta">{m.ordenes} órdenes · ticket ${ m.ticket}</p>
                </div>
                <span className="ranking-score">{currency(m.ventas)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Incentivos y avisos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="card card-sm">
            <div className="card-header">
              <h3 className="card-title">Incentivos activos</h3>
              <Link to={ROUTES.INCENTIVES} className="btn btn-ghost btn-sm">Ver →</Link>
            </div>
            {incentivosActivos.map((inc) => (
              <div key={inc.nombre} style={{ padding: 'var(--space-3) 0', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <p style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{inc.nombre}</p>
                  <span className="badge badge-success">{inc.premio}</span>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 4 }}>
                  {inc.participantes} participantes · termina {inc.termina}
                </p>
              </div>
            ))}
          </div>

          <div className="card card-sm">
            <div className="card-header">
              <h3 className="card-title">Avisos recientes</h3>
              <Link to={ROUTES.NOTICES} className="btn btn-ghost btn-sm">Ver →</Link>
            </div>
            {avisos.map((a) => (
              <div key={a.titulo} className={`notice-card ${a.tipo !== 'info' ? 'unread' : ''}`} style={{ marginBottom: 'var(--space-2)' }}>
                <div className="notice-header">
                  <p className="notice-title">{a.titulo}</p>
                  <span className="notice-date">{a.fecha}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
