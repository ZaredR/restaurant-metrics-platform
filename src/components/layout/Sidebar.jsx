import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuthStore } from '../../store/auth.store'
import { ROUTES } from '../../constants/routes'
import { PERMISSIONS } from '../../constants/permissions'
import Avatar from '../ui/Avatar'

/* ── Icons (inline SVG, no lib dependency) ─────────── */
const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const icons = {
  dashboard:   'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  restaurants: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  users:       'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75 M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  reports:     'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  metrics:     'M18 20V10 M12 20V4 M6 20v-6',
  rankings:    'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  incentives:  'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  notices:     'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
  history:     'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  config:      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  profile:     'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  audit:       'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  logout:      'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  chevron:     'M15 18l-6-6 6-6',
}

const NAV_GROUPS = [
  {
    label: 'Principal',
    items: [
      { to: ROUTES.DASHBOARD, label: 'Dashboard', icon: 'dashboard', permission: null },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { to: ROUTES.RESTAURANTS, label: 'Restaurantes', icon: 'restaurants', permission: PERMISSIONS.VIEW_RESTAURANTS },
      { to: ROUTES.USERS,       label: 'Usuarios',     icon: 'users',       permission: PERMISSIONS.VIEW_USERS },
      { to: ROUTES.REPORTS,     label: 'Reportes',     icon: 'reports',     permission: PERMISSIONS.UPLOAD_REPORTS },
    ],
  },
  {
    label: 'Rendimiento',
    items: [
      { to: ROUTES.METRICS,    label: 'Métricas',   icon: 'metrics',    permission: null },
      { to: ROUTES.RANKINGS,   label: 'Rankings',   icon: 'rankings',   permission: null },
      { to: ROUTES.INCENTIVES, label: 'Incentivos', icon: 'incentives', permission: null },
      { to: ROUTES.NOTICES,    label: 'Avisos',     icon: 'notices',    permission: null },
      { to: ROUTES.HISTORY,    label: 'Historial',  icon: 'history',    permission: null },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: ROUTES.CONFIG,  label: 'Configuración', icon: 'config',  permission: PERMISSIONS.VIEW_CONFIG },
      { to: ROUTES.PROFILE, label: 'Mi perfil',     icon: 'profile', permission: null },
      { to: ROUTES.AUDIT,   label: 'Auditoría',     icon: 'audit',   permission: PERMISSIONS.VIEW_AUDIT },
    ],
  },
]

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout, hasPermission } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate(ROUTES.LOGIN)
  }

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && (
        <div
          className="sidebar-overlay"
          onClick={onToggle}
          style={{
            display: 'none',
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.5)',
            zIndex: 'calc(var(--z-sidebar) - 1)',
          }}
        />
      )}

      <aside
        className="sidebar"
        style={{
          width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
          transition: 'width var(--transition-sidebar)',
        }}
      >
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="var(--color-brand)"/>
              <path d="M8 22V14l8-6 8 6v8" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="13" y="16" width="6" height="6" rx="1" fill="#0F172A"/>
            </svg>
          </div>
          {!collapsed && (
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">Métricas</span>
              <span className="sidebar-brand-sub">Restaurantes</span>
            </div>
          )}
          <button className="sidebar-collapse-btn" onClick={onToggle} title={collapsed ? 'Expandir' : 'Colapsar'}>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform var(--transition-base)' }}
            >
              <path d={icons.chevron} />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => {
            const visible = group.items.filter(
              (item) => item.permission == null || hasPermission(item.permission)
            )
            if (visible.length === 0) return null
            return (
              <div key={group.label} className="sidebar-group">
                {!collapsed && <span className="sidebar-group-label">{group.label}</span>}
                {visible.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `sidebar-item ${isActive ? 'active' : ''}`
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="sidebar-item-icon">
                      <Icon d={icons[item.icon]} />
                    </span>
                    {!collapsed && <span className="sidebar-item-label">{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>

        {/* User info + logout */}
        <div className="sidebar-footer">
          {!collapsed && user && (
            <div className="sidebar-user">
              <Avatar name={user.nombre} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="sidebar-user-name">{user.nombre}</p>
                <p className="sidebar-user-role">{user.rol}</p>
              </div>
            </div>
          )}
          <button
            className="sidebar-item sidebar-logout"
            onClick={handleLogout}
            title="Cerrar sesión"
            style={{ marginTop: collapsed ? 0 : 4 }}
          >
            <span className="sidebar-item-icon">
              <Icon d={icons.logout} />
            </span>
            {!collapsed && <span className="sidebar-item-label">Salir</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
