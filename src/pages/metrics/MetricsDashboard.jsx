import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import { currency, number, percent } from '../../utils/formatters'
import { useAuthStore } from '../../store/auth.store'
import { ROLES } from '../../constants/roles'

const periodos = ['Semana', 'Mes', 'Trimestre', 'Año']

const tendencia = [
  { mes: 'Ene', ventas: 210000, ordenes: 1380 },
  { mes: 'Feb', ventas: 228000, ordenes: 1470 },
  { mes: 'Mar', ventas: 245000, ordenes: 1580 },
  { mes: 'Abr', ventas: 238000, ordenes: 1530 },
  { mes: 'May', ventas: 284750, ordenes: 1842 },
]

const meserosData = [
  { id: '4', nombre: 'Diego Ruiz',     ventas: 48200, ordenes: 312, ticket: 154, upsell: 6200, posicion: 1 },
  { id: '5', nombre: 'María González', ventas: 44100, ordenes: 288, ticket: 153, upsell: 5800, posicion: 2 },
  { id: '6', nombre: 'Carlos Herrera', ventas: 41800, ordenes: 270, ticket: 155, upsell: 5100, posicion: 3 },
  { id: '7', nombre: 'Ana Martínez',   ventas: 39600, ordenes: 256, ticket: 155, upsell: 4900, posicion: 4 },
  { id: '8', nombre: 'Roberto Lima',   ventas: 37900, ordenes: 244, ticket: 155, upsell: 4600, posicion: 5 },
]

export default function MetricsDashboard() {
  const { user } = useAuthStore()
  const [periodo, setPeriodo] = useState('Mes')
  const isMesero = user?.rol === ROLES.MESERO

  const meData = meserosData[0]

  const globalKPIs = [
    { label: 'Ventas totales',    value: 284750, trend: 12.4, accentColor: 'var(--color-green-500)',  iconBg: 'var(--color-green-100)',  iconColor: 'var(--color-green-600)' },
    { label: 'Órdenes totales',   value: 1842,   trend: 8.1,  accentColor: 'var(--color-blue-500)',   iconBg: 'var(--color-blue-100)',   iconColor: 'var(--color-blue-600)' },
    { label: 'Ticket promedio',   value: 154.6,  trend: 3.9,  accentColor: 'var(--color-brand)',      iconBg: 'var(--color-amber-100)',  iconColor: 'var(--color-amber-600)' },
    { label: 'Upsell total',      value: 26600,  trend: 15.2, accentColor: 'var(--color-purple-500)', iconBg: 'var(--color-purple-100)', iconColor: 'var(--color-purple-600)' },
  ]

  const personalKPIs = [
    { label: 'Mis ventas',        value: meData.ventas,  trend: 11.4, accentColor: 'var(--color-green-500)',  iconBg: 'var(--color-green-100)',  iconColor: 'var(--color-green-600)' },
    { label: 'Mis órdenes',       value: meData.ordenes, trend: 8.2,  accentColor: 'var(--color-blue-500)',   iconBg: 'var(--color-blue-100)',   iconColor: 'var(--color-blue-600)' },
    { label: 'Mi ticket prom.',   value: meData.ticket,  trend: 3.0,  accentColor: 'var(--color-brand)',      iconBg: 'var(--color-amber-100)',  iconColor: 'var(--color-amber-600)' },
    { label: 'Mi upsell',         value: meData.upsell,  trend: 7.5,  accentColor: 'var(--color-purple-500)', iconBg: 'var(--color-purple-100)', iconColor: 'var(--color-purple-600)' },
  ]

  const kpis = isMesero ? personalKPIs : globalKPIs

  const columns = [
    { header: 'Pos.', key: 'pos', render: (r) => (
      <div className={`ranking-position rank-${r.posicion <= 3 ? r.posicion : 'other'}`} style={{ margin: '0 auto' }}>{r.posicion}</div>
    )},
    { header: 'Mesero',   accessor: 'nombre',  sortable: true },
    { header: 'Ventas',   accessor: 'ventas',  sortable: true, render: (r) => currency(r.ventas) },
    { header: 'Órdenes',  accessor: 'ordenes', sortable: true, render: (r) => number(r.ordenes) },
    { header: 'Ticket',   accessor: 'ticket',  sortable: true, render: (r) => currency(r.ticket) },
    { header: 'Upsell',   accessor: 'upsell',  sortable: true, render: (r) => currency(r.upsell) },
    {
      header: 'Detalle', key: 'det',
      render: (r) => <Link to={`/metrics/waiter/${r.id}`} className="btn btn-ghost btn-sm">Ver →</Link>,
    },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Métricas</h1>
          <p className="page-subtitle">{isMesero ? 'Tu rendimiento personal' : 'Vista global del restaurante'}</p>
        </div>
        <div className="page-actions">
          <div className="tabs" style={{ border: 'none', marginBottom: 0 }}>
            {periodos.map((p) => (
              <button key={p} className={`tab-btn ${periodo === p ? 'active' : ''}`} onClick={() => setPeriodo(p)}>{p}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-kpi">
        {kpis.map((kpi) => (
          <KPICard key={kpi.label} {...kpi}
            trendLabel={`vs. ${periodo.toLowerCase()} anterior`}
            formatter={kpi.label.includes('Ventas') || kpi.label.includes('Ticket') || kpi.label.includes('Upsell') || kpi.label.includes('upsell') ? currency : number}
          />
        ))}
      </div>

      {!isMesero && (
        <>
          <div className="grid-2" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="card">
              <div className="card-header"><h3 className="card-title">Tendencia de ventas</h3></div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={tendencia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [currency(v), 'Ventas']} />
                  <Line type="monotone" dataKey="ventas" stroke="var(--color-brand)" strokeWidth={2} dot={{ fill: 'var(--color-brand)', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="card-header"><h3 className="card-title">Órdenes por mes</h3></div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={tendencia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => [number(v), 'Órdenes']} />
                  <Bar dataKey="ordenes" fill="var(--color-blue-500)" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Métricas por mesero</h3>
              <Link to="/metrics/history" className="btn btn-ghost btn-sm">Historial →</Link>
            </div>
            <DataTable columns={columns} data={meserosData} searchable searchPlaceholder="Buscar mesero..." />
          </div>
        </>
      )}
    </div>
  )
}
