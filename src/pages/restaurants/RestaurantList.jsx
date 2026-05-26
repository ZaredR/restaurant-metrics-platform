import { useState } from 'react'
import { Link } from 'react-router-dom'
import DataTable from '../../components/ui/DataTable'
import Badge, { StatusBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { ROUTES } from '../../constants/routes'
import { useAuthStore } from '../../store/auth.store'
import { PERMISSIONS } from '../../constants/permissions'
import { date } from '../../utils/formatters'

const MOCK = [
  { id: '1', nombre: 'Sucursal Centro',    gerente: 'Ana García',   meseros: 8,  activo: true,  creado: '2024-01-15' },
  { id: '2', nombre: 'Sucursal Norte',     gerente: 'Juan Pérez',   meseros: 6,  activo: true,  creado: '2024-02-20' },
  { id: '3', nombre: 'Sucursal Sur',       gerente: 'María López',  meseros: 5,  activo: true,  creado: '2024-03-10' },
  { id: '4', nombre: 'Sucursal Oriente',   gerente: 'Pedro Castro',  meseros: 4,  activo: false, creado: '2024-04-05' },
  { id: '5', nombre: 'Sucursal Poniente',  gerente: 'Laura Díaz',   meseros: 7,  activo: true,  creado: '2024-05-12' },
]

export default function RestaurantList() {
  const { hasPermission } = useAuthStore()
  const [deleteModal, setDeleteModal] = useState(null)
  const canManage = hasPermission(PERMISSIONS.MANAGE_RESTAURANTS)

  const columns = [
    { header: 'Nombre',   accessor: 'nombre',   sortable: true },
    { header: 'Gerente',  accessor: 'gerente',  sortable: true },
    { header: 'Meseros',  accessor: 'meseros',  sortable: true, render: (r) => <span className="badge badge-neutral">{r.meseros}</span> },
    { header: 'Estado',   accessor: 'activo',   render: (r) => <StatusBadge active={r.activo} /> },
    { header: 'Creado',   accessor: 'creado',   sortable: true, render: (r) => date(r.creado) },
    {
      header: 'Acciones', key: 'actions',
      render: (r) => (
        <div className="table-actions">
          <Link to={`/restaurants/${r.id}/edit`} className="btn btn-ghost btn-sm" title="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </Link>
          {canManage && (
            <button className="btn btn-ghost btn-sm" onClick={() => setDeleteModal(r)} title="Eliminar" style={{ color: 'var(--color-red-600)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="m19 6-.867 13.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 6"/>
                <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
              </svg>
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Restaurantes</h1>
          <p className="page-subtitle">{MOCK.length} sucursales registradas</p>
        </div>
        {canManage && (
          <div className="page-actions">
            <Link to={ROUTES.RESTAURANT_NEW} className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nuevo restaurante
            </Link>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={MOCK}
        searchable
        searchPlaceholder="Buscar por nombre o gerente..."
      />

      <Modal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title="Confirmar eliminación"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteModal(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => setDeleteModal(null)}>Eliminar</Button>
          </>
        }
      >
        <p>¿Estás seguro de que deseas eliminar <strong>{deleteModal?.nombre}</strong>? Esta acción no se puede deshacer.</p>
      </Modal>
    </div>
  )
}
