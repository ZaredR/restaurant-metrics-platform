import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuthStore } from '../../store/auth.store'
import { ROUTES, isHiddenRoute } from '../../constants/routes'
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
  staff:       'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M19 8v6 M22 11h-6',
  floor:       'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  hostess:     'M3 11h18 M5 11V8a7 7 0 0 1 14 0v3 M12 4V2 M2 15h20 M6 15v6 M18 15v6',
  alerts:      'M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  surveys:     'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  closing:     'M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  roster:      'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2 2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2z M9 12h6 M9 16h6',
  schedules:   'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  absences:    'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M3 10h18 M9.5 14.5l5 5 M14.5 14.5l-5 5',
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
    label: 'Operación',
    items: [
      { to: ROUTES.STAFF, label: 'Personal', icon: 'staff', permission: PERMISSIONS.VIEW_STAFF },
      { to: ROUTES.FLOOR, label: 'Local',    icon: 'floor', permission: PERMISSIONS.VIEW_FLOOR },
      { to: ROUTES.HOSTESS,   label: 'Hostess',    icon: 'hostess',  permission: PERMISSIONS.HOSTESS_DESK },
      { to: ROUTES.ROSTER,    label: 'Rol diario', icon: 'roster',   permission: PERMISSIONS.VIEW_ROSTER },
      { to: ROUTES.CLOSING,   label: 'Cierre',     icon: 'closing',  permission: PERMISSIONS.VIEW_CLOSING },
      { to: ROUTES.SURVEYS,   label: 'Encuestas',  icon: 'surveys',  permission: PERMISSIONS.CAPTURE_SURVEYS },
      { to: ROUTES.ALERTS,    label: 'Alertas',    icon: 'alerts',   permission: PERMISSIONS.VIEW_ALERTS },
      { to: ROUTES.SCHEDULES, label: 'Horarios',  icon: 'schedules', permission: PERMISSIONS.VIEW_SCHEDULES },
      { to: ROUTES.ABSENCES,  label: 'Ausencias', icon: 'absences',  permission: PERMISSIONS.MANAGE_SCHEDULES },
    ],
  },
  {
    label: 'Rendimiento',
    items: [
      { to: ROUTES.METRICS,    label: 'Métricas',   icon: 'metrics',    permission: PERMISSIONS.VIEW_METRICS },
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
      { to: ROUTES.ACCOUNTS, label: 'Usuarios',     icon: 'users',   permission: PERMISSIONS.MANAGE_USERS },
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
        <div className={`sidebar-brand ${collapsed ? 'sidebar-brand--collapsed' : ''}`}>
          {/* OmniRest logo; collapsed shows the chef-hat icon. */}
          <div className={`sidebar-logo ${collapsed ? 'sidebar-logo--icon' : ''}`}>
            {collapsed
              ? <img src="/omnirest-icon.png" alt="OmniRest" className="sidebar-logo-img" />
              : <img src="/omnirest-logo.jpg" alt="OmniRest — Gestión Operativa para Restaurantes" className="sidebar-logo-img" />}
          </div>
          {!collapsed && <div className="sidebar-brand-text" />}
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
              (item) => !isHiddenRoute(item.to) && (item.permission == null || hasPermission(item.permission))
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
