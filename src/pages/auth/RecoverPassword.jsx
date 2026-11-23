import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { ROUTES } from '../../constants/routes'
import Alert from '../../components/ui/Alert'

export default function RecoverPassword() {
  const { recover, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await recover(email.trim())
      setSent(true)
    } catch {
      setError('No se pudo enviar el correo. Verifica el email ingresado.')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="auth-brand">
          <img src="/omnirest-logo.jpg" alt="OmniRest — Gestión Operativa para Restaurantes" className="auth-logo" />
        </div>

        <div className="auth-card">
          <Link to={ROUTES.LOGIN} className="auth-back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            Volver al inicio de sesión
          </Link>

          {sent ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
              <div style={{ fontSize: 48, marginBottom: 'var(--space-4)' }}>📧</div>
              <h2 style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>Revisa tu correo</h2>
              <p className="text-muted text-sm">
                Enviamos un enlace de recuperación a <strong>{email}</strong>.
                Revisa también tu bandeja de spam.
              </p>
              <button
                className="btn btn-ghost"
                style={{ marginTop: 'var(--space-6)' }}
                onClick={() => setSent(false)}
              >
                Enviar de nuevo
              </button>
            </div>
          ) : (
            <>
              <div className="auth-header">
                <h1 className="auth-title">Recuperar contraseña</h1>
                <p className="auth-subtitle">Te enviaremos un enlace a tu correo</p>
              </div>

              {error && <Alert type="danger">{error}</Alert>}

              <form onSubmit={handleSubmit} className="auth-form">
                <div className="form-group">
                  <label className="form-label" htmlFor="email">Correo electrónico</label>
                  <div className="input-group">
                    <span className="input-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                    </span>
                    <input
                      id="email"
                      type="email"
                      className="form-input"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 'var(--space-2)' }} disabled={loading}>
                  {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : null}
                  {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-right-content">
          <h2>Recupera el acceso a tu cuenta</h2>
          <p>Si olvidaste tu contraseña, te enviamos un enlace seguro para restablecerla en segundos.</p>
        </div>
      </div>
    </div>
  )
}
