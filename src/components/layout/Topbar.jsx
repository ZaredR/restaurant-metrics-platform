import { useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import Avatar from '../ui/Avatar'

const routeLabels = {
  '/dashboard':   'Dashboard',
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
}

export default function Topbar({ collapsed }) {
  const { pathname } = useLocation()
  const { user } = useAuthStore()

  const base = '/' + pathname.split('/')[1]
  const label = routeLabels[base] ?? 'Inicio'

  return (
    <header className={`topbar ${collapsed ? 'collapsed' : ''}`}>
      <div className="topbar-left">
        <div className="topbar-breadcrumb">
          <span>Inicio</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span className="topbar-breadcrumb-current">{label}</span>
        </div>
      </div>

      <div className="topbar-right">
        {user?.restaurante && (
          <div className="topbar-restaurant">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            {user.restaurante}
          </div>
        )}

        <button className="topbar-icon-btn" title="Notificaciones">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span className="topbar-badge" />
        </button>

        <button className="topbar-avatar-btn">
          <Avatar name={user?.nombre ?? 'Usuario'} size="sm" />
          <span className="topbar-avatar-name">{user?.nombre?.split(' ')[0]}</span>
        </button>
      </div>
    </header>
  )
}
