import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import { ROUTES } from '../../constants/routes'
import { ROLES, ROLE_LABELS } from '../../constants/roles'

const RESTAURANTES_MOCK = [
  { id: '1', nombre: 'Sucursal Centro' },
  { id: '2', nombre: 'Sucursal Norte' },
  { id: '3', nombre: 'Sucursal Sur' },
]

const EMPTY = { nombre: '', email: '', password: '', rol: ROLES.MESERO, restaurante_id: '', activo: true }

export default function UserForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const needsRestaurant = form.rol !== ROLES.ADMIN

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await new Promise((r) => setTimeout(r, 800))
      navigate(ROUTES.USERS)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h1>
          <p className="page-subtitle">{isEdit ? 'Modifica los datos del usuario' : 'Crea un nuevo acceso al sistema'}</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        {error && <Alert type="danger" onClose={() => setError('')}>{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre completo <span className="required">*</span></label>
            <input className="form-input" placeholder="Nombre Apellido" value={form.nombre} onChange={set('nombre')} required />
          </div>

          <div className="form-group">
            <label className="form-label">Correo electrónico <span className="required">*</span></label>
            <input className="form-input" type="email" placeholder="usuario@restaurante.com" value={form.email} onChange={set('email')} required />
          </div>

          {!isEdit && (
            <div className="form-group">
              <label className="form-label">Contraseña <span className="required">*</span></label>
              <input className="form-input" type="password" placeholder="Mín. 8 caracteres" value={form.password} onChange={set('password')} required minLength={8} />
              <span className="form-hint">El usuario podrá cambiarla en su perfil</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Rol <span className="required">*</span></label>
            <select className="form-select" value={form.rol} onChange={set('rol')}>
              {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {needsRestaurant && (
            <div className="form-group">
              <label className="form-label">Restaurante asignado <span className="required">*</span></label>
              <select className="form-select" value={form.restaurante_id} onChange={set('restaurante_id')} required={needsRestaurant}>
                <option value="">Seleccionar restaurante</option>
                {RESTAURANTES_MOCK.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </div>
          )}

          {isEdit && (
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="activo" checked={form.activo} onChange={set('activo')} style={{ width: 16, height: 16 }} />
              <label htmlFor="activo" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>Cuenta activa</label>
            </div>
          )}

          <hr className="divider" />

          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
            <Button variant="secondary" type="button" onClick={() => navigate(ROUTES.USERS)}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={loading}>{isEdit ? 'Guardar cambios' : 'Crear usuario'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
