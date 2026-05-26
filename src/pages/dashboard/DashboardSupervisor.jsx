import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import KPICard from '../../components/ui/KPICard'
import { currency, number } from '../../utils/formatters'
import { ROUTES } from '../../constants/routes'

const kpis = [
  { label: 'Ventas de mi unidad', value: 74500, trend: 6.2, accentColor: 'var(--color-green-500)', iconBg: 'var(--color-green-100)', iconColor: 'var(--color-green-600)' },
  { label: 'Órdenes hoy',         value: 127,   trend: 4.0, accentColor: 'var(--color-blue-500)',  iconBg: 'var(--color-blue-100)',  iconColor: 'var(--color-blue-600)' },
  { label: 'Ticket promedio',     value: 156,   trend: 2.1, accentColor: 'var(--color-brand)',     iconBg: 'var(--color-amber-100)', iconColor: 'var(--color-amber-600)' },
  { label: 'Meseros en turno',    value: 6,     trend: 0,   accentColor: 'var(--color-purple-500)',iconBg: 'var(--color-purple-100)',iconColor: 'var(--color-purple-600)' },
]

const rendimientoMeseros = [
  { nombre: 'D. Ruiz',   ventas: 18200 },
  { nombre: 'A. López',  ventas: 16400 },
  { nombre: 'C. Torres', ventas: 14900 },
  { nombre: 'M. Vega',   ventas: 13100 },
  { nombre: 'R. Soto',   ventas: 11800 },
]

const avisos = [
  { titulo: 'Inventario actualizado', fecha: 'Hoy', unread: true },
  { titulo: 'Cambio de turno viernes', fecha: 'Ayer', unread: false },
]

export default function DashboardSupervisor() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Operativo</h1>
          <p className="page-subtitle">Tu unidad · Mayo 2026</p>
        </div>
      </div>

      <div className="grid-kpi">
        {kpis.map((kpi) => (
          <KPICard key={kpi.label} {...kpi}
            formatter={kpi.label.includes('Ventas') || kpi.label.includes('Ticket') ? currency : number}
          />
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Rendimiento de meseros</h3>
            <Link to={ROUTES.METRICS} className="btn btn-ghost btn-sm">Detalle →</Link>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rendimientoMeseros} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="nombre" tick={{ fontSize: 12, fill: 'var(--text-primary)' }} axisLine={false} tickLine={false} width={60} />
              <Tooltip formatter={(v) => [currency(v), 'Ventas']} />
              <Bar dataKey="ventas" fill="var(--color-brand)" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="card card-sm">
            <div className="card-header">
              <h3 className="card-title">Ranking de mi unidad</h3>
              <Link to={ROUTES.RANKINGS} className="btn btn-ghost btn-sm">Ver →</Link>
            </div>
            <div className="ranking-list">
              {rendimientoMeseros.slice(0,3).map((m, i) => (
                <div key={m.nombre} className="ranking-item">
                  <div className={`ranking-position rank-${i+1}`}>{i+1}</div>
                  <div className="ranking-avatar">{m.nombre.split(' ').map(w=>w[0]).join('')}</div>
                  <div className="ranking-info">
                    <p className="ranking-name">{m.nombre}</p>
                  </div>
                  <span className="ranking-score">{currency(m.ventas)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card card-sm">
            <div className="card-header">
              <h3 className="card-title">Avisos</h3>
              <Link to={ROUTES.NOTICES} className="btn btn-ghost btn-sm">Ver →</Link>
            </div>
            {avisos.map((a) => (
              <div key={a.titulo} className={`notice-card ${a.unread ? 'unread' : ''}`} style={{ marginBottom: 'var(--space-2)' }}>
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
