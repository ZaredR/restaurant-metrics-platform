import { useState } from 'react'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import { datetime, currency } from '../../utils/formatters'

const MOCK_GENERAL = [
  { id: '1', tipo: 'reporte',    desc: 'Reporte mayo_w1.xlsx procesado',    usuario: 'Ana García',  fecha: '2026-05-20T10:00:00' },
  { id: '2', tipo: 'incentivo',  desc: 'Incentivo "Mayor upsell" creado',   usuario: 'Ana García',  fecha: '2026-05-01T09:00:00' },
  { id: '3', tipo: 'aviso',      desc: 'Aviso "Reunión viernes" publicado', usuario: 'Carlos López',fecha: '2026-05-26T10:00:00' },
  { id: '4', tipo: 'usuario',    desc: 'Nuevo mesero Diego Ruiz registrado',usuario: 'Ana García',  fecha: '2026-04-15T14:00:00' },
  { id: '5', tipo: 'reporte',    desc: 'Reporte abril_w4.xlsx procesado',   usuario: 'Juan Pérez',  fecha: '2026-04-28T11:00:00' },
]

const MOCK_INCENTIVOS = [
  { id: '1', nombre: 'Mayor ticket marzo', ganador: 'María González', premio: 'Bono $300', fecha: '2026-03-31' },
  { id: '2', nombre: 'Top ventas feb',     ganador: 'Diego Ruiz',     premio: 'Día libre', fecha: '2026-02-28' },
  { id: '3', nombre: 'Mayor upsell ene',   ganador: 'Carlos Herrera', premio: 'Bono $200', fecha: '2026-01-31' },
]

const tipoVariant = { reporte: 'info', incentivo: 'brand', aviso: 'warning', usuario: 'neutral' }

export default function History() {
  const [tab, setTab] = useState('general')

  const colsGeneral = [
    { header: 'Tipo',     accessor: 'tipo',    render: (r) => <Badge variant={tipoVariant[r.tipo]}>{r.tipo}</Badge> },
    { header: 'Evento',   accessor: 'desc',    sortable: true },
    { header: 'Usuario',  accessor: 'usuario', sortable: true },
    { header: 'Fecha',    accessor: 'fecha',   sortable: true, render: (r) => datetime(r.fecha) },
  ]

  const colsIncentivos = [
    { header: 'Incentivo', accessor: 'nombre',  sortable: true },
    { header: 'Ganador',   accessor: 'ganador', sortable: true },
    { header: 'Premio',    accessor: 'premio',  render: (r) => <span className="badge badge-success">{r.premio}</span> },
    { header: 'Fecha cierre', accessor: 'fecha', sortable: true },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Historial</h1>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>Actividad general</button>
        <button className={`tab-btn ${tab === 'incentivos' ? 'active' : ''}`} onClick={() => setTab('incentivos')}>Historial de incentivos</button>
      </div>

      {tab === 'general' ? (
        <DataTable columns={colsGeneral} data={MOCK_GENERAL} searchable searchPlaceholder="Buscar evento..." />
      ) : (
        <DataTable columns={colsIncentivos} data={MOCK_INCENTIVOS} searchable searchPlaceholder="Buscar incentivo..." />
      )}
    </div>
  )
}
