import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import { useAuthStore } from '../../store/auth.store'
import { ROUTES } from '../../constants/routes'
import { useLoader } from '../../hooks/useLoader'
import { getDaySummary } from '../../services/metrics.service'
import { ESTADOS_ROL } from '../../services/roster.service'
import { today } from '../../utils/dates'
import { number } from '../../utils/formatters'

const ROLES_WITH_SUMMARY = ['admin', 'gerente', 'supervisor', 'capitan']

/* Real numbers of today's operation, shown above the existing dashboard. */
export default function TodaySummary() {
  const { user } = useAuthStore()
  const allowed = ROLES_WITH_SUMMARY.includes(user?.rol)
  const load = useCallback(() => (allowed ? getDaySummary(today()) : null), [allowed])
  const { data, loading, error } = useLoader(load)

  if (!allowed) return null
  const s = Array.isArray(data) ? null : data

  const tile = (label, value, to) => (
    <div className="card">
      <p className="text-sm text-muted">{label}</p>
      <h3>{loading && !s ? '…' : value}</h3>
      {to && <Link to={to} className="text-sm">Ver →</Link>}
    </div>
  )

  return (
    <section style={{ marginBottom: 'var(--space-6)' }} aria-label="Operación de hoy">
      <h2 className="section-title">Hoy</h2>
      {error ? (
        <p className="text-sm text-muted">No se pudo cargar la operación de hoy: {error}</p>
      ) : (
        <>
          <div className="grid-kpi" style={{ marginBottom: 'var(--space-3)' }}>
            {tile('Comensales atendidos', number(s?.comensales, 1), ROUTES.METRICS)}
            {tile('Mesas ocupadas', s?.mesas_ocupadas ?? 0, ROUTES.HOSTESS)}
            {tile('En lista de espera', s?.en_espera ?? 0, ROUTES.HOSTESS)}
            {tile('Satisfacción (1 a 5)', s?.satisfaccion == null ? '—' : `${number(s.satisfaccion, 2)} · ${s.encuestas} enc.`, ROUTES.SURVEYS)}
          </div>
          <div className="card" style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
            <strong className="text-sm">Rol del día:</strong>
            {(s?.roles ?? []).length === 0 && <span className="text-sm text-muted">No hay rol para hoy.</span>}
            {(s?.roles ?? []).map((r) => (
              <span key={r.turno} className="text-sm" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                {r.turno}
                <Badge variant={ESTADOS_ROL[r.estado]?.variant}>{ESTADOS_ROL[r.estado]?.label}</Badge>
                {r.conflictos > 0
                  ? <Badge variant={r.bloqueos > 0 ? 'danger' : 'warning'}>{r.conflictos} {r.conflictos === 1 ? 'conflicto' : 'conflictos'}</Badge>
                  : <span className="text-muted">sin conflictos</span>}
              </span>
            ))}
            <Link to={ROUTES.ROSTER} className="text-sm" style={{ marginLeft: 'auto' }}>Ir al rol →</Link>
          </div>
        </>
      )}
    </section>
  )
}
