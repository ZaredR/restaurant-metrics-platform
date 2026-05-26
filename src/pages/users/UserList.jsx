import { useState } from 'react'
import { Link } from 'react-router-dom'
import DataTable from '../../components/ui/DataTable'
import { RoleBadge, StatusBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Avatar from '../../components/ui/Avatar'
import Modal from '../../components/ui/Modal'
import { ROUTES } from '../../constants/routes'
import { datetime } from '../../utils/formatters'

const MOCK = [
  { id: '1', nombre: 'Luis Cervantes',  email: 'luis@demo.com',     rol: 'admin',      restaurante: '—',              activo: true,  ultimo_acceso: '2026-05-26T10:30:00' },
  { id: '2', nombre: 'Ana García',      email: 'ana@demo.com',      rol: 'gerente',    restaurante: 'Suc. Centro',    activo: true,  ultimo_acceso: '2026-05-26T09:15:00' },
  { id: '3', nombre: 'Carlos López',    email: 'carlos@demo.com',   rol: 'supervisor', restaurante: 'Suc. Norte',     activo: true,  ultimo_acceso: '2026-05-25T18:00:00' },
  { id: '4', nombre: 'Diego Ruiz',      email: 'diego@demo.com',    rol: 'mesero',     restaurante: 'Suc. Centro',    activo: true,  ultimo_acceso: '2026-05-25T20:00:00' },
  { id: '5', nombre: 'María González',  email: 'maria@demo.com',    rol: 'mesero',     restaurante: 'Suc. Centro',    activo: true,  ultimo_acceso: '2026-05-24T21:00:00' },
  { id: '6', nombre: 'Pedro Castro',    email: 'pedro@demo.com',    rol: 'gerente',    restaurante: 'Suc. Oriente',   activo: false, ultimo_acceso: '2026-04-30T12:00:00' },
]

export default function UserList() {
  const [deleteModal, setDeleteModal] = useState(null)
  const [filterRol, setFilterRol] = useState('')

  const filtered = filterRol ? MOCK.filter(u => u.rol === filterRol) : MOCK

  const columns = [
    {
      header: 'Usuario', key: 'user',
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={r.nombre} size="sm" />
          <div>
            <p style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>{r.nombre}</p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{r.email}</p>
          </div>
        </div>
      ),
    },
    { header: 'Rol',          accessor: 'rol',          render: (r) => <RoleBadge role={r.rol} /> },
    { header: 'Restaurante',  accessor: 'restaurante',  sortable: true },
    { header: 'Estado',       accessor: 'activo',       render: (r) => <StatusBadge active={r.activo} /> },
    { header: 'Último acceso',accessor: 'ultimo_acceso',sortable: true, render: (r) => datetime(r.ultimo_acceso) },
    {
      header: 'Acciones', key: 'actions',
      render: (r) => (
        <div className="table-actions">
          <Link to={`/users/${r.id}`} className="btn btn-ghost btn-sm" title="Ver perfil">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </Link>
          <Link to={`/users/${r.id}/edit`} className="btn btn-ghost btn-sm" title="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </Link>
          <button className="btn btn-ghost btn-sm" title="Eliminar" style={{ color: 'var(--color-red-600)' }} onClick={() => setDeleteModal(r)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="m19 6-.867 13.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Usuarios</h1>
          <p className="page-subtitle">{MOCK.length} usuarios registrados</p>
        </div>
        <div className="page-actions">
          <Link to={ROUTES.USER_NEW} className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuevo usuario
          </Link>
        </div>
      </div>

      <div className="filters-row">
        {['', 'admin', 'gerente', 'supervisor', 'mesero'].map((r) => (
          <button key={r} className={`filter-chip ${filterRol === r ? 'active' : ''}`} onClick={() => setFilterRol(r)}>
            {r === '' ? 'Todos' : r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} searchable searchPlaceholder="Buscar usuario..." />

      <Modal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title="Eliminar usuario"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteModal(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => setDeleteModal(null)}>Eliminar</Button>
          </>
        }
      >
        <p>¿Eliminar a <strong>{deleteModal?.nombre}</strong>? Esta acción desactivará su acceso permanentemente.</p>
      </Modal>
    </div>
  )
}
