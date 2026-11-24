import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { checkThisDevice } from '../../services/devices.service'
import { logout as serviceLogout } from '../../services/auth.service'
import { ROUTES } from '../../constants/routes'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppLayout() {
  // On a phone the menu starts hidden and opens as a drawer (see theme.css).
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 768)
  const navigate = useNavigate()
  const isDevice = useAuthStore((s) => !!s.user?.dispositivo)

  useEffect(() => {
    if (!isDevice) return
    checkThisDevice()
      .then((device) => {
        if (device) useAuthStore.getState().login(device, useAuthStore.getState().token)
        else { serviceLogout().catch(() => {}); useAuthStore.getState().logout(); navigate(ROUTES.LOGIN, { replace: true }) }
      })
      .catch(() => {}) // offline: keep working; the database still enforces the revocation
  }, [isDevice, navigate])

  return (
    <div className="app-shell">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div className={`app-content ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <Topbar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
        <main className="page-body page-enter">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
