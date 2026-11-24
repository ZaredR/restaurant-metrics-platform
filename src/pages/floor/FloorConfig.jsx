import { useMemo, useState } from 'react'
import DataTable from '../../components/ui/DataTable'
import Badge, { StatusBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Alert from '../../components/ui/Alert'
import { useAuthStore } from '../../store/auth.store'
import { PERMISSIONS } from '../../constants/permissions'
import { useLoader } from '../../hooks/useLoader'
import {
  listAreas, saveArea, listStations, saveStation,
  listTables, saveTable, createTableRange, setFloorItemActive, setTableState, ESTADOS_MESA,
  tableRanges, listRunnerFunctions, saveRunnerFunction,
} from '../../services/floor.service'

const TABS = [
  { key: 'areas',      label: 'Áreas' },
  { key: 'estaciones', label: 'Estaciones' },
  { key: 'mesas',      label: 'Mesas' },
  { key: 'runners',    label: 'Funciones de runner' },
]

/* Loads the three catalogs together: stations and tables need the others for their selects. */
const loadFloor = async () => {
  const [areas, estaciones, mesas, funciones] = await Promise.all([listAreas(), listStations(), listTables(), listRunnerFunctions()])
  return { areas, estaciones, mesas, funciones }
}

/* Modal definitions: title, empty values and save function per kind. */
const FORMS = {
  area:    { create: 'Nueva área',     edit: 'Editar área',     empty: { nombre: '', descripcion: '', orden: 0 },    save: saveArea },
  station: { create: 'Nueva estación', edit: 'Editar estación', empty: { nombre: '', area_id: '' },                   save: saveStation },
  table:   { create: 'Nueva mesa',     edit: 'Editar mesa',     empty: { numero: '', area_id: '', estacion_id: '', capacidad: 4 }, save: saveTable },
  range:   { create: 'Agregar rango de mesas', empty: { area_id: '', estacion_id: '', desde: '', hasta: '', capacidad: 4 }, save: createTableRange },
  runner:  { create: 'Nueva función de runner', edit: 'Editar función', empty: { nombre: '', orden: 0 }, save: saveRunnerFunction },
}

export default function FloorConfig() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission(PERMISSIONS.MANAGE_FLOOR)
  // Disponible, reservada, en limpieza…: la operación diaria, no el catálogo.
  const canChangeState = hasPermission(PERMISSIONS.HOSTESS_DESK)
  const { data, loading, error, reload } = useLoader(loadFloor)
  const { areas = [], estaciones = [], mesas = [], funciones = [] } = data

  const [tab, setTab] = useState('areas')
  const [areaFilter, setAreaFilter] = useState('')
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
    .filter((m) => !areaFilter || m.area_id === areaFilter)
    .map((m) => ({ ...m, estacion_nombre: m.estacion?.nombre ?? 'Sin estación', area_nombre: m.area?.nombre })),
  [mesas, areaFilter])

  /* Ranges per area, as in the pilot version: "Salón · 12 mesas · 1–12". */
  const areaRanges = useMemo(() => activeAreas.map((a) => {
    const inArea = mesas.filter((m) => m.activo && m.area_id === a.id)
    return { ...a, total: inArea.length, ranges: tableRanges(inArea.map((m) => m.numero)), sinEstacion: inArea.filter((m) => !m.estacion_id).length }
  }).filter((a) => a.total), [activeAreas, mesas])

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

  const changeState = async (row, estado) => {
    setActionError('')
    try {
      await setTableState(row.id, estado)
      reload()
    } catch (err) {
      setActionError(err.message)
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
    { header: 'Operación', accessor: 'estado', sortable: true,
      render: (r) => (canChangeState && r.activo ? (
        <select className="form-select" style={{ padding: '2px 6px', fontSize: 13 }} value={r.estado}
          onChange={(e) => changeState(r, e.target.value)} aria-label={`Estado operativo de la mesa ${r.numero}`}>
          {Object.entries(ESTADOS_MESA).map(([value, e]) => <option key={value} value={value}>{e.label}</option>)}
        </select>
      ) : <Badge variant={ESTADOS_MESA[r.estado]?.variant}>{ESTADOS_MESA[r.estado]?.label ?? r.estado}</Badge>) },
    ...actionsColumn('table', 'mesas'),
  ]

  /* Area first; the station is optional and limited to that area. */
  const areaAndStation = (values) => (
    <>
      <div className="form-group">
        <label className="form-label">Área <span className="required">*</span></label>
        <select className="form-select" value={values.area_id}
          onChange={(e) => setModal((m) => ({ ...m, values: { ...m.values, area_id: e.target.value, estacion_id: '' } }))} required>
          <option value="">Selecciona un área</option>
          {activeAreas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Estación (opcional)</label>
        <select className="form-select" value={values.estacion_id} onChange={set('estacion_id')} disabled={!values.area_id}>
          <option value="">Sin estación</option>
          {activeStations.filter((s) => s.area_id === values.area_id).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <p className="text-sm text-muted" style={{ marginTop: 4 }}>
          Sin estación, la mesa se atiende cuando el área trabaja en TIROS (se define en el Rol diario).
        </p>
      </div>
    </>
  )

  const runnerColumns = [
    { header: 'Orden',   accessor: 'orden', sortable: true },
    { header: 'Función', accessor: 'nombre', sortable: true },
    { header: 'Estado',  accessor: 'activo', render: (r) => <StatusBadge active={r.activo} /> },
    ...actionsColumn('runner', 'funciones_runner'),
  ]

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
                <Button variant="secondary" onClick={() => openModal('table')} disabled={!activeAreas.length}>Nueva mesa</Button>
                <Button variant="primary" onClick={() => openModal('range')} disabled={!activeAreas.length}>Agregar rango</Button>
              </>
            )}
            {tab === 'runners' && <Button variant="primary" onClick={() => openModal('runner')}>Nueva función</Button>}
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
        <>
          {areaRanges.length > 0 && (
            <div className="floor-ranges">
              {areaRanges.map((a) => (
                <div key={a.id} className="card floor-range">
                  <h3 className="section-title" style={{ marginBottom: 2 }}>{a.nombre}</h3>
                  <p className="text-sm text-muted">{a.total} mesas{a.sinEstacion ? ` · ${a.sinEstacion} sin estación` : ''}</p>
                  <div className="floor-range-chips">
                    {a.ranges.map((r) => <span key={r} className="floor-range-chip">{r}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <DataTable columns={tableColumns} data={tableRows} loading={loading} pageSize={15}
            searchPlaceholder="Buscar mesa..." emptyMessage="No hay mesas con este filtro"
            actions={
              <select className="form-select" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Filtrar por área">
                <option value="">Todas las áreas</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            }
          />
        </>
      )}

      {tab === 'runners' && (
        <>
          <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
            Funciones de cocina para asignar runners en el Rol diario (por ejemplo Fría, Caliente, Descamoche, Stand boy).
          </p>
          <DataTable columns={runnerColumns} data={funciones} loading={loading}
            searchPlaceholder="Buscar función..." emptyMessage="No hay funciones registradas" />
        </>
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
                {areaAndStation(v)}
                <div className="form-group">
                  <label className="form-label">Capacidad</label>
                  <input className="form-input" type="number" min="1" value={v.capacidad} onChange={set('capacidad')} required />
                </div>
              </>
            )}

            {modal.kind === 'range' && (
              <>
                {areaAndStation(v)}
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

            {modal.kind === 'runner' && (
              <>
                <div className="form-group">
                  <label className="form-label">Nombre <span className="required">*</span></label>
                  <input className="form-input" placeholder="Ej: Fría" value={v.nombre} onChange={set('nombre')} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Orden en listas</label>
                  <input className="form-input" type="number" min="0" value={v.orden} onChange={set('orden')} />
                </div>
              </>
            )}
          </form>
        )}
      </Modal>
    </div>
  )
}
