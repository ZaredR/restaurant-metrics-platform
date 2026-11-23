import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../../components/ui/Alert'
import { ROUTES } from '../../constants/routes'
import { useAuthStore } from '../../store/auth.store'
import { supabase } from '../../services/supabase'
import { updatePassword, logout } from '../../services/auth.service'

/* Landing page of the recovery email. Supabase reads the link's token and
   opens a temporary session; here the user sets a new password and is sent
   back to the login. */
export default function ResetPassword() {
  const [status, setStatus] = useState('checking') // checking | ready | invalid | done
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!supabase) return setStatus('invalid')
    // The link carries an error (expired or already used).
    if (/error=/.test(window.location.hash) || /error=/.test(window.location.search)) return setStatus('invalid')

    let done = false
    const ready = () => { if (!done) { done = true; setStatus('ready') } }
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) ready()
    })
    supabase.auth.getSession().then(({ data }) => { if (data.session) ready() })
    const timer = setTimeout(() => { if (!done) { done = true; setStatus('invalid') } }, 4000)
    return () => { clearTimeout(timer); sub.subscription.unsubscribe() }
  }, [])

  const tooShort = password.length > 0 && password.length < 8
  const mismatch = confirm.length > 0 && confirm !== password
  const valid = password.length >= 8 && password === confirm

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    setError('')
    try {
      await updatePassword(password)
      // The recovery session must not stay open: sign in again with the new password.
      await logout().catch(() => {})
      useAuthStore.getState().logout()
      setStatus('done')
    } catch (err) {
      setError(err.message?.includes('different from the old')
        ? 'La nueva contraseña debe ser distinta de la anterior.'
        : 'No se pudo cambiar la contraseña. Pide un enlace nuevo e inténtalo otra vez.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="auth-brand">
          <img src="/omnirest-logo.jpg" alt="OmniRest — Gestión Operativa para Restaurantes" className="auth-logo" />
        </div>

        <div className="auth-card">
          {status === 'checking' && (
            <div className="loading-screen" style={{ minHeight: 200 }}>
              <div className="spinner" />
              <p>Verificando el enlace...</p>
            </div>
          )}

          {status === 'invalid' && (
            <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
              <h1 className="auth-title" style={{ marginBottom: 'var(--space-2)' }}>Enlace no válido</h1>
              <p className="text-muted text-sm" style={{ marginBottom: 'var(--space-6)' }}>
                El enlace venció o ya se usó. Pide uno nuevo para restablecer tu contraseña.
              </p>
              <Link to={ROUTES.RECOVER} className="btn btn-primary">Pedir un enlace nuevo</Link>
            </div>
          )}

          {status === 'done' && (
            <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
              <h1 className="auth-title" style={{ marginBottom: 'var(--space-2)' }}>Contraseña actualizada</h1>
              <p className="text-muted text-sm" style={{ marginBottom: 'var(--space-6)' }}>Ya puedes iniciar sesión con tu nueva contraseña.</p>
              <Link to={ROUTES.LOGIN} className="btn btn-primary">Ir a iniciar sesión</Link>
            </div>
          )}

          {status === 'ready' && (
            <>
              <div className="auth-header">
                <h1 className="auth-title">Nueva contraseña</h1>
                <p className="auth-subtitle">Usa al menos 8 caracteres.</p>
              </div>
              {error && <Alert type="danger">{error}</Alert>}
              <form onSubmit={handleSubmit} className="auth-form">
                <div className="form-group">
                  <label className="form-label" htmlFor="new-password">Nueva contraseña</label>
                  <input id="new-password" type="password" className="form-input" autoComplete="new-password"
                    value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoFocus />
                  {tooShort && <p className="form-error">Debe tener al menos 8 caracteres.</p>}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="confirm-password">Repite la contraseña</label>
                  <input id="confirm-password" type="password" className="form-input" autoComplete="new-password"
                    value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                  {mismatch && <p className="form-error">Las contraseñas no coinciden.</p>}
                </div>
                <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={!valid || saving}>
                  {saving ? <span className="spinner" style={{ width: 18, height: 18 }} /> : null}
                  {saving ? 'Guardando...' : 'Guardar contraseña'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-right-content">
          <h2>Restablece tu acceso</h2>
          <p>Elige una contraseña nueva; el enlace del correo solo sirve una vez.</p>
        </div>
      </div>
    </div>
  )
}
