import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { ROUTES } from '../../constants/routes'
import Alert from '../../components/ui/Alert'

export default function Login() {
  const { login, loading, error } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    login(form.email.trim(), form.password)
  }

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="auth-brand">
          <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="10" fill="var(--color-brand)"/>
            <path d="M8 22V14l8-6 8 6v8" stroke="#0F172A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="13" y="16" width="6" height="6" rx="1" fill="#0F172A"/>
          </svg>
          <span className="auth-brand-name">Métricas Restaurantes</span>
        </div>

        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">Bienvenido de vuelta</h1>
            <p className="auth-subtitle">Inicia sesión para continuar</p>
          </div>

          {error && (
            <Alert type="danger" onClose={() => {}}>
              {error}
            </Alert>
          )}

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
                  value={form.email}
                  onChange={set('email')}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">Contraseña</label>
              <div className="input-group" style={{ position: 'relative' }}>
                <span className="input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={set('password')}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  style={{
                    position: 'absolute', right: '0.75rem',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center',
                  }}
                >
                  {showPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="auth-forgot">
              <Link to={ROUTES.RECOVER} className="auth-link">¿Olvidaste tu contraseña?</Link>
            </div>

            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : null}
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </form>

          <div className="auth-demo">
            <p className="auth-demo-title">Cuentas de prueba</p>
            <div className="auth-demo-grid">
              {[
                { email: 'admin@demo.com',      rol: 'Admin Global' },
                { email: 'gerente@demo.com',    rol: 'Gerente' },
                { email: 'supervisor@demo.com', rol: 'Supervisor' },
                { email: 'mesero@demo.com',     rol: 'Mesero' },
              ].map((d) => (
                <button
                  key={d.email}
                  type="button"
                  className="auth-demo-btn"
                  onClick={() => {
                    setForm({ email: d.email, password: 'demo1234' })
                  }}
                >
                  <span className="auth-demo-rol">{d.rol}</span>
                  <span className="auth-demo-email">{d.email}</span>
                </button>
              ))}
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 8 }}>
              Contraseña: <code style={{ background: 'var(--color-navy-100)', padding: '1px 6px', borderRadius: 4 }}>demo1234</code>
            </p>
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-right-content">
          <h2>Monitorea el rendimiento de tu equipo</h2>
          <p>Métricas automatizadas, rankings en tiempo real e incentivos para impulsar a tu mejor personal.</p>
          <div className="auth-features">
            {[
              { icon: '📊', text: 'KPIs calculados automáticamente' },
              { icon: '🏆', text: 'Rankings y gamificación' },
              { icon: '📁', text: 'Importa desde SoftRestaurant' },
              { icon: '🔔', text: 'Avisos e incentivos internos' },
            ].map((f) => (
              <div key={f.text} className="auth-feature-item">
                <span>{f.icon}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
