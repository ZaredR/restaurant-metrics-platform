import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import { relative } from '../../utils/formatters'
import { useAuthStore } from '../../store/auth.store'
import { PERMISSIONS } from '../../constants/permissions'
import { ROUTES } from '../../constants/routes'

const MOCK = [
  { id: '1', titulo: 'Reunión obligatoria viernes 17:00', cuerpo: 'Se requiere la presencia de todos los meseros para revisión de nuevo menú.', tipo: 'warning', leido: false, fecha: '2026-05-26T10:00:00', autor: 'Ana García',  destino: 'Todos' },
  { id: '2', titulo: 'Nuevo menú de temporada disponible', cuerpo: 'Ya está disponible el menú de verano. Por favor revísenlo antes del turno.', tipo: 'success', leido: false, fecha: '2026-05-25T09:00:00', autor: 'Ana García',  destino: 'Todos' },
  { id: '3', titulo: 'Cambio de turno viernes', cuerpo: 'El turno vespertino del viernes comenzará 30 minutos antes.', tipo: 'info', leido: true, fecha: '2026-05-24T15:00:00', autor: 'Carlos López', destino: 'Suc. Norte' },
  { id: '4', titulo: 'Felicidades Diego Ruiz — Top del mes', cuerpo: 'Diego ha alcanzado el primer lugar en ventas. ¡Felicitaciones!', tipo: 'success', leido: true, fecha: '2026-05-20T11:00:00', autor: 'Sistema',      destino: 'Todos' },
]

const tipoVariant = { success: 'success', warning: 'warning', info: 'info', danger: 'danger' }
const tipoLabel   = { success: 'Informativo', warning: 'Urgente', info: 'Aviso', danger: 'Crítico' }

export default function NoticeList() {
  const { hasPermission } = useAuthStore()
  const canPublish = hasPermission(PERMISSIONS.PUBLISH_NOTICES)
  const [filter, setFilter] = useState('todos')
  const navigate = useNavigate()

  const filtered = filter === 'no-leidos'
    ? MOCK.filter(n => !n.leido)
    : MOCK

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Avisos</h1>
          <p className="page-subtitle">{MOCK.filter(n => !n.leido).length} sin leer</p>
        </div>
        {canPublish && (
          <div className="page-actions">
            <Link to={ROUTES.NOTICE_NEW} className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Publicar aviso
            </Link>
          </div>
        )}
      </div>

      <div className="filters-row">
        {[['todos','Todos'],['no-leidos','Sin leer']].map(([v,l]) => (
          <button key={v} className={`filter-chip ${filter === v ? 'active' : ''}`} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {filtered.map((aviso) => (
          <div
            key={aviso.id}
            className={`notice-card ${!aviso.leido ? 'unread' : ''}`}
            onClick={() => navigate(`/notices/${aviso.id}`)}
          >
            <div className="notice-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                {!aviso.leido && (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-brand)', flexShrink: 0 }} />
                )}
                <p className="notice-title">{aviso.titulo}</p>
                <Badge variant={tipoVariant[aviso.tipo]}>{tipoLabel[aviso.tipo]}</Badge>
              </div>
              <span className="notice-date">{relative(aviso.fecha)}</span>
            </div>
            <p className="notice-body" style={{ marginLeft: aviso.leido ? 0 : 18 }}>{aviso.cuerpo}</p>
            <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginLeft: aviso.leido ? 0 : 18 }}>
              <span>Por: {aviso.autor}</span>
              <span>Para: {aviso.destino}</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="empty-state">
            <p className="empty-state-title">Sin avisos</p>
            <p className="empty-state-text">No tienes avisos sin leer.</p>
          </div>
        )}
      </div>
    </div>
  )
}
