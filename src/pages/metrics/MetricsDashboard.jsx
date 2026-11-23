import { useCallback, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import Alert from '../../components/ui/Alert'
import Badge from '../../components/ui/Badge'
import ExportButton from '../../components/ui/ExportButton'
import { useLoader } from '../../hooks/useLoader'
import { getIndicators } from '../../services/metrics.service'
import { tipoAusenciaLabel } from '../../services/absences.service'
import { today, addDays } from '../../utils/dates'
import { number, percent, date } from '../../utils/formatters'

/* Operational indicators (contextualización, sección 8). Replaces the sample
   sales of the previous version; the database decides what each profile sees. */

const RANGES = [
  { key: 'hoy', label: 'Hoy', days: 0 },
  { key: '7', label: '7 días', days: 6 },
  { key: '30', label: '30 días', days: 29 },
  { key: '90', label: '90 días', days: 89 },
]

// One series per chart, one hue (magnitude); grid and axes stay recessive.
const SERIES = 'var(--color-blue-500)'
const axis = { fontSize: 12, fill: 'var(--text-secondary)' }
const grid = <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
const shortDate = (s) => s.slice(8, 10) + '/' + s.slice(5, 7)
const scoreVariant = (v) => (v == null ? 'neutral' : v < 3 ? 'danger' : v < 4 ? 'warning' : 'success')

function Tile({ label, value, hint }) {
  return (
    <div className="card">
      <p className="text-sm text-muted">{label}</p>
      <h3>{value}</h3>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  )
}

/* Horizontal bars for a ranked magnitude (areas, waiters). */
function RankBars({ data, dataKey, nameKey, label, height }) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, data.length * 36 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={8}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" horizontal={false} />
        <XAxis type="number" tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey={nameKey} tick={{ ...axis, fill: 'var(--text-primary)' }} axisLine={false} tickLine={false} width={120} />
        <Tooltip cursor={{ fill: 'var(--color-navy-50)' }} formatter={(v) => [number(v, 1), label]} />
        <Bar dataKey={dataKey} name={label} fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function MetricsDashboard() {
  const [range, setRange] = useState('7')
  const [hasta, setHasta] = useState(today())
  const [desde, setDesde] = useState(addDays(today(), -6))
  const pick = (r) => {
    setRange(r.key)
    setHasta(today())
    setDesde(addDays(today(), -r.days))
  }

  const load = useCallback(() => getIndicators(desde, hasta), [desde, hasta])
  const { data, loading, error } = useLoader(load)
  const ind = Array.isArray(data) ? null : data
  const own = ind?.alcance === 'propio'
  const r = ind?.resumen ?? {}
  const turnos = (ind?.por_turno ?? []).reduce((s, t) => s + Number(t.roles), 0)
  const porDia = (ind?.por_dia ?? []).map((d) => ({ ...d, comensales: Number(d.comensales), dia: shortDate(d.fecha) }))
  const rol = ind?.rol
  const sat = ind?.satisfaccion

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Métricas</h1>
          <p className="page-subtitle">
            {own ? 'Tus indicadores' : 'Indicadores de la operación'} · {desde === hasta ? date(desde) : `${date(desde)} al ${date(hasta)}`}
          </p>
        </div>
        <div className="page-actions" style={{ flexWrap: 'wrap' }}>
          <div className="tabs" style={{ margin: 0 }} role="group" aria-label="Periodo">
            {RANGES.map((x) => (
              <button key={x.key} className={`tab-btn ${range === x.key ? 'active' : ''}`} onClick={() => pick(x)}>{x.label}</button>
            ))}
          </div>
          <input className="form-input" type="date" value={desde} max={hasta} aria-label="Desde" style={{ maxWidth: 160 }}
            onChange={(e) => { if (e.target.value) { setRange(''); setDesde(e.target.value) } }} />
          <input className="form-input" type="date" value={hasta} min={desde} aria-label="Hasta" style={{ maxWidth: 160 }}
            onChange={(e) => { if (e.target.value) { setRange(''); setHasta(e.target.value) } }} />
        </div>
      </div>

      {error && <Alert type="danger" title="No se pudieron cargar los indicadores">{error}</Alert>}
      {!error && loading && !ind && <div className="loading-screen"><div className="spinner spinner-lg" /></div>}

      {ind && (
        <>
          <div className="grid-kpi" style={{ marginBottom: 'var(--space-4)' }}>
            <Tile label="Comensales atendidos" value={number(r.comensales, 1)} hint={`${r.adultos ?? 0} adultos · ${r.ninos ?? 0} niños (0.5 c/u)`} />
            <Tile label="Mesas atendidas" value={number(r.visitas)} />
            {own
              ? <Tile label="Comensales por turno" value={turnos ? number(r.comensales / turnos, 1) : '—'} hint={`${turnos} ${turnos === 1 ? 'turno' : 'turnos'} con mesas`} />
              : <Tile label="Espera promedio" value={r.espera_min == null ? '—' : `${number(r.espera_min, 1)} min`} hint="De la llegada a sentarse" />}
            {own
              ? <Tile label="Estancia promedio" value={r.estancia_min == null ? '—' : `${number(r.estancia_min, 0)} min`} />
              : <Tile label="Satisfacción (1 a 5)" value={sat?.promedio == null ? '—' : number(sat.promedio, 2)} hint={`${sat?.encuestas ?? 0} encuestas · ${sat?.bajas ?? 0} bajas`} />}
          </div>

          <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <h3 className="section-title">Comensales por día</h3>
              <ExportButton disabled={!porDia.length} getExport={() => ({
                tipo: 'indicadores_por_dia', filtros: { desde, hasta }, rows: porDia, filename: `comensales_por_dia_${desde}_${hasta}`,
                columns: [{ header: 'Fecha', value: (d) => d.fecha }, { header: 'Mesas', value: (d) => d.visitas }, { header: 'Comensales', value: (d) => d.comensales }],
              })} />
            </div>
            {porDia.length === 0 ? <p className="text-sm text-muted">Sin visitas en este periodo.</p> : (
              <ResponsiveContainer width="100%" height={220}>
                {porDia.length === 1 ? (
                  <BarChart data={porDia} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    {grid}
                    <XAxis dataKey="dia" tick={axis} axisLine={false} tickLine={false} />
                    <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'var(--color-navy-50)' }} formatter={(v) => [number(v, 1), 'Comensales']} />
                    <Bar dataKey="comensales" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                ) : (
                  <LineChart data={porDia} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    {grid}
                    <XAxis dataKey="dia" tick={axis} axisLine={false} tickLine={false} />
                    <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip formatter={(v) => [number(v, 1), 'Comensales']} labelFormatter={(l) => `Día ${l}`} />
                    <Line type="monotone" dataKey="comensales" stroke={SERIES} strokeWidth={2} dot={{ r: 4, fill: SERIES }} activeDot={{ r: 6 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            )}
          </div>

          <div className={own ? '' : 'grid-2'} style={{ marginBottom: 'var(--space-4)' }}>
            <div className="card">
              <h3 className="section-title">Por turno</h3>
              <div style={{ overflowX: 'auto' }}><table className="data-table">
                <thead><tr><th>Turno</th><th style={{ textAlign: 'right' }}>Turnos</th><th style={{ textAlign: 'right' }}>Mesas</th><th style={{ textAlign: 'right' }}>Comensales</th></tr></thead>
                <tbody>
                  {(ind.por_turno ?? []).map((t) => (
                    <tr key={t.turno}><td>{t.turno}</td><td style={{ textAlign: 'right' }}>{t.roles}</td><td style={{ textAlign: 'right' }}>{t.visitas}</td><td style={{ textAlign: 'right' }}>{number(t.comensales, 1)}</td></tr>
                  ))}
                  {(ind.por_turno ?? []).length === 0 && <tr><td colSpan={4} className="text-sm text-muted">Sin datos.</td></tr>}
                </tbody>
              </table></div>
            </div>

            {!own && (
              <div className="card">
                <h3 className="section-title">Comensales por área</h3>
                {(ind.por_area ?? []).length === 0 ? <p className="text-sm text-muted">Sin datos.</p> : (
                  <>
                    <RankBars data={ind.por_area.map((a) => ({ ...a, comensales: Number(a.comensales) }))} dataKey="comensales" nameKey="area" label="Comensales" />
                    <div style={{ overflowX: 'auto', marginTop: 'var(--space-3)' }}><table className="data-table">
                      <thead><tr><th>Área</th><th style={{ textAlign: 'right' }}>Mesas</th><th style={{ textAlign: 'right' }}>Comensales</th><th style={{ textAlign: 'right' }}>Satisfacción</th></tr></thead>
                      <tbody>
                        {ind.por_area.map((a) => (
                          <tr key={a.area}>
                            <td>{a.area}</td><td style={{ textAlign: 'right' }}>{a.visitas}</td><td style={{ textAlign: 'right' }}>{number(a.comensales, 1)}</td>
                            <td style={{ textAlign: 'right' }}>{a.satisfaccion == null ? '—' : <Badge variant={scoreVariant(a.satisfaccion)}>{number(a.satisfaccion, 2)}</Badge>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  </>
                )}
              </div>
            )}
          </div>

          {!own && (
            <>
              <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <h3 className="section-title">Carga por mesero</h3>
                  <ExportButton disabled={!(ind.por_mesero ?? []).length} getExport={() => ({
                    tipo: 'indicadores_por_mesero', filtros: { desde, hasta }, rows: ind.por_mesero, filename: `carga_por_mesero_${desde}_${hasta}`,
                    columns: [
                      { header: 'Mesero', value: (m) => m.mesero }, { header: 'Turnos', value: (m) => m.turnos },
                      { header: 'Mesas', value: (m) => m.visitas }, { header: 'Comensales', value: (m) => m.comensales },
                      { header: 'Comensales por turno', value: (m) => m.comensales_por_turno },
                      { header: 'Satisfacción', value: (m) => m.satisfaccion }, { header: 'Mesas recibidas', value: (m) => m.mesas_recibidas },
                    ],
                  })} />
                </div>
                {(ind.por_mesero ?? []).length === 0 ? <p className="text-sm text-muted">Sin meseros en roles publicados.</p> : (
                  <div>
                    <RankBars data={ind.por_mesero.map((m) => ({ ...m, comensales: Number(m.comensales) }))} dataKey="comensales" nameKey="mesero" label="Comensales" />
                    <div style={{ overflowX: 'auto', marginTop: 'var(--space-3)' }}><table className="data-table">
                      <thead><tr><th>Mesero</th><th style={{ textAlign: 'right' }}>Turnos</th><th style={{ textAlign: 'right' }}>Mesas</th><th style={{ textAlign: 'right' }}>Com./turno</th><th style={{ textAlign: 'right' }}>Satisf.</th><th style={{ textAlign: 'right' }}>Recibidas</th></tr></thead>
                      <tbody>
                        {ind.por_mesero.map((m) => (
                          <tr key={m.empleado_id}>
                            <td>{m.mesero}</td>
                            <td style={{ textAlign: 'right' }}>{m.turnos}</td>
                            <td style={{ textAlign: 'right' }}>{m.visitas}</td>
                            <td style={{ textAlign: 'right' }}>{number(m.comensales_por_turno, 1)}</td>
                            <td style={{ textAlign: 'right' }}>{m.satisfaccion == null ? '—' : <Badge variant={scoreVariant(m.satisfaccion)}>{number(m.satisfaccion, 2)}</Badge>}</td>
                            <td style={{ textAlign: 'right' }} title="Mesas que recibió por reasignación">{m.mesas_recibidas}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  </div>
                )}
              </div>

              <div className="grid-2" style={{ marginBottom: 'var(--space-4)' }}>
                <div className="card">
                  <h3 className="section-title">Rol publicado vs. ejecutado</h3>
                  <div style={{ overflowX: 'auto' }}><table className="data-table">
                    <tbody>
                      <tr><td>Roles publicados</td><td style={{ textAlign: 'right' }}>{rol.publicados}</td></tr>
                      <tr><td>Roles con cambios después de publicar</td><td style={{ textAlign: 'right' }}>
                        {rol.modificados}{rol.publicados ? ` (${percent((rol.modificados / rol.publicados) * 100, 0)})` : ''}
                      </td></tr>
                      <tr><td>Ajustes al rol (con motivo)</td><td style={{ textAlign: 'right' }}>{rol.ajustes}</td></tr>
                      <tr><td>Asignaciones con excepción</td><td style={{ textAlign: 'right' }}>{rol.excepciones}</td></tr>
                      <tr><td>Mesas reasignadas a otro mesero</td><td style={{ textAlign: 'right' }}>{rol.reasignaciones}</td></tr>
                      <tr><td>Clientes cambiados de mesa (otro mesero)</td><td style={{ textAlign: 'right' }}>{rol.cambios_mesa}</td></tr>
                    </tbody>
                  </table></div>
                </div>
                <div className="card">
                  <h3 className="section-title">Incidencias de disponibilidad</h3>
                  {(ind.ausencias ?? []).length === 0 ? <p className="text-sm text-muted">Sin ausencias aprobadas en este periodo.</p> : (
                    <div style={{ overflowX: 'auto' }}><table className="data-table">
                      <thead><tr><th>Tipo</th><th style={{ textAlign: 'right' }}>Personas</th><th style={{ textAlign: 'right' }}>Días-persona</th></tr></thead>
                      <tbody>
                        {ind.ausencias.map((a) => (
                          <tr key={a.tipo}><td>{tipoAusenciaLabel(a.tipo)}</td><td style={{ textAlign: 'right' }}>{a.personas}</td><td style={{ textAlign: 'right' }}>{a.dias}</td></tr>
                        ))}
                      </tbody>
                    </table></div>
                  )}
                </div>
              </div>

              <div className="card">
                <h3 className="section-title">Distribución por estación</h3>
                <div style={{ overflowX: 'auto' }}><table className="data-table">
                  <thead><tr><th>Estación</th><th>Área</th><th style={{ textAlign: 'right' }}>Mesas</th><th style={{ textAlign: 'right' }}>Comensales</th></tr></thead>
                  <tbody>
                    {(ind.por_estacion ?? []).map((e) => (
                      <tr key={e.estacion}><td>{e.estacion}</td><td>{e.area}</td><td style={{ textAlign: 'right' }}>{e.visitas}</td><td style={{ textAlign: 'right' }}>{number(e.comensales, 1)}</td></tr>
                    ))}
                    {(ind.por_estacion ?? []).length === 0 && <tr><td colSpan={4} className="text-sm text-muted">Sin datos.</td></tr>}
                  </tbody>
                </table></div>
              </div>
            </>
          )}
          {own && <p className="text-sm text-muted">Solo ves tus propios números. Los resultados de encuestas los consulta gerencia.</p>}
        </>
      )}
    </div>
  )
}
