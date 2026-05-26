import { useState } from 'react'
import { useAuthStore } from '../../store/auth.store'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Avatar from '../../components/ui/Avatar'
import { RoleBadge } from '../../components/ui/Badge'
import { datetime } from '../../utils/formatters'
import { useAuth } from '../../hooks/useAuth'

export default function Profile() {
  const { user } = useAuthStore()
  const { logout } = useAuth()
  const [tab, setTab] = useState('datos')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [passForm, setPassForm] = useState({ actual: '', nueva: '', confirmar: '' })

  const setPass = (k) => (e) => setPassForm(f => ({ ...f, [k]: e.target.value }))

  const handleSaveData = async (e) => {
    e.preventDefault()
    setLoading(true)
    await new Promise(r => setTimeout(r, 800))
    setLoading(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleSavePass = async (e) => {
    e.preventDefault()
    if (passForm.nueva !== passForm.confirmar) return
    setLoading(true)
    await new Promise(r => setTimeout(r, 800))
    setLoading(false)
    setSaved(true)
    setPassForm({ actual: '', nueva: '', confirmar: '' })
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Mi Perfil</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-6)', alignItems: 'start' }}>
        {/* Sidebar card */}
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-6)' }}>
          <Avatar name={user?.nombre} size="xl" style={{ margin: '0 auto var(--space-4)' }} />
          <h2 style={{ fontWeight: 700, marginBottom: 4 }}>{user?.nombre}</h2>
          <p className="text-muted text-sm" style={{ marginBottom: 'var(--space-3)' }}>{user?.email}</p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
            <RoleBadge role={user?.rol} />
          </div>
          {user?.restaurante && (
            <div style={{ background: 'var(--color-amber-50)', border: '1px solid var(--color-amber-200)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-amber-700)' }}>
              📍 {user.restaurante}
            </div>
          )}
          <hr className="divider" style={{ margin: 'var(--space-5) 0' }} />
          <Button variant="danger" size="sm" style={{ width: '100%' }} onClick={logout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Cerrar sesión
          </Button>
        </div>

        {/* Main content */}
        <div>
          <div className="tabs">
            <button className={`tab-btn ${tab === 'datos' ? 'active' : ''}`} onClick={() => setTab('datos')}>Datos personales</button>
            <button className={`tab-btn ${tab === 'password' ? 'active' : ''}`} onClick={() => setTab('password')}>Cambiar contraseña</button>
          </div>

          {saved && <Alert type="success" onClose={() => setSaved(false)} style={{ marginBottom: 'var(--space-4)' }}>Cambios guardados.</Alert>}

          {tab === 'datos' && (
            <div className="card">
              <form onSubmit={handleSaveData}>
                <div className="form-group">
                  <label className="form-label">Nombre completo</label>
                  <input className="form-input" defaultValue={user?.nombre} />
                </div>
                <div className="form-group">
                  <label className="form-label">Correo electrónico</label>
                  <input className="form-input" type="email" defaultValue={user?.email} />
                </div>
                <div className="form-group">
                  <label className="form-label">Rol</label>
                  <input className="form-input" value={user?.rol} readOnly style={{ background: 'var(--color-navy-50)', cursor: 'not-allowed' }} />
                </div>
                <hr className="divider" />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="submit" loading={loading}>Guardar cambios</Button>
                </div>
              </form>
            </div>
          )}

          {tab === 'password' && (
            <div className="card">
              <form onSubmit={handleSavePass}>
                <div className="form-group">
                  <label className="form-label">Contraseña actual <span className="required">*</span></label>
                  <input className="form-input" type="password" placeholder="••••••••" value={passForm.actual} onChange={setPass('actual')} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Nueva contraseña <span className="required">*</span></label>
                  <input className="form-input" type="password" placeholder="Mín. 8 caracteres" value={passForm.nueva} onChange={setPass('nueva')} required minLength={8} />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirmar nueva contraseña <span className="required">*</span></label>
                  <input className="form-input" type="password" placeholder="••••••••" value={passForm.confirmar} onChange={setPass('confirmar')} required />
                  {passForm.confirmar && passForm.nueva !== passForm.confirmar && (
                    <span className="form-error">Las contraseñas no coinciden</span>
                  )}
                </div>
                <hr className="divider" />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="submit" loading={loading} disabled={passForm.nueva !== passForm.confirmar}>Actualizar contraseña</Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
