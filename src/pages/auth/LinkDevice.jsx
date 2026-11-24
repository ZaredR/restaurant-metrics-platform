import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { ROUTES } from '../../constants/routes'
import { supabase } from '../../services/supabase'
import { linkThisDevice } from '../../services/devices.service'

/* Opened on the tablet from the link that management generated in Dispositivos.
   Redeems it once and lands on the device's screen. */
export default function LinkDevice() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { user, login } = useAuthStore()
  const personSession = user && !user.dispositivo
  const [status, setStatus] = useState(personSession ? 'person' : 'linking') // linking | person | error
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (personSession || started.current) return
    started.current = true // the link works once: never redeem it twice (StrictMode runs effects twice)
    if (!supabase) {
      setError('Supabase no está configurado en esta instalación.')
      setStatus('error')
      return
    }
    linkThisDevice(token)
      .then(({ user: device, token: accessToken }) => {
        login(device, accessToken)
        navigate(device.dispositivo.funcion === 'encuestas' ? ROUTES.SURVEYS : ROUTES.HOSTESS, { replace: true })
      })
      .catch((err) => {
        useAuthStore.getState().logout()
        setError(err.message)
        setStatus('error')
      })
  }, [personSession, token, login, navigate])

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="auth-brand">
          <img src="/omnirest-logo.jpg" alt="OmniRest — Gestión Operativa para Restaurantes" className="auth-logo" />
        </div>

        <div className="auth-card">
          {status === 'linking' && (
            <div className="loading-screen" style={{ minHeight: 200 }}>
              <div className="spinner" />
              <p>Vinculando esta tablet...</p>
            </div>
          )}

          {status === 'person' && (
            <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
              <h1 className="auth-title" style={{ marginBottom: 'var(--space-2)' }}>Hay una sesión abierta</h1>
              <p className="text-muted text-sm" style={{ marginBottom: 'var(--space-6)' }}>
                {user.nombre} tiene la sesión iniciada en este navegador. Cierra sesión y vuelve a abrir el enlace para vincular la tablet.
              </p>
              <Link to={ROUTES.DASHBOARD} className="btn btn-primary">Volver al inicio</Link>
            </div>
          )}

          {status === 'error' && (
            <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
              <h1 className="auth-title" style={{ marginBottom: 'var(--space-2)' }}>No se pudo vincular</h1>
              <p className="text-muted text-sm" style={{ marginBottom: 'var(--space-6)' }}>{error}</p>
              <Link to={ROUTES.LOGIN} className="btn btn-secondary">Ir a iniciar sesión</Link>
            </div>
          )}
        </div>
      </div>
      <div className="auth-right">
        <div className="auth-right-content">
          <h2>Tablet del restaurante</h2>
          <p>Esta tablet entra con la función que le dio gerencia, sin contraseña personal.</p>
        </div>
      </div>
    </div>
  )
}
