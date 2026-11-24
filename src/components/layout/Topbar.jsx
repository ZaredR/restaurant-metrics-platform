import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { ROUTES } from '../../constants/routes'
import { ROLE_LABELS } from '../../constants/roles'
import { PERMISSIONS } from '../../constants/permissions'
import { logout as serviceLogout } from '../../services/auth.service'
import AlertsBell from './AlertsBell'

const routeLabels = {
  '/dashboard':   'Inicio',
  '/restaurants': 'Restaurantes',
  '/users':       'Usuarios',
  '/reports':     'Reportes',
  '/metrics':     'Métricas',
  '/rankings':    'Rankings',
  '/incentives':  'Incentivos',
  '/notices':     'Avisos',
  '/history':     'Historial',
  '/config':      'Configuración',
  '/profile':     'Mi Perfil',
  '/audit':       'Auditoría',
  '/staff':       'Personal',
  '/floor':       'Local',
  '/schedules':   'Horarios',
  '/absences':    'Ausencias',
  '/roster':      'Rol diario',
  '/hostess':     'Hostess',
  '/closing':     'Cierre',
  '/surveys':     'Encuestas',
  '/alerts':      'Alertas',
  '/accounts':    'Usuarios',
  '/devices':     'Dispositivos',
}

/* White bar across the top: menu toggle + brand on the left; alerts, the
   signed-in user and "Cerrar sesión" on the right. */
export default function Topbar({ collapsed, onToggle }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, hasPermission, logout } = useAuthStore()

  const label = routeLabels['/' + pathname.split('/')[1]]
  // The tab title names the screen, e.g. "Rol diario · OmniRest".
  useEffect(() => {
    document.title = label ? `${label} · OmniRest` : 'OmniRest | Gestión Operativa para Restaurantes'
  }, [label])

  const handleLogout = () => {
    if (user?.dispositivo && !window.confirm('Si cierras sesión, esta tablet necesitará un enlace nuevo de gerencia. ¿Salir?')) return
    serviceLogout().catch(() => {})
    logout()
    navigate(ROUTES.LOGIN)
  }

  return (
    <header className={`topbar ${collapsed ? 'collapsed' : ''}`}>
      <div className="topbar-left">
        <button className="topbar-icon-btn" onClick={onToggle} title={collapsed ? 'Mostrar menú' : 'Contraer menú'} aria-label={collapsed ? 'Mostrar menú' : 'Contraer menú'}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16 M4 12h16 M4 18h16" />
          </svg>
        </button>
        <a href={ROUTES.DASHBOARD} className="topbar-brand" onClick={(e) => { e.preventDefault(); navigate(ROUTES.DASHBOARD) }}>
          <img src="/omnirest-icon.png" alt="" className="topbar-brand-icon" />
          <span className="topbar-brand-name">OmniRest</span>
        </a>
      </div>

      <div className="topbar-right">
        {hasPermission(PERMISSIONS.VIEW_ALERTS) && <AlertsBell />}
        {user && (
          <div className="topbar-user" title={user.email}>
            <span className="topbar-user-name">{user.nombre}</span>
            <span className="topbar-user-role">{ROLE_LABELS[user.rol] ?? user.rol}</span>
          </div>
        )}
        <button className="btn btn-secondary topbar-logout" onClick={handleLogout}>Cerrar sesión</button>
      </div>
    </header>
  )
}
