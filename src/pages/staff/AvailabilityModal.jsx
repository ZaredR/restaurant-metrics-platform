import { useCallback, useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import { useLoader } from '../../hooks/useLoader'
import { listAreas, listStations } from '../../services/floor.service'
import { listShiftTypes } from '../../services/schedules.service'
import {
  listAuthorizations, setAuthorizations, listRestrictions, addRestriction, removeRestriction,
  describeRestriction, TIPOS_RESTRICCION, DIAS,
} from '../../services/availability.service'

const EMPTY_RESTRICTION = { tipo: 'no_cierre', turno_id: '', area_id: '', dia_semana: '1', fecha_inicio: '', fecha_fin: '', descripcion: '' }

/* Where an employee can work and their restrictions (contextualización 3.1).
   Read-only unless `canManage`. */
export default function AvailabilityModal({ employee, canManage, onClose }) {
  const load = useCallback(async () => {
    if (!employee) return null
    const [areas, stations, turnos, auth, restrictions] = await Promise.all([
      listAreas(), listStations(), listShiftTypes(), listAuthorizations(employee.id), listRestrictions(employee.id),
    ])
    return {
      areas: areas.filter((a) => a.activo),
      stations: stations.filter((s) => s.activo),
      turnos, auth, restrictions,
    }
  }, [employee])
  const { data, loading, error, reload } = useLoader(load)
  const { areas = [], stations = [], turnos = [], restrictions = [] } = data ?? {}

  const [areaIds, setAreaIds] = useState([])
  const [stationIds, setStationIds] = useState([])
  const [draft, setDraft] = useState(EMPTY_RESTRICTION)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    const saved = data?.auth ?? []
    setAreaIds(saved.filter((a) => a.area_id).map((a) => a.area_id))
    setStationIds(saved.filter((a) => a.estacion_id).map((a) => a.estacion_id))
  }, [data])
  useEffect(() => { setNotice(null); setDraft(EMPTY_RESTRICTION) }, [employee])

  const act = async (fn, success) => {
    setBusy(true)
    setNotice(null)
    try {
      await fn()
      setNotice({ type: 'success', text: success })
      await reload()
      return true
    } catch (err) {
      setNotice({ type: 'danger', text: err.message })
      return false
    } finally {
      setBusy(false)
    }
  }

  const toggle = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const needs = TIPOS_RESTRICCION[draft.tipo]?.needs
  const draftValid = (needs !== 'turno' || draft.turno_id) && (needs !== 'area' || draft.area_id)
    && (needs !== 'descripcion' || draft.descripcion.trim())
    && (!draft.fecha_inicio || !draft.fecha_fin || draft.fecha_inicio <= draft.fecha_fin)
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }))

  const saveRestriction = async (e) => {
    e.preventDefault()
    const ok = await act(() => addRestriction({ ...draft, empleado_id: employee.id }), 'Restricción agregada.')
    if (ok) setDraft(EMPTY_RESTRICTION)
  }

  const name = employee ? [employee.nombre, employee.apellidos].filter(Boolean).join(' ') : ''

  return (
    <Modal open={!!employee} onClose={onClose} title={`Disponibilidad · ${name}`} size="lg"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
      {error && <Alert type="danger">{error}</Alert>}
      {notice && <div style={{ marginBottom: 'var(--space-3)' }}><Alert type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert></div>}
      {loading && !data?.areas ? <div className="loading-screen"><div className="spinner" /></div> : (
        <>
          <h4 className="section-title">Dónde puede trabajar</h4>
          <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
            Sin nada marcado puede trabajar en cualquier área. Marcar un área cubre todas sus estaciones.
          </p>
          <div className="grid-2" style={{ marginBottom: 'var(--space-3)' }}>
            {areas.map((area) => (
              <div key={area.id}>
                <label className="text-sm" style={{ display: 'flex', gap: 6, fontWeight: 600 }}>
                  <input type="checkbox" disabled={!canManage || busy} checked={areaIds.includes(area.id)}
                    onChange={() => toggle(areaIds, setAreaIds, area.id)} />
                  {area.nombre} (toda el área)
                </label>
                {stations.filter((s) => s.area_id === area.id).map((s) => (
                  <label key={s.id} className="text-sm" style={{ display: 'flex', gap: 6, marginLeft: 22 }}>
                    <input type="checkbox" disabled={!canManage || busy || areaIds.includes(area.id)}
                      checked={areaIds.includes(area.id) || stationIds.includes(s.id)}
                      onChange={() => toggle(stationIds, setStationIds, s.id)} />
                    {s.nombre}
                  </label>
                ))}
              </div>
            ))}
          </div>
          {canManage && (
            <Button variant="secondary" size="sm" loading={busy}
              onClick={() => act(() => setAuthorizations(employee.id, {
                areaIds,
                estacionIds: stationIds.filter((id) => !areaIds.includes(stations.find((s) => s.id === id)?.area_id)),
              }), 'Áreas y estaciones guardadas.')}>
              Guardar áreas y estaciones
            </Button>
          )}

          <h4 className="section-title" style={{ marginTop: 'var(--space-6, 1.5rem)' }}>Restricciones</h4>
          <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
            Al armar el rol se avisa; para asignarlo de todos modos se pide un motivo que queda registrado.
          </p>
          {restrictions.length === 0 && <p className="text-sm text-muted">Sin restricciones.</p>}
          {restrictions.map((r) => (
            <div key={r.id} className="waiting-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-color)' }}>
              <span className="text-sm">{describeRestriction(r, { turnos, areas })}</span>
              {canManage && (
                <Button variant="ghost" size="sm" disabled={busy}
                  onClick={() => act(() => removeRestriction(r.id), 'Restricción eliminada.')}>Quitar</Button>
              )}
            </div>
          ))}

          {canManage && (
            <form onSubmit={saveRestriction} style={{ marginTop: 'var(--space-4)' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="r-tipo">Nueva restricción</label>
                  <select id="r-tipo" className="form-select" value={draft.tipo} onChange={set('tipo')}>
                    {Object.entries(TIPOS_RESTRICCION).map(([value, t]) => <option key={value} value={value}>{t.label}</option>)}
                  </select>
                </div>
                {needs === 'turno' && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="r-turno">Turno</label>
                    <select id="r-turno" className="form-select" value={draft.turno_id} onChange={set('turno_id')} required>
                      <option value="">Selecciona</option>
                      {turnos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                  </div>
                )}
                {needs === 'area' && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="r-area">Área</label>
                    <select id="r-area" className="form-select" value={draft.area_id} onChange={set('area_id')} required>
                      <option value="">Selecciona</option>
                      {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                  </div>
                )}
                {needs === 'dia' && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="r-dia">Día</label>
                    <select id="r-dia" className="form-select" value={draft.dia_semana} onChange={set('dia_semana')}>
                      {DIAS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label" htmlFor="r-desde">Desde (opcional)</label>
                  <input id="r-desde" type="date" className="form-input" value={draft.fecha_inicio} onChange={set('fecha_inicio')} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="r-hasta">Hasta (opcional)</label>
                  <input id="r-hasta" type="date" className="form-input" value={draft.fecha_fin} onChange={set('fecha_fin')} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="r-desc">
                  {needs === 'descripcion' ? <>Descripción <span className="required">*</span></> : 'Nota (opcional)'}
                </label>
                <input id="r-desc" className="form-input" value={draft.descripcion} onChange={set('descripcion')}
                  placeholder={needs === 'descripcion' ? 'Ej: puede cubrir una estación extra solo si hay una ausencia' : ''} />
              </div>
              <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>Sin fechas la restricción es permanente.</p>
              <Button variant="primary" size="sm" type="submit" disabled={!draftValid} loading={busy}>Agregar restricción</Button>
            </form>
          )}
        </>
      )}
    </Modal>
  )
}
