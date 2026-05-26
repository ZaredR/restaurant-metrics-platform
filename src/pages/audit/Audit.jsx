import { useState } from 'react'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import { datetime } from '../../utils/formatters'

const MOCK_LOGS = [
  { id: '1', nivel: 'info',    accion: 'LOGIN',          usuario: 'Ana García',   detalle: 'Inicio de sesión exitoso',       ip: '192.168.1.10', fecha: '2026-05-26T10:30:00' },
  { id: '2', nivel: 'info',    accion: 'UPLOAD_REPORT',  usuario: 'Ana García',   detalle: 'Archivo mayo_w1.xlsx procesado', ip: '192.168.1.10', fecha: '2026-05-26T10:35:00' },
  { id: '3', nivel: 'warning', accion: 'LOGIN_FAILED',   usuario: 'desconocido',  detalle: '3 intentos fallidos',            ip: '10.0.0.55',   fecha: '2026-05-25T22:10:00' },
  { id: '4', nivel: 'info',    accion: 'CREATE_USER',    usuario: 'Luis Cervantes',detalle: 'Usuario Diego Ruiz creado',     ip: '192.168.1.1',  fecha: '2026-05-20T09:00:00' },
  { id: '5', nivel: 'error',   accion: 'UPLOAD_REPORT',  usuario: 'Juan Pérez',   detalle: 'Columnas faltantes: mesero,total',ip: '192.168.1.20',fecha: '2026-04-28T11:00:00' },
  { id: '6', nivel: 'info',    accion: 'UPDATE_CONFIG',  usuario: 'Luis Cervantes',detalle: 'Configuración KPIs actualizada', ip: '192.168.1.1', fecha: '2026-04-15T14:20:00' },
]

const nivelVariant = { info: 'info', warning: 'warning', error: 'danger' }

export default function Audit() {
  const [tab, setTab] = useState('sistema')
  const [nivel, setNivel] = useState('')

  const filtered = nivel ? MOCK_LOGS.filter(l => l.nivel === nivel) : MOCK_LOGS

  const colsSistema = [
    { header: 'Nivel',   accessor: 'nivel',   render: (r) => <Badge variant={nivelVariant[r.nivel]}>{r.nivel}</Badge> },
    { header: 'Acción',  accessor: 'accion',  sortable: true, render: (r) => <code style={{ fontSize: 12, background: 'var(--color-navy-100)', padding: '2px 6px', borderRadius: 4 }}>{r.accion}</code> },
    { header: 'Usuario', accessor: 'usuario', sortable: true },
    { header: 'Detalle', accessor: 'detalle' },
    { header: 'IP',      accessor: 'ip',      render: (r) => <code style={{ fontSize: 12 }}>{r.ip}</code> },
    { header: 'Fecha',   accessor: 'fecha',   sortable: true, render: (r) => datetime(r.fecha) },
  ]

  const colsProcessing = MOCK_LOGS
    .filter(l => l.accion.includes('REPORT'))
    .map(l => l)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Auditoría y Logs</h1>
          <p className="page-subtitle">Registro de actividad del sistema</p>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'sistema' ? 'active' : ''}`} onClick={() => setTab('sistema')}>Logs del sistema</button>
        <button className={`tab-btn ${tab === 'procesamiento' ? 'active' : ''}`} onClick={() => setTab('procesamiento')}>Logs de procesamiento</button>
      </div>

      <div className="filters-row">
        {[['','Todos'],['info','Info'],['warning','Warning'],['error','Error']].map(([v,l]) => (
          <button key={v} className={`filter-chip ${nivel === v ? 'active' : ''}`} onClick={() => setNivel(v)}>{l}</button>
        ))}
      </div>

      {tab === 'sistema' ? (
        <DataTable columns={colsSistema} data={filtered} searchable searchPlaceholder="Buscar en logs..." />
      ) : (
        <DataTable
          columns={[
            { header: 'Nivel',   accessor: 'nivel',   render: (r) => <Badge variant={nivelVariant[r.nivel]}>{r.nivel}</Badge> },
            { header: 'Detalle', accessor: 'detalle' },
            { header: 'Usuario', accessor: 'usuario', sortable: true },
            { header: 'Fecha',   accessor: 'fecha',   sortable: true, render: (r) => datetime(r.fecha) },
          ]}
          data={colsProcessing}
          searchable
        />
      )}
    </div>
  )
}
