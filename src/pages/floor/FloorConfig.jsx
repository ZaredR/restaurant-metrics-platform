import { useMemo, useState } from 'react'
import DataTable from '../../components/ui/DataTable'
import { StatusBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Alert from '../../components/ui/Alert'
import { useAuthStore } from '../../store/auth.store'
import { PERMISSIONS } from '../../constants/permissions'
import { useLoader } from '../../hooks/useLoader'
import {
  listAreas, saveArea, listStations, saveStation,
  listTables, saveTable, createTableRange, setFloorItemActive,
} from '../../services/floor.service'

const TABS = [
  { key: 'areas',      label: 'Áreas' },
  { key: 'estaciones', label: 'Estaciones' },
  { key: 'mesas',      label: 'Mesas' },
]

/* Loads the three catalogs together: stations and tables need the others for their selects. */
const loadFloor = async () => {
  const [areas, estaciones, mesas] = await Promise.all([listAreas(), listStations(), listTables()])
  return { areas, estaciones, mesas }
}

/* Modal definitions: title, empty values and save function per kind. */
const FORMS = {
  area:    { create: 'Nueva área',     edit: 'Editar área',     empty: { nombre: '', descripcion: '', orden: 0 },    save: saveArea },
  station: { create: 'Nueva estación', edit: 'Editar estación', empty: { nombre: '', area_id: '' },                   save: saveStation },
  table:   { create: 'Nueva mesa',     edit: 'Editar mesa',     empty: { numero: '', estacion_id: '', capacidad: 4 }, save: saveTable },
  range:   { create: 'Agregar rango de mesas', empty: { estacion_id: '', desde: '', hasta: '', capacidad: 4 }, save: createTableRange },
}

export default function FloorConfig() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission(PERMISSIONS.MANAGE_FLOOR)
  const { data, loading, error, reload } = useLoader(loadFloor)
  const { areas = [], estaciones = [], mesas = [] } = data

  const [tab, setTab] = useState('areas')
  const [stationFilter, setStationFilter] = useState('')
  const [modal, setModal] = useState(null) // { kind, values }
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')

  const activeAreas = areas.filter((a) => a.activo)
  const activeStations = estaciones.filter((e) => e.activo)

  const stationRows = useMemo(() => estaciones.map((e) => ({
    ...e, area_nombre: e.area?.nombre, total_mesas: e.mesas?.[0]?.count ?? 0,
  })), [estaciones])

  const tableRows = useMemo(() => mesas
    .filter((m) => !stationFilter || m.estacion_id === stationFilter)
    .map((m) => ({ ...m, estacion_nombre: m.estacion?.nombre, area_nombre: m.estacion?.area?.nombre })),
  [mesas, stationFilter])

  const openModal = (kind, row) => {
    setFormError('')
    const { empty } = FORMS[kind]
    setModal({
      kind,
      values: row
        ? { id: row.id, ...Object.fromEntries(Object.keys(empty).map((k) => [k, row[k] ?? ''])) }
        : { ...empty },
    })
  }

  const set = (k) => (e) => setModal((m) => ({ ...m, values: { ...m.values, [k]: e.target.value } }))

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await FORMS[modal.kind].save(modal.values)
      setModal(null)
      reload()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (table, row) => {
    setActionError('')
    try {
      await setFloorItemActive(table, row.id, !row.activo)
      reload()
    } catch (err) {
      setActionError(err.message)
    }
  }

  const actionsColumn = (kind, table) => (canManage ? [{
    header: 'Acciones', key: 'actions',
    render: (r) => (
      <div className="table-actions">
        <Button variant="ghost" size="sm" onClick={() => openModal(kind, r)}>Editar</Button>
        <Button variant="ghost" size="sm" onClick={() => toggleActive(table, r)}>
          {r.activo ? 'Desactivar' : 'Activar'}
        </Button>
      </div>
    ),
  }] : [])

  const areaColumns = [
    { header: 'Orden',       accessor: 'orden', sortable: true },
    { header: 'Área',        accessor: 'nombre', sortable: true },
    { header: 'Descripción', accessor: 'descripcion' },
    { header: 'Estado',      accessor: 'activo', render: (r) => <StatusBadge active={r.activo} /> },
    ...actionsColumn('area', 'areas'),
  ]

  const stationColumns = [
    { header: 'Estación', accessor: 'nombre', sortable: true },
    { header: 'Área',     accessor: 'area_nombre', sortable: true },
    { header: 'Mesas',    accessor: 'total_mesas', sortable: true,
      render: (r) => <span className="badge badge-neutral">{r.total_mesas}</span> },
    { header: 'Estado',   accessor: 'activo', render: (r) => <StatusBadge active={r.activo} /> },
    ...actionsColumn('station', 'estaciones'),
  ]

  const tableColumns = [
    { header: 'Mesa',      accessor: 'numero', sortable: true },
    { header: 'Estación',  accessor: 'estacion_nombre', sortable: true },
    { header: 'Área',      accessor: 'area_nombre', sortable: true },
    { header: 'Capacidad', accessor: 'capacidad', sortable: true },
    { header: 'Estado',    accessor: 'activo', render: (r) => <StatusBadge active={r.activo} /> },
    ...actionsColumn('table', 'mesas'),
  ]

  const stationSelect = (value) => (
    <select className="form-select" value={value} onChange={set('estacion_id')} required>
      <option value="">Selecciona una estación</option>
      {activeStations.map((s) => <option key={s.id} value={s.id}>{s.nombre} · {s.area?.nombre}</option>)}
    </select>
  )

  const v = modal?.values

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuración del local</h1>
          <p className="page-subtitle">
            {activeAreas.length} áreas · {activeStations.length} estaciones · {mesas.filter((m) => m.activo).length} mesas activas
          </p>
        </div>
        {canManage && (
          <div className="page-actions">
            {tab === 'areas' && <Button variant="primary" onClick={() => openModal('area')}>Nueva área</Button>}
            {tab === 'estaciones' && <Button variant="primary" onClick={() => openModal('station')} disabled={!activeAreas.length}>Nueva estación</Button>}
            {tab === 'mesas' && (
              <>
                <Button variant="secondary" onClick={() => openModal('table')} disabled={!activeStations.length}>Nueva mesa</Button>
                <Button variant="primary" onClick={() => openModal('range')} disabled={!activeStations.length}>Agregar rango</Button>
              </>
            )}
          </div>
        )}
      </div>

      {(error || actionError) && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert type="danger" title="No se pudo cargar o guardar el catálogo" onClose={actionError ? () => setActionError('') : undefined}>
            {error || actionError}
          </Alert>
        </div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'areas' && (
        <DataTable columns={areaColumns} data={areas} loading={loading}
          searchPlaceholder="Buscar área..." emptyMessage="No hay áreas registradas" />
      )}

      {tab === 'estaciones' && (
        <DataTable columns={stationColumns} data={stationRows} loading={loading}
          searchPlaceholder="Buscar estación o área..." emptyMessage="No hay estaciones registradas" />
      )}

      {tab === 'mesas' && (
        <DataTable columns={tableColumns} data={tableRows} loading={loading} pageSize={15}
          searchPlaceholder="Buscar mesa..." emptyMessage="No hay mesas con este filtro"
          actions={
            <select className="form-select" value={stationFilter} onChange={(e) => setStationFilter(e.target.value)} aria-label="Filtrar por estación">
              <option value="">Todas las estaciones</option>
              {estaciones.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          }
        />
      )}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal ? FORMS[modal.kind][v.id ? 'edit' : 'create'] : ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="floor-form" loading={saving}>Guardar</Button>
          </>
        }
      >
        {modal && (
          <form id="floor-form" onSubmit={handleSave}>
            {formError && <div style={{ marginBottom: 'var(--space-4)' }}><Alert type="danger">{formError}</Alert></div>}

            {modal.kind === 'area' && (
              <>
                <div className="form-group">
                  <label className="form-label">Nombre <span className="required">*</span></label>
                  <input className="form-input" placeholder="Ej: Terraza" value={v.nombre} onChange={set('nombre')} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <input className="form-input" value={v.descripcion} onChange={set('descripcion')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Orden en listas</label>
                  <input className="form-input" type="number" min="0" value={v.orden} onChange={set('orden')} />
                </div>
              </>
            )}

            {modal.kind === 'station' && (
              <>
                <div className="form-group">
                  <label className="form-label">Nombre <span className="required">*</span></label>
                  <input className="form-input" placeholder="Ej: Terraza A" value={v.nombre} onChange={set('nombre')} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Área <span className="required">*</span></label>
                  <select className="form-select" value={v.area_id} onChange={set('area_id')} required>
                    <option value="">Selecciona un área</option>
                    {activeAreas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
              </>
            )}

            {modal.kind === 'table' && (
              <>
                <div className="form-group">
                  <label className="form-label">Número de mesa <span className="required">*</span></label>
                  <input className="form-input" type="number" min="1" value={v.numero} onChange={set('numero')} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Estación <span className="required">*</span></label>
                  {stationSelect(v.estacion_id)}
                </div>
                <div className="form-group">
                  <label className="form-label">Capacidad</label>
                  <input className="form-input" type="number" min="1" value={v.capacidad} onChange={set('capacidad')} required />
                </div>
              </>
            )}

            {modal.kind === 'range' && (
              <>
                <div className="form-group">
                  <label className="form-label">Estación <span className="required">*</span></label>
                  {stationSelect(v.estacion_id)}
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Desde la mesa <span className="required">*</span></label>
                    <input className="form-input" type="number" min="1" value={v.desde} onChange={set('desde')} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Hasta la mesa <span className="required">*</span></label>
                    <input className="form-input" type="number" min="1" value={v.hasta} onChange={set('hasta')} required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Capacidad de cada mesa</label>
                  <input className="form-input" type="number" min="1" value={v.capacidad} onChange={set('capacidad')} required />
                </div>
                <p className="text-sm text-muted">Si algún número ya existe, no se crea ninguna mesa del rango.</p>
              </>
            )}
          </form>
        )}
      </Modal>
    </div>
  )
}
