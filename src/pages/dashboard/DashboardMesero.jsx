import { Link } from 'react-router-dom'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import KPICard from '../../components/ui/KPICard'
import { currency, number, percent } from '../../utils/formatters'
import { ROUTES } from '../../constants/routes'
import { useAuthStore } from '../../store/auth.store'

const kpis = [
  { label: 'Mis ventas (mes)',  value: 48200, trend: 11.4, accentColor: 'var(--color-green-500)', iconBg: 'var(--color-green-100)', iconColor: 'var(--color-green-600)' },
  { label: 'Mis órdenes',      value: 312,   trend: 8.2,  accentColor: 'var(--color-blue-500)',  iconBg: 'var(--color-blue-100)',  iconColor: 'var(--color-blue-600)' },
  { label: 'Mi ticket prom.',  value: 154,   trend: 3.0,  accentColor: 'var(--color-brand)',     iconBg: 'var(--color-amber-100)', iconColor: 'var(--color-amber-600)' },
  { label: 'Mi posición',      value: '#1',  trend: 2,    accentColor: '#FFD700',                iconBg: '#FEF9C3',               iconColor: '#92400E' },
]

const semana = [
  { dia: 'Lun', ventas: 6800 }, { dia: 'Mar', ventas: 7200 }, { dia: 'Mié', ventas: 5900 },
  { dia: 'Jue', ventas: 8100 }, { dia: 'Vie', ventas: 9800 }, { dia: 'Sáb', ventas: 10400 },
  { dia: 'Dom', ventas: 9700 },
]

const radar = [
  { subject: 'Ventas',    A: 95 },
  { subject: 'Órdenes',  A: 88 },
  { subject: 'Ticket',   A: 78 },
  { subject: 'Upsell',   A: 65 },
  { subject: 'Puntual',  A: 92 },
]

const incentivos = [
  { nombre: 'Mayor upsell del mes', progress: 74, meta: '$5,000', actual: '$3,700' },
  { nombre: 'Top ventas semana',    progress: 91, meta: '400 órd.', actual: '362 órd.' },
]

export default function DashboardMesero() {
  const { user } = useAuthStore()
  const nombre = user?.nombre?.split(' ')[0] ?? 'Mesero'

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hola, {nombre} 👋</h1>
          <p className="page-subtitle">Tu rendimiento personal · Mayo 2026</p>
        </div>
      </div>

      <div className="grid-kpi">
        {kpis.map((kpi) => (
          <KPICard key={kpi.label} {...kpi}
            formatter={kpi.label.includes('ventas') || kpi.label.includes('ticket') ? currency : (v) => v}
          />
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Mis ventas esta semana</h3>
            <Link to={ROUTES.METRICS} className="btn btn-ghost btn-sm">Historial →</Link>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={semana}>
              <defs>
                <linearGradient id="gradMe" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-brand)" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="dia" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [currency(v), 'Ventas']} />
              <Area type="monotone" dataKey="ventas" stroke="var(--color-brand)" strokeWidth={2} fill="url(#gradMe)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Perfil de rendimiento</h3>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <RadarChart data={radar}>
              <PolarGrid stroke="var(--border-color)" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
              <Radar name="Yo" dataKey="A" stroke="var(--color-brand)" fill="var(--color-brand)" fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Mis incentivos */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-header">
          <h3 className="card-title">Mis incentivos activos</h3>
          <Link to={ROUTES.INCENTIVES} className="btn btn-ghost btn-sm">Ver todos →</Link>
        </div>
        {incentivos.map((inc) => (
          <div key={inc.nombre} style={{ padding: 'var(--space-4) 0', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
              <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{inc.nombre}</p>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                {inc.actual} / {inc.meta}
              </span>
            </div>
            <div className="progress-bar-wrap">
              <div className="progress-bar-fill" style={{ width: `${inc.progress}%`, background: inc.progress >= 90 ? 'var(--color-green-500)' : 'var(--color-brand)' }} />
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: inc.progress >= 90 ? 'var(--color-green-600)' : 'var(--text-secondary)', marginTop: 4, fontWeight: 500 }}>
              {percent(inc.progress)} completado
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
