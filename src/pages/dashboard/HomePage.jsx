import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import { Icon, icons } from '../../components/layout/Sidebar'
import { useAuthStore } from '../../store/auth.store'
import { ROUTES, isHiddenRoute } from '../../constants/routes'
import { PERMISSIONS } from '../../constants/permissions'
import { useLoader } from '../../hooks/useLoader'
import { getDaySummary } from '../../services/metrics.service'
import { ESTADOS_ROL } from '../../services/roster.service'
import { today } from '../../utils/dates'
import { date, number } from '../../utils/formatters'
import './home.css'

/* Quick-access cards: one per screen the user can open. */
const SHORTCUTS = [
  { to: ROUTES.ROSTER,    icon: 'roster',    title: 'Rol diario', text: 'Quién atiende cada estación, conflictos y publicación.', permission: PERMISSIONS.VIEW_ROSTER },
  { to: ROUTES.HOSTESS,   icon: 'hostess',   title: 'Hostess',    text: 'Llegadas, mapa de mesas y lista de espera.', permission: PERMISSIONS.HOSTESS_DESK },
  { to: ROUTES.SCHEDULES, icon: 'schedules', title: 'Horarios',   text: 'Turnos de la semana por persona.', permission: PERMISSIONS.VIEW_SCHEDULES },
  { to: ROUTES.STAFF,     icon: 'staff',     title: 'Personal',   text: 'Colaboradores, disponibilidad y restricciones.', permission: PERMISSIONS.VIEW_STAFF },
  { to: ROUTES.CLOSING,   icon: 'closing',   title: 'Cierre',     text: 'Propuesta de reparto del fondo y autorización.', permission: PERMISSIONS.VIEW_CLOSING },
  { to: ROUTES.SURVEYS,   icon: 'surveys',   title: 'Encuestas',  text: 'Captura y resultados de satisfacción.', permission: PERMISSIONS.CAPTURE_SURVEYS },
  { to: ROUTES.METRICS,   icon: 'metrics',   title: 'Métricas',   text: 'Comensales, carga por mesero y tendencias.', permission: PERMISSIONS.VIEW_METRICS },
  { to: ROUTES.ALERTS,    icon: 'alerts',    title: 'Alertas',    text: 'Avisos de la operación para tu perfil.', permission: PERMISSIONS.VIEW_ALERTS },
  { to: ROUTES.ABSENCES,  icon: 'absences',  title: 'Ausencias',  text: 'Vacaciones, permisos e incapacidades.', permission: PERMISSIONS.MANAGE_SCHEDULES },
  { to: ROUTES.FLOOR,     icon: 'floor',     title: 'Local',      text: 'Áreas, estaciones, mesas y su estado.', permission: PERMISSIONS.MANAGE_FLOOR },
  { to: ROUTES.ACCOUNTS,  icon: 'users',     title: 'Usuarios',   text: 'Accesos, perfiles y permisos.', permission: PERMISSIONS.MANAGE_USERS },
  { to: ROUTES.DEVICES,   icon: 'devices',   title: 'Dispositivos', text: 'Tablets de recepción y encuestas.', permission: PERMISSIONS.MANAGE_DEVICES },
  { to: ROUTES.AUDIT,     icon: 'audit',     title: 'Auditoría',  text: 'Quién cambió qué y cuándo.', permission: PERMISSIONS.VIEW_AUDIT },
]

const MANAGERS = ['admin', 'gerente', 'supervisor', 'capitan']

/* Home for every profile: a banner with today's shift, quick access to the
   screens the profile can open and, for management, today's numbers. */
export default function HomePage() {
  const { user, hasPermission } = useAuthStore()
  const isManager = MANAGERS.includes(user?.rol)
  const load = useCallback(() => (isManager ? getDaySummary(today()) : null), [isManager])
  const { data, error } = useLoader(load)
  const s = data && !Array.isArray(data) ? data : null

  const shortcuts = SHORTCUTS.filter((c) => !isHiddenRoute(c.to) && hasPermission(c.permission))
  const cta = hasPermission(PERMISSIONS.MANAGE_ROSTER)
    ? { to: ROUTES.ROSTER, label: 'Preparar rol del día' }
    : hasPermission(PERMISSIONS.HOSTESS_DESK)
      ? { to: ROUTES.HOSTESS, label: 'Abrir recepción' }
      : hasPermission(PERMISSIONS.VIEW_METRICS)
        ? { to: ROUTES.METRICS, label: 'Ver mis indicadores' }
        : { to: ROUTES.ROSTER, label: 'Ver el rol del día' }

  const roles = s?.roles ?? []

  return (
    <div>
      <section className="home-hero" aria-label="Panel de operación">
        <div className="home-hero-main">
          <span className="home-eyebrow">{user?.restaurante ?? 'OmniRest'}</span>
          <h1 className="home-title">Panel de operación</h1>
          <Link to={cta.to} className="btn btn-primary btn-lg">{cta.label} →</Link>
        </div>
        <div className="home-today">
          <h2 className="home-today-title">Jornada de hoy</h2>
          <p className="home-today-date">{date(today())}</p>
          {!isManager ? (
            <p className="home-today-text">Consulta en el rol diario tu estación y tu turno.</p>
          ) : error ? (
            <p className="home-today-text">No se pudo cargar el estado del día.</p>
          ) : roles.length === 0 ? (
            <p className="home-today-text">Todavía no hay rol para hoy.</p>
          ) : (
            <ul className="home-today-roles">
              {roles.map((r) => (
                <li key={r.turno}>
                  <span>{r.turno}</span>
                  <Badge variant={ESTADOS_ROL[r.estado]?.variant}>{ESTADOS_ROL[r.estado]?.label}</Badge>
                  {r.conflictos > 0 && <span className="home-today-warn">{r.conflictos} {r.conflictos === 1 ? 'conflicto' : 'conflictos'}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className={isManager ? 'home-grid' : ''}>
        <section aria-label="Accesos rápidos">
          <h2 className="section-title">Accesos rápidos</h2>
          <div className="home-shortcuts">
            {shortcuts.map((c) => (
              <Link key={c.to} to={c.to} className="home-shortcut">
                <span className="home-shortcut-icon"><Icon d={icons[c.icon]} size={20} /></span>
                <span className="home-shortcut-body">
                  <span className="home-shortcut-title">{c.title}</span>
                  <span className="home-shortcut-text">{c.text}</span>
                </span>
                <span className="home-shortcut-arrow" aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        </section>

        {isManager && (
          <aside className="card home-side" aria-label="Operación de hoy">
            <div className="home-side-head">
              <h2 className="section-title" style={{ margin: 0 }}>Hoy</h2>
              <Link to={ROUTES.HOSTESS} className="btn btn-secondary btn-sm">Ver recepción</Link>
            </div>
            <dl className="home-stats">
              <div><dt>Comensales atendidos</dt><dd>{s ? number(s.comensales, 1) : '—'}</dd></div>
              <div><dt>Mesas ocupadas</dt><dd>{s?.mesas_ocupadas ?? '—'}</dd></div>
              <div><dt>En lista de espera</dt><dd>{s?.en_espera ?? '—'}</dd></div>
              <div><dt>Satisfacción (1 a 5)</dt><dd>{s?.satisfaccion == null ? '—' : number(s.satisfaccion, 2)}</dd></div>
              <div><dt>Encuestas</dt><dd>{s?.encuestas ?? '—'}</dd></div>
            </dl>
          </aside>
        )}
      </div>
    </div>
  )
}
