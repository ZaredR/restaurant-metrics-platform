import { useCallback, useState } from 'react'
import Badge from '../../components/ui/Badge'
import Alert from '../../components/ui/Alert'
import ExportButton from '../../components/ui/ExportButton'
import { useLoader } from '../../hooks/useLoader'
import { listAudit, listExports } from '../../services/export.service'
import { today, addDays } from '../../utils/dates'
import { datetime } from '../../utils/formatters'

/* Real audit trail (contextualización, sección 11). Replaces the sample logs of
   the previous version. Only admin can read it (RLS). */

const TABLAS = {
  empleados: 'Personal', usuarios: 'Usuarios', invitaciones: 'Invitaciones', ausencias: 'Ausencias',
  horarios: 'Horarios', empleado_restricciones: 'Restricciones', empleado_autorizaciones: 'Áreas permitidas',
  turnos: 'Turnos', areas: 'Áreas', estaciones: 'Estaciones', mesas: 'Mesas',
  roles_diarios: 'Rol diario', rol_asignaciones: 'Asignaciones del rol', visitas: 'Visitas',
  cierres: 'Cierre', cierre_participantes: 'Montos del cierre', encuestas: 'Encuestas', preguntas: 'Preguntas',
  reglas_alerta: 'Reglas de alerta', alertas: 'Alertas', configuracion: 'Configuración',
}
const ACCIONES = { INSERT: { label: 'Alta', variant: 'success' }, UPDATE: { label: 'Cambio', variant: 'info' }, DELETE: { label: 'Baja', variant: 'danger' } }
const IGNORE = new Set(['created_at', 'updated_at'])

/* "campo: antes → después" for the fields that changed. */
const changes = (r) => {
  if (r.accion !== 'UPDATE') {
    const row = r.despues ?? r.antes ?? {}
    return row.nombre ?? row.nombre_referencia ?? row.mensaje ?? row.email ?? ''
  }
  return Object.keys(r.despues ?? {})
    .filter((k) => !IGNORE.has(k) && JSON.stringify(r.antes?.[k]) !== JSON.stringify(r.despues[k]))
    .map((k) => `${k}: ${r.antes?.[k] ?? '—'} → ${r.despues[k] ?? '—'}`)
    .join(' · ')
}

export default function Audit() {
  const [tab, setTab] = useState('cambios')
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Auditoría</h1>
          <p className="page-subtitle">Quién cambió qué y cuándo, y qué datos se exportaron.</p>
        </div>
      </div>
      <div className="tabs">
        <button className={`tab-btn ${tab === 'cambios' ? 'active' : ''}`} onClick={() => setTab('cambios')}>Cambios</button>
        <button className={`tab-btn ${tab === 'exportaciones' ? 'active' : ''}`} onClick={() => setTab('exportaciones')}>Exportaciones</button>
      </div>
      {tab === 'cambios' ? <ChangesTab /> : <ExportsTab />}
    </div>
  )
}

function ChangesTab() {
  const [tabla, setTabla] = useState('')
  const [desde, setDesde] = useState(addDays(today(), -6))
  const [hasta, setHasta] = useState(today())
  const load = useCallback(() => listAudit({ tabla, desde, hasta }), [tabla, desde, hasta])
  const { data: rows, loading, error } = useLoader(load)

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
        <select className="form-select" value={tabla} onChange={(e) => setTabla(e.target.value)} aria-label="Módulo" style={{ maxWidth: 220 }}>
          <option value="">Todos los módulos</option>
          {Object.entries(TABLAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input className="form-input" type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} aria-label="Desde" style={{ maxWidth: 170 }} />
        <input className="form-input" type="date" value={hasta} min={desde} onChange={(e) => e.target.value && setHasta(e.target.value)} aria-label="Hasta" style={{ maxWidth: 170 }} />
        <span style={{ marginLeft: 'auto' }}>
          <ExportButton disabled={!rows.length} getExport={() => ({
            tipo: 'auditoria', filtros: { tabla: tabla || null, desde, hasta }, rows, filename: `auditoria_${desde}_${hasta}`,
            columns: [
              { header: 'Fecha', value: (r) => r.created_at }, { header: 'Usuario', value: (r) => r.usuario_nombre ?? 'Sistema' },
              { header: 'Módulo', value: (r) => TABLAS[r.tabla] ?? r.tabla }, { header: 'Acción', value: (r) => ACCIONES[r.accion]?.label },
              { header: 'Registro', value: (r) => r.registro_id }, { header: 'Detalle', value: changes },
            ],
          })} />
        </span>
      </div>
      {error && <Alert type="danger" title="No se pudo cargar la auditoría">{error}</Alert>}
      {loading && !rows.length ? <div className="loading-screen"><div className="spinner" /></div> : rows.length === 0 ? (
        <p className="text-sm text-muted">Sin cambios registrados con estos filtros.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Módulo</th><th>Acción</th><th>Detalle</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{datetime(r.created_at)}</td>
                  <td>{r.usuario_nombre ?? <span className="text-muted">Sistema</span>}</td>
                  <td>{TABLAS[r.tabla] ?? r.tabla}</td>
                  <td><Badge variant={ACCIONES[r.accion]?.variant}>{ACCIONES[r.accion]?.label ?? r.accion}</Badge></td>
                  <td className="text-sm" style={{ maxWidth: 520, overflowWrap: 'anywhere' }}>{changes(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-muted" style={{ marginTop: 'var(--space-3)' }}>
        Se muestran hasta 500 cambios. "Sistema" = cambios hechos desde el SQL Editor o por reglas automáticas.
      </p>
    </div>
  )
}

function ExportsTab() {
  const { data: rows, loading, error } = useLoader(listExports)
  return (
    <div className="card">
      {error && <Alert type="danger">{error}</Alert>}
      {loading && !rows.length ? <div className="loading-screen"><div className="spinner" /></div> : rows.length === 0 ? (
        <p className="text-sm text-muted">Nadie ha exportado datos todavía.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Fecha</th><th>Quién</th><th>Qué</th><th style={{ textAlign: 'right' }}>Filas</th><th>Filtros</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{datetime(r.created_at)}</td>
                  <td>{r.usuario_nombre ?? '—'}</td>
                  <td>{r.tipo}</td>
                  <td style={{ textAlign: 'right' }}>{r.filas}</td>
                  <td className="text-sm">{r.filtros ? Object.entries(r.filtros).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(' · ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
