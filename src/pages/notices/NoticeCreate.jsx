import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import { ROUTES } from '../../constants/routes'

const RESTAURANTES = ['Todos', 'Sucursal Centro', 'Sucursal Norte', 'Sucursal Sur']

export default function NoticeCreate() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ titulo: '', cuerpo: '', tipo: 'info', destino: 'Todos', restaurante: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await new Promise((r) => setTimeout(r, 800))
      navigate(ROUTES.NOTICES)
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
          <h1 className="page-title">Publicar aviso</h1>
          <p className="page-subtitle">Envía un mensaje a tu equipo</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        {error && <Alert type="danger" onClose={() => setError('')}>{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Título <span className="required">*</span></label>
            <input className="form-input" placeholder="Asunto del aviso" value={form.titulo} onChange={set('titulo')} required />
          </div>

          <div className="form-group">
            <label className="form-label">Mensaje <span className="required">*</span></label>
            <textarea className="form-textarea" placeholder="Escribe aquí el contenido del aviso..." value={form.cuerpo} onChange={set('cuerpo')} required style={{ minHeight: 120 }} />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-select" value={form.tipo} onChange={set('tipo')}>
                <option value="info">Informativo</option>
                <option value="success">Positivo</option>
                <option value="warning">Urgente</option>
                <option value="danger">Crítico</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Destinatarios</label>
              <select className="form-select" value={form.destino} onChange={set('destino')}>
                <option value="todos">Todos</option>
                <option value="restaurante">Por restaurante</option>
                <option value="individual">Individual</option>
              </select>
            </div>
          </div>

          {form.destino === 'restaurante' && (
            <div className="form-group">
              <label className="form-label">Restaurante</label>
              <select className="form-select" value={form.restaurante} onChange={set('restaurante')}>
                <option value="">Seleccionar</option>
                {RESTAURANTES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          <hr className="divider" />

          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
            <Button variant="secondary" type="button" onClick={() => navigate(ROUTES.NOTICES)}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={loading}>Publicar aviso</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
