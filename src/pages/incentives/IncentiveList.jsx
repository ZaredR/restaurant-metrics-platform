import { useState } from 'react'
import { Link } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { date } from '../../utils/formatters'
import { useAuthStore } from '../../store/auth.store'
import { PERMISSIONS } from '../../constants/permissions'
import { ROUTES } from '../../constants/routes'

const MOCK = [
  { id: '1', nombre: 'Mayor upsell de mayo',   premio: 'Bono $500',  inicio: '2026-05-01', fin: '2026-05-31', participantes: 18, estado: 'activo',     meta: 'Máximo upsell del mes' },
  { id: '2', nombre: 'Top ventas semana 22',   premio: 'Día libre',  inicio: '2026-05-26', fin: '2026-06-01', participantes: 24, estado: 'activo',     meta: 'Mayor venta semanal' },
  { id: '3', nombre: 'Mejor ticket abril',     premio: 'Bono $300',  inicio: '2026-04-01', fin: '2026-04-30', participantes: 20, estado: 'finalizado', meta: 'Mayor ticket promedio' },
  { id: '4', nombre: 'Concurso junio',         premio: 'Bono $600',  inicio: '2026-06-01', fin: '2026-06-30', participantes: 0,  estado: 'programado', meta: 'Mayor ventas del mes' },
]

const estadoVariant = { activo: 'success', finalizado: 'neutral', programado: 'info' }

export default function IncentiveList() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission(PERMISSIONS.MANAGE_INCENTIVES)
  const [tab, setTab] = useState('activo')
  const [deleteModal, setDeleteModal] = useState(null)

  const filtered = tab === 'todos' ? MOCK : MOCK.filter(i => i.estado === tab)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Incentivos</h1>
          <p className="page-subtitle">Gestiona concursos y premios para tu equipo</p>
        </div>
        {canManage && (
          <div className="page-actions">
            <Link to={ROUTES.INCENTIVE_NEW} className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Crear incentivo
            </Link>
          </div>
        )}
      </div>

      <div className="tabs">
        {[['activo','Activos'],['programado','Programados'],['finalizado','Finalizados'],['todos','Todos']].map(([v,l]) => (
          <button key={v} className={`tab-btn ${tab === v ? 'active' : ''}`} onClick={() => setTab(v)}>{l}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {filtered.length === 0 && (
          <div className="empty-state">
            <p className="empty-state-title">Sin incentivos</p>
            <p className="empty-state-text">No hay incentivos en esta categoría.</p>
          </div>
        )}
        {filtered.map((inc) => (
          <div key={inc.id} className="card" style={{ padding: 'var(--space-5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <h3 style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>{inc.nombre}</h3>
                  <Badge variant={estadoVariant[inc.estado]}>{inc.estado}</Badge>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)' }}>
                  <div><p className="text-xs text-muted">Premio</p><p style={{ fontWeight: 600 }}>{inc.premio}</p></div>
                  <div><p className="text-xs text-muted">Meta</p><p style={{ fontWeight: 600 }}>{inc.meta}</p></div>
                  <div><p className="text-xs text-muted">Período</p><p style={{ fontWeight: 600 }}>{date(inc.inicio)} — {date(inc.fin)}</p></div>
                  <div><p className="text-xs text-muted">Participantes</p><p style={{ fontWeight: 600 }}>{inc.participantes}</p></div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                <Link to={`/incentives/${inc.id}`} className="btn btn-secondary btn-sm">Ver detalle</Link>
                {canManage && inc.estado !== 'finalizado' && (
                  <>
                    <Link to={`/incentives/${inc.id}/edit`} className="btn btn-ghost btn-sm">Editar</Link>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-red-600)' }} onClick={() => setDeleteModal(inc)}>
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title="Cancelar incentivo"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteModal(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => setDeleteModal(null)}>Sí, cancelar</Button>
          </>
        }
      >
        <p>¿Cancelar el incentivo <strong>{deleteModal?.nombre}</strong>? Los participantes serán notificados.</p>
      </Modal>
    </div>
  )
}
