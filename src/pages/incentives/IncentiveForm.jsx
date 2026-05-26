import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import { ROUTES } from '../../constants/routes'

const EMPTY = {
  nombre: '', premio: '', descripcion: '', meta_tipo: 'ventas', meta_valor: '',
  inicio: '', fin: '', aplica_a: 'todos', restaurante_id: '',
}

const metaTipos = [
  { value: 'ventas',  label: 'Mayor ventas totales' },
  { value: 'ordenes', label: 'Mayor número de órdenes' },
  { value: 'ticket',  label: 'Mayor ticket promedio' },
  { value: 'upsell',  label: 'Mayor upsell' },
  { value: 'custom',  label: 'Meta personalizada' },
]

export default function IncentiveForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await new Promise((r) => setTimeout(r, 800))
      navigate(ROUTES.INCENTIVES)
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
          <h1 className="page-title">{isEdit ? 'Editar incentivo' : 'Nuevo incentivo'}</h1>
          <p className="page-subtitle">Configura las reglas del concurso</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        {error && <Alert type="danger" onClose={() => setError('')}>{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre del incentivo <span className="required">*</span></label>
            <input className="form-input" placeholder="Ej: Mayor upsell de junio" value={form.nombre} onChange={set('nombre')} required />
          </div>

          <div className="form-group">
            <label className="form-label">Premio <span className="required">*</span></label>
            <input className="form-input" placeholder="Ej: Bono $500 / Día libre" value={form.premio} onChange={set('premio')} required />
          </div>

          <div className="form-group">
            <label className="form-label">Descripción</label>
            <textarea className="form-textarea" placeholder="Describe las reglas del concurso..." value={form.descripcion} onChange={set('descripcion')} />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Tipo de meta <span className="required">*</span></label>
              <select className="form-select" value={form.meta_tipo} onChange={set('meta_tipo')}>
                {metaTipos.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            {form.meta_tipo === 'custom' && (
              <div className="form-group">
                <label className="form-label">Valor de la meta</label>
                <input className="form-input" placeholder="Ej: $5,000 en upsell" value={form.meta_valor} onChange={set('meta_valor')} />
              </div>
            )}
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Fecha inicio <span className="required">*</span></label>
              <input type="date" className="form-input" value={form.inicio} onChange={set('inicio')} required />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha fin <span className="required">*</span></label>
              <input type="date" className="form-input" value={form.fin} onChange={set('fin')} required />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Aplica a</label>
            <select className="form-select" value={form.aplica_a} onChange={set('aplica_a')}>
              <option value="todos">Todos los meseros</option>
              <option value="restaurante">Un restaurante específico</option>
            </select>
          </div>

          <hr className="divider" />

          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
            <Button variant="secondary" type="button" onClick={() => navigate(ROUTES.INCENTIVES)}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={loading}>{isEdit ? 'Guardar cambios' : 'Crear incentivo'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
