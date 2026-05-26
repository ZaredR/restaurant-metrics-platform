import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="app-shell">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div className={`app-content ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <Topbar collapsed={collapsed} />
        <main className="page-body page-enter">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
