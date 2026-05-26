import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { currency, number } from '../../utils/formatters'

const periodos = ['Semana', 'Mes', 'Trimestre']

const ranking = [
  { pos: 1,  nombre: 'Diego Ruiz',     restaurante: 'Suc. Centro',  ventas: 48200, ordenes: 312, ticket: 154, progreso: 100 },
  { pos: 2,  nombre: 'María González', restaurante: 'Suc. Centro',  ventas: 44100, ordenes: 288, ticket: 153, progreso: 91 },
  { pos: 3,  nombre: 'Carlos Herrera', restaurante: 'Suc. Norte',   ventas: 41800, ordenes: 270, ticket: 155, progreso: 87 },
  { pos: 4,  nombre: 'Ana Martínez',   restaurante: 'Suc. Sur',     ventas: 39600, ordenes: 256, ticket: 155, progreso: 82 },
  { pos: 5,  nombre: 'Roberto Lima',   restaurante: 'Suc. Norte',   ventas: 37900, ordenes: 244, ticket: 155, progreso: 79 },
  { pos: 6,  nombre: 'Laura Torres',   restaurante: 'Suc. Poniente',ventas: 36100, ordenes: 232, ticket: 156, progreso: 75 },
  { pos: 7,  nombre: 'Miguel Vargas',  restaurante: 'Suc. Sur',     ventas: 34500, ordenes: 221, ticket: 156, progreso: 72 },
  { pos: 8,  nombre: 'Sofía Ramos',    restaurante: 'Suc. Centro',  ventas: 32900, ordenes: 210, ticket: 157, progreso: 68 },
]

const podiumColors = ['#FFD700','#C0C0C0','#CD7F32']
const podiumBg     = ['#FEF9C3','#F3F4F6','#FEF3C7']

export default function RankingGeneral() {
  const [periodo, setPeriodo] = useState('Mes')
  const [vista, setVista] = useState('lista')

  const top3 = ranking.slice(0, 3)
  const resto = ranking.slice(3)

  const barData = ranking.map((r) => ({ nombre: r.nombre.split(' ')[0], ventas: r.ventas }))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rankings</h1>
          <p className="page-subtitle">Clasificación de meseros por rendimiento</p>
        </div>
        <div className="page-actions">
          <div className="tabs" style={{ border: 'none', marginBottom: 0 }}>
            {periodos.map((p) => (
              <button key={p} className={`tab-btn ${periodo === p ? 'active' : ''}`} onClick={() => setPeriodo(p)}>{p}</button>
            ))}
          </div>
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {[['lista','☰'],['grafica','📊']].map(([v, ico]) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                style={{
                  padding: '0.4rem 0.75rem', background: vista === v ? 'var(--color-navy-100)' : 'transparent',
                  border: 'none', cursor: 'pointer', fontWeight: vista === v ? 600 : 400,
                }}
              >
                {ico}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Podio top 3 */}
      <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
        <h3 className="card-title" style={{ marginBottom: 'var(--space-5)' }}>🏆 Top 3 del {periodo}</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 'var(--space-4)', paddingBottom: 'var(--space-4)' }}>
          {[top3[1], top3[0], top3[2]].filter(Boolean).map((m, idx) => {
            const realPos = idx === 0 ? 2 : idx === 1 ? 1 : 3
            const height = realPos === 1 ? 120 : realPos === 2 ? 90 : 75
            return (
              <div key={m.nombre} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div className="ranking-avatar" style={{ width: 48, height: 48, fontSize: 18, background: podiumBg[realPos-1] }}>{m.nombre.split(' ').map(w=>w[0]).join('')}</div>
                <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)', textAlign: 'center', maxWidth: 80 }}>{m.nombre.split(' ')[0]}</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{currency(m.ventas)}</p>
                <div style={{ width: 80, height, background: podiumColors[realPos-1], borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 24, fontWeight: 800 }}>{realPos}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Lista o gráfica */}
      {vista === 'lista' ? (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Clasificación completa</h3>
          <div className="ranking-list">
            {ranking.map((m) => (
              <div key={m.nombre} className="ranking-item" style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border-color)' }}>
                <div className={`ranking-position rank-${m.pos <= 3 ? m.pos : 'other'}`}>{m.pos}</div>
                <div className="ranking-avatar">{m.nombre.split(' ').map(w=>w[0]).join('')}</div>
                <div className="ranking-info">
                  <p className="ranking-name">{m.nombre}</p>
                  <p className="ranking-meta">{m.restaurante} · {m.ordenes} órdenes</p>
                  <div className="progress-bar-wrap" style={{ marginTop: 4, maxWidth: 160 }}>
                    <div className="progress-bar-fill" style={{ width: `${m.progreso}%`, background: m.pos === 1 ? 'var(--color-green-500)' : 'var(--color-brand)' }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p className="ranking-score">{currency(m.ventas)}</p>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>ticket {currency(m.ticket)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Ventas comparativas</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="nombre" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [currency(v), 'Ventas']} />
              <Bar dataKey="ventas" radius={[4,4,0,0]}
                fill="var(--color-brand)"
                label={{ position: 'top', fontSize: 10, fill: 'var(--text-secondary)', formatter: (v) => `$${(v/1000).toFixed(0)}k` }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'flex-end' }}>
        <Link to="/rankings/history" className="btn btn-ghost btn-sm">Ver historial de rankings →</Link>
      </div>
    </div>
  )
}
