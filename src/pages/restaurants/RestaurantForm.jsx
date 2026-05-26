import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import { ROUTES } from '../../constants/routes'

const EMPTY = { nombre: '', direccion: '', telefono: '', gerente_id: '', activo: true }

const GERENTES_MOCK = [
  { id: '1', nombre: 'Ana García' },
  { id: '2', nombre: 'Juan Pérez' },
  { id: '3', nombre: 'María López' },
]

export default function RestaurantForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      /* TODO: call restaurants.service.js -> supabase */
      await new Promise((r) => setTimeout(r, 800))
      navigate(ROUTES.RESTAURANTS)
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
          <h1 className="page-title">{isEdit ? 'Editar restaurante' : 'Nuevo restaurante'}</h1>
          <p className="page-subtitle">{isEdit ? 'Modifica los datos de la sucursal' : 'Registra una nueva sucursal'}</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        {error && <Alert type="danger" onClose={() => setError('')} style={{ marginBottom: 'var(--space-4)' }}>{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre de la sucursal <span className="required">*</span></label>
            <input className="form-input" placeholder="Ej: Sucursal Centro" value={form.nombre} onChange={set('nombre')} required />
          </div>

          <div className="form-group">
            <label className="form-label">Dirección</label>
            <input className="form-input" placeholder="Calle, Colonia, Ciudad" value={form.direccion} onChange={set('direccion')} />
          </div>

          <div className="form-group">
            <label className="form-label">Teléfono</label>
            <input className="form-input" placeholder="55 1234 5678" value={form.telefono} onChange={set('telefono')} type="tel" />
          </div>

          <div className="form-group">
            <label className="form-label">Gerente asignado</label>
            <select className="form-select" value={form.gerente_id} onChange={set('gerente_id')}>
              <option value="">Sin asignar</option>
              {GERENTES_MOCK.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </div>

          {isEdit && (
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <input type="checkbox" id="activo" checked={form.activo} onChange={set('activo')} style={{ width: 16, height: 16 }} />
              <label htmlFor="activo" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>Restaurante activo</label>
            </div>
          )}

          <hr className="divider" />

          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
            <Button variant="secondary" type="button" onClick={() => navigate(ROUTES.RESTAURANTS)}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={loading}>{isEdit ? 'Guardar cambios' : 'Crear restaurante'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
