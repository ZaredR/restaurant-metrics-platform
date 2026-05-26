import { Link } from 'react-router-dom'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import { datetime, fileSize } from '../../utils/formatters'
import { ROUTES } from '../../constants/routes'

const MOCK = [
  { id: '1', archivo: 'reporte_mayo_w1.xlsx', filas: 342, estado: 'ok',    subido_por: 'Ana García',  fecha: '2026-05-20T10:00:00', peso: 48320 },
  { id: '2', archivo: 'reporte_mayo_w2.csv',  filas: 298, estado: 'ok',    subido_por: 'Ana García',  fecha: '2026-05-13T09:30:00', peso: 31200 },
  { id: '3', archivo: 'reporte_abr_w4.xlsx',  filas: 0,   estado: 'error', subido_por: 'Juan Pérez',  fecha: '2026-04-28T11:00:00', peso: 51000 },
  { id: '4', archivo: 'reporte_abr_w3.csv',   filas: 315, estado: 'ok',    subido_por: 'Ana García',  fecha: '2026-04-21T08:45:00', peso: 29100 },
]

const estadoVariant = { ok: 'success', error: 'danger', procesando: 'warning' }
const estadoLabel   = { ok: 'Procesado', error: 'Error', procesando: 'Procesando' }

export default function ReportHistory() {
  const columns = [
    {
      header: 'Archivo', accessor: 'archivo', sortable: true,
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-navy-500)" strokeWidth="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>{r.archivo}</span>
        </div>
      ),
    },
    { header: 'Filas',       accessor: 'filas',      render: (r) => r.filas > 0 ? r.filas.toLocaleString() : '—' },
    { header: 'Estado',      accessor: 'estado',     render: (r) => <Badge variant={estadoVariant[r.estado]}>{estadoLabel[r.estado]}</Badge> },
    { header: 'Subido por',  accessor: 'subido_por', sortable: true },
    { header: 'Fecha',       accessor: 'fecha',      sortable: true, render: (r) => datetime(r.fecha) },
    { header: 'Peso',        accessor: 'peso',       render: (r) => fileSize(r.peso) },
    {
      header: 'Ver', key: 'actions',
      render: (r) => (
        <Link to={`/reports/${r.id}`} className="btn btn-ghost btn-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          Ver
        </Link>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Historial de reportes</h1>
          <p className="page-subtitle">{MOCK.length} archivos cargados</p>
        </div>
        <div className="page-actions">
          <Link to={ROUTES.REPORT_UPLOAD} className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Subir reporte
          </Link>
        </div>
      </div>

      <DataTable columns={columns} data={MOCK} searchable searchPlaceholder="Buscar archivo..." />
    </div>
  )
}
