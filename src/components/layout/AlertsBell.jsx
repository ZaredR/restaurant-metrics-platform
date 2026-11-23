import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ROUTES } from '../../constants/routes'
import { ALERTS_CHANGED, countPendingAlerts, evaluateAlerts, subscribeToAlerts } from '../../services/alerts.service'

/* Bell with the number of pending alerts for the user's profile.
   Opening the app (or changing page) also checks the threshold rules. */
export default function AlertsBell() {
  const { pathname } = useLocation()
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    try {
      await evaluateAlerts()
      setCount(await countPendingAlerts())
    } catch {
      // Without Supabase (demo mode) or permission there is simply no count.
    }
  }, [])

  useEffect(() => { refresh() }, [refresh, pathname])

  useEffect(() => {
    const recount = () => { countPendingAlerts().then(setCount).catch(() => {}) }
    window.addEventListener(ALERTS_CHANGED, recount)
    return () => window.removeEventListener(ALERTS_CHANGED, recount)
  }, [])

  useEffect(() => {
    try {
      return subscribeToAlerts(() => { countPendingAlerts().then(setCount).catch(() => {}) })
    } catch {
      return undefined
    }
  }, [])

  const label = count ? `${count} ${count === 1 ? 'alerta pendiente' : 'alertas pendientes'}` : 'Alertas'
  return (
    <Link to={ROUTES.ALERTS} className="topbar-icon-btn" title={label} aria-label={label}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      {count > 0 && <span className="topbar-badge topbar-badge--count">{count > 99 ? '99+' : count}</span>}
    </Link>
  )
}
