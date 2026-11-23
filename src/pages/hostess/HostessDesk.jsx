import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../store/auth.store'
import { PERMISSIONS } from '../../constants/permissions'
import { ROUTES } from '../../constants/routes'
import { useLoader } from '../../hooks/useLoader'
import {
  listPublishedRosters, listFloorTables, getTableAssignments, listVisits, getCoversByWaiter,
  registerVisit, seatVisit, closeVisit, cancelVisit, reassignVisit, subscribeToRoster,
} from '../../services/hostess.service'
import { setTableState, ESTADOS_MESA } from '../../services/floor.service'
import { listSurveys } from '../../services/surveys.service'
import SurveyForm from '../surveys/SurveyForm'
import { today } from '../../utils/dates'
import { number } from '../../utils/formatters'
import './hostess.css'

const EMPTY_ARRIVAL = { nombre_referencia: '', adultos: 2, ninos: 0 }

const covers = (v) => v.adultos + v.ninos * 0.5
/* A reserved table can be seated (the reservation is used); the other states can't. */
const SEATABLE = ['disponible', 'reservada']
const minutesSince = (iso, now) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
const elapsed = (mins) => (mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`)

/* Published roster whose shift contains the current time, or the first one. */
const currentRoster = (rosters) => {
  const now = new Date().toTimeString().slice(0, 8)
  return rosters.find((r) => r.turno.hora_inicio <= now && now < r.turno.hora_fin) ?? rosters[0]
}

function Stepper({ label, value, min = 0, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="stepper">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Menos ${label.toLowerCase()}`}>−</button>
        <output aria-live="polite">{value}</output>
        <button type="button" onClick={() => onChange(value + 1)} aria-label={`Más ${label.toLowerCase()}`}>+</button>
      </div>
    </div>
  )
}

export default function HostessDesk() {
  const { hasPermission } = useAuthStore()
  const canReassign = hasPermission(PERMISSIONS.REASSIGN_TABLES)
  const canSurvey = hasPermission(PERMISSIONS.CAPTURE_SURVEYS)
  // Encuesta activa para ofrecerla al liberar una mesa (la primera si hay varias).
  const surveys = useLoader(useCallback(() => (canSurvey ? listSurveys() : []), [canSurvey]))
  const activeSurvey = surveys.data.find?.((s) => s.activa && s.preguntas.some((q) => q.activa))
  const [surveyVisit, setSurveyVisit] = useState(null)
  const fecha = today()

  const rosterList = useLoader(useCallback(() => listPublishedRosters(fecha), [fecha]))
  const rosters = rosterList.data
  const [rolId, setRolId] = useState('')
  useEffect(() => {
    if (!rolId && rosters.length) setRolId(currentRoster(rosters).id)
  }, [rosters, rolId])

  const loadDesk = useCallback(async () => {
    if (!rolId) return { tables: [], assigned: [], visits: [], coversByWaiter: [] }
    const [tables, assigned, visits, coversByWaiter] = await Promise.all([
      listFloorTables(), getTableAssignments(rolId), listVisits(rolId), getCoversByWaiter(rolId),
    ])
    return { tables, assigned, visits, coversByWaiter }
  }, [rolId])
  const desk = useLoader(loadDesk)
  const { tables = [], assigned = [], visits = [], coversByWaiter = [] } = desk.data
  const { reload } = desk

  /* Other tablets' changes arrive through Realtime. */
  useEffect(() => {
    if (!rolId) return undefined
    try {
      return subscribeToRoster(rolId, () => reload())
    } catch {
      return undefined
    }
  }, [rolId, reload])

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  const [arrival, setArrival] = useState(EMPTY_ARRIVAL)
  const [choosing, setChoosing] = useState(null) // { kind: 'new' | 'waiting' | 'move', visit? }
  const [detail, setDetail] = useState(null)     // { mesa, visit? }
  const [reassign, setReassign] = useState(null) // { meseroId, motivo } while reassigning the open table
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const waiterByTable = useMemo(() => new Map(assigned.map((a) => [a.mesa_id, a])), [assigned])
  const seatedByTable = useMemo(
    () => new Map(visits.filter((v) => v.estado === 'sentada').map((v) => [v.mesa_id, v])), [visits])
  const waiting = visits.filter((v) => v.estado === 'espera')
  const waiterName = useMemo(() => new Map(coversByWaiter.map((w) => [w.empleado_id, w.mesero])), [coversByWaiter])

  /* Areas → stations → tables, in the area order of the catalog. */
  const floor = useMemo(() => {
    const areas = new Map()
    tables
      .filter((t) => t.estacion?.activo && t.estacion.area?.activo)
      .forEach((t) => {
        const { area } = t.estacion
        if (!areas.has(area.id)) areas.set(area.id, { ...area, stations: new Map() })
        const stations = areas.get(area.id).stations
        if (!stations.has(t.estacion.id)) stations.set(t.estacion.id, { ...t.estacion, tables: [] })
        stations.get(t.estacion.id).tables.push(t)
      })
    return [...areas.values()]
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
      .map((a) => ({ ...a, stations: [...a.stations.values()].sort((x, y) => x.nombre.localeCompare(y.nombre)) }))
  }, [tables])

  const seatable = (mesa) => waiterByTable.has(mesa.id) && !seatedByTable.has(mesa.id) && SEATABLE.includes(mesa.estado ?? 'disponible')
  const freeCount = tables.filter(seatable).length
  const seatedCovers = [...seatedByTable.values()].reduce((sum, v) => sum + Number(v.comensales), 0)

  const act = async (fn, success) => {
    setBusy(true)
    setNotice(null)
    try {
      await fn()
      if (success) setNotice({ type: 'success', text: success })
      await reload()
      return true
    } catch (err) {
      setNotice({ type: 'danger', text: err.message })
      return false
    } finally {
      setBusy(false)
    }
  }

  const tableLabel = (mesa) => {
    const a = waiterByTable.get(mesa.id)
    return `mesa ${mesa.numero}${a ? ` (${a.mesero})` : ''}`
  }

  const onTileClick = async (mesa) => {
    const free = seatable(mesa)
    if (choosing) {
      if (!free) return
      const { kind, visit } = choosing
      setChoosing(null)
      if (kind === 'new') {
        const ok = await act(() => registerVisit({ rol_id: rolId, ...arrival, mesa_id: mesa.id }),
          `${arrival.nombre_referencia} sentado en ${tableLabel(mesa)}.`)
        if (ok) setArrival(EMPTY_ARRIVAL)
      } else {
        act(() => seatVisit(visit.id, mesa.id),
          `${visit.nombre_referencia} ${kind === 'move' ? 'cambió a' : 'sentado en'} ${tableLabel(mesa)}.`)
      }
      return
    }
    if (!waiterByTable.has(mesa.id)) return
    setDetail({ mesa, visit: seatedByTable.get(mesa.id) })
  }

  const arrivalValid = arrival.nombre_referencia.trim() && arrival.adultos + arrival.ninos > 0

  const addToWaitlist = async () => {
    const ok = await act(() => registerVisit({ rol_id: rolId, ...arrival }), `${arrival.nombre_referencia} en lista de espera.`)
    if (ok) setArrival(EMPTY_ARRIVAL)
  }

  /* Quick seat from the table's own modal (free table tapped without choosing first). */
  const [quick, setQuick] = useState(EMPTY_ARRIVAL)
  const seatQuick = async () => {
    const { mesa } = detail
    setDetail(null)
    const ok = await act(() => registerVisit({ rol_id: rolId, ...quick, mesa_id: mesa.id }),
      `${quick.nombre_referencia} sentado en ${tableLabel(mesa)}.`)
    if (ok) setQuick(EMPTY_ARRIVAL)
  }

  const error = rosterList.error || desk.error

  if (!rosterList.loading && !rosterList.error && rosters.length === 0) {
    return (
      <div>
        <div className="page-header"><div><h1 className="page-title">Hostess</h1></div></div>
        <Alert type="warning" title="No hay rol publicado para hoy">
          Las mesas se asignan con el rol del turno. Pide al gerente o al capitán que lo publique.
        </Alert>
        {hasPermission(PERMISSIONS.MANAGE_ROSTER) && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Link to={ROUTES.ROSTER} className="btn btn-primary">Ir al rol diario</Link>
          </div>
        )}
      </div>
    )
  }

  const tileClass = (mesa) => {
    const hasWaiter = waiterByTable.has(mesa.id)
    const busyTable = seatedByTable.has(mesa.id)
    const free = seatable(mesa)
    return [
      'table-tile',
      busyTable && 'table-tile--busy',
      !busyTable && mesa.estado && mesa.estado !== 'disponible' && `table-tile--${mesa.estado}`,
      !hasWaiter && 'table-tile--nowaiter',
      choosing && free && 'table-tile--target',
      choosing && !free && 'table-tile--dim',
    ].filter(Boolean).join(' ')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hostess</h1>
          <p className="page-subtitle">
            {freeCount} mesas libres · {seatedByTable.size} ocupadas · {number(seatedCovers, 1)} comensales en sala · {waiting.length} en espera
          </p>
        </div>
        <div className="page-actions">
          {rosters.length > 1 && (
            <select className="form-select" value={rolId} onChange={(e) => { setChoosing(null); setRolId(e.target.value) }} aria-label="Turno">
              {rosters.map((r) => <option key={r.id} value={r.id}>{r.turno.nombre}</option>)}
            </select>
          )}
          {rosters.length === 1 && <span className="badge badge-success">{rosters[0].turno.nombre}</span>}
          <Button variant="secondary" onClick={reload} loading={desk.loading && !!rolId}>Actualizar</Button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert type="danger" title="No se pudo cargar la recepción">{error}</Alert>
        </div>
      )}
      {notice && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert>
        </div>
      )}

      {choosing && (
        <div className="choose-banner" role="status">
          <strong>
            {choosing.kind === 'move'
              ? `Elige la nueva mesa para ${choosing.visit.nombre_referencia}`
              : `Elige una mesa libre para ${choosing.kind === 'new' ? arrival.nombre_referencia : choosing.visit.nombre_referencia}`}
          </strong>
          <Button variant="secondary" size="sm" onClick={() => setChoosing(null)}>Cancelar</Button>
        </div>
      )}

      <div className="hostess-layout">
        <div className="card">
          <div className="hostess-legend">
            <span style={{ '--legend-color': 'var(--color-green-500)' }}>Libre</span>
            <span style={{ '--legend-color': 'var(--color-amber-500)' }}>Ocupada</span>
            <span style={{ '--legend-color': 'var(--color-blue-500)' }}>Reservada</span>
            <span style={{ '--legend-color': 'var(--color-purple-500, #8b5cf6)' }}>En limpieza</span>
            <span style={{ '--legend-color': 'var(--color-red-500)' }}>Fuera de servicio / cerrada</span>
            <span style={{ '--legend-color': 'var(--color-navy-300)' }}>Sin mesero en el rol</span>
          </div>

          {desk.loading && !tables.length && <div className="loading-screen"><div className="spinner spinner-lg" /></div>}

          {floor.map((area) => (
            <section key={area.id} className="hostess-area">
              <h3 className="section-title">{area.nombre}</h3>
              {area.stations.map((station) => {
                const waiter = waiterByTable.get(station.tables[0]?.id)
                return (
                  <div key={station.id} className="hostess-station">
                    <div className="hostess-station-title">
                      <span>{station.nombre}</span>
                      <span>{waiter ? `${waiter.mesero}${waiter.capitan ? ` · cap. ${waiter.capitan}` : ''}` : 'Sin mesero'}</span>
                    </div>
                    <div className="table-tiles">
                      {station.tables.map((mesa) => {
                        const visit = seatedByTable.get(mesa.id)
                        return (
                          <button
                            key={mesa.id}
                            type="button"
                            className={tileClass(mesa)}
                            onClick={() => onTileClick(mesa)}
                            disabled={busy || !waiterByTable.has(mesa.id)}
                            aria-label={`Mesa ${mesa.numero}, ${visit ? `ocupada por ${visit.nombre_referencia}` : !waiterByTable.has(mesa.id) ? 'sin mesero' : seatable(mesa) && mesa.estado !== 'reservada' ? 'libre' : ESTADOS_MESA[mesa.estado]?.label.toLowerCase()}`}
                          >
                            <span className="table-tile-number">{mesa.numero}</span>
                            {visit ? (
                              <>
                                <span className="table-tile-meta">{number(visit.comensales, 1)} com. · {elapsed(minutesSince(visit.hora_sentada, now))}</span>
                                <span className="table-tile-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{visit.nombre_referencia}</span>
                                {visit.mesero_id !== waiterByTable.get(mesa.id)?.mesero_id && (
                                  <span className="table-tile-meta" style={{ fontWeight: 600 }}>↪ {waiterName.get(visit.mesero_id) ?? 'otro mesero'}</span>
                                )}
                              </>
                            ) : (
                              <>
                                <span className="table-tile-meta">{mesa.capacidad} lugares</span>
                                {mesa.estado && mesa.estado !== 'disponible' && (
                                  <span className="table-tile-meta" style={{ fontWeight: 600 }}>{ESTADOS_MESA[mesa.estado]?.label}</span>
                                )}
                              </>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </section>
          ))}
        </div>

        <div className="hostess-side">
          <div className="card">
            <h3 className="section-title">Nueva llegada</h3>
            <div className="form-group">
              <label className="form-label" htmlFor="arrival-name">Nombre de referencia</label>
              <input id="arrival-name" className="form-input" value={arrival.nombre_referencia}
                onChange={(e) => setArrival((a) => ({ ...a, nombre_referencia: e.target.value }))} placeholder="Ej: Familia Pérez" />
            </div>
            <div className="grid-2">
              <Stepper label="Adultos" value={arrival.adultos} onChange={(adultos) => setArrival((a) => ({ ...a, adultos }))} />
              <Stepper label="Niños" value={arrival.ninos} onChange={(ninos) => setArrival((a) => ({ ...a, ninos }))} />
            </div>
            <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
              Cuenta como <strong>{number(covers(arrival), 1)}</strong> comensales (cada niño vale 0.5).
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button variant="primary" disabled={!arrivalValid || busy || !freeCount} onClick={() => setChoosing({ kind: 'new' })} style={{ flex: 1 }}>
                Sentar en mesa
              </Button>
              <Button variant="secondary" disabled={!arrivalValid || busy} onClick={addToWaitlist} style={{ flex: 1 }}>
                Lista de espera
              </Button>
            </div>
          </div>

          <div className="card">
            <h3 className="section-title">Lista de espera ({waiting.length})</h3>
            {waiting.length === 0 && <p className="text-sm text-muted">Nadie esperando.</p>}
            {waiting.map((v) => (
              <div key={v.id} className="waiting-item">
                <div>
                  <div style={{ fontWeight: 600 }}>{v.nombre_referencia}</div>
                  <div className="text-sm text-muted">
                    {number(v.comensales, 1)} com. ({v.adultos} ad.{v.ninos ? `, ${v.ninos} niños` : ''}) · {elapsed(minutesSince(v.hora_llegada, now))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Button variant="primary" size="sm" disabled={busy || !freeCount} onClick={() => setChoosing({ kind: 'waiting', visit: v })}>Sentar</Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(() => cancelVisit(v.id), `${v.nombre_referencia} salió de la lista de espera.`)}>Quitar</Button>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 className="section-title">Comensales por mesero</h3>
            {coversByWaiter.length === 0 && <p className="text-sm text-muted">Sin meseros en el rol.</p>}
            <table className="data-table">
              <tbody>
                {coversByWaiter.map((w) => (
                  <tr key={w.empleado_id}>
                    <td>
                      {w.mesero}
                      <div className="text-sm text-muted">{w.area}{w.es_cierre ? ' · cierre' : ''}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{number(w.comensales, 1)}</td>
                    <td className="text-sm text-muted" style={{ textAlign: 'right' }}>{w.mesas_atendidas} mesas</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <SurveyForm
        visit={surveyVisit}
        survey={activeSurvey}
        onClose={() => setSurveyVisit(null)}
        onSaved={() => { setNotice({ type: 'success', text: `Encuesta de ${surveyVisit.nombre_referencia} guardada.` }); setSurveyVisit(null) }}
      />

      <Modal
        open={!!detail}
        onClose={() => { setDetail(null); setReassign(null) }}
        title={detail ? `Mesa ${detail.mesa.numero}` : ''}
        size="sm"
        footer={detail?.visit && reassign ? (
          <>
            <Button variant="secondary" onClick={() => setReassign(null)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!reassign.meseroId || !reassign.motivo.trim()}
              onClick={() => {
                const v = detail.visit
                const { meseroId, motivo } = reassign
                setDetail(null)
                setReassign(null)
                act(() => reassignVisit(v.id, meseroId, motivo.trim()),
                  `Mesa ${detail.mesa.numero} reasignada a ${waiterName.get(meseroId)}.`)
              }}
            >
              Reasignar
            </Button>
          </>
        ) : detail?.visit ? (
          <>
            {canReassign && (
              <Button variant="secondary" onClick={() => setReassign({ meseroId: '', motivo: '' })}>
                Reasignar mesero
              </Button>
            )}
            <Button variant="secondary" onClick={() => { const v = detail.visit; setDetail(null); setChoosing({ kind: 'move', visit: v }) }}>
              Cambiar de mesa
            </Button>
            <Button variant="primary" onClick={async () => {
              const v = detail.visit
              const { mesa } = detail
              setDetail(null)
              const ok = await act(() => closeVisit(v.id), `Mesa ${mesa.numero} liberada.`)
              if (ok && activeSurvey) {
                setSurveyVisit({ visita_id: v.id, nombre_referencia: v.nombre_referencia, mesa: mesa.numero,
                  mesero: waiterName.get(v.mesero_id), comensales: v.comensales })
              }
            }}>
              Liberar mesa
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setDetail(null)}>Cancelar</Button>
            {detail && seatable(detail.mesa) && (
              <Button variant="primary" disabled={!quick.nombre_referencia.trim() || quick.adultos + quick.ninos === 0} onClick={seatQuick}>
                Sentar aquí
              </Button>
            )}
          </>
        )}
      >
        {detail && (() => {
          const a = waiterByTable.get(detail.mesa.id)
          const v = detail.visit
          return (
            <>
              <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
                Mesero: <strong>{a?.mesero}</strong>{a?.capitan ? <> · Capitán: <strong>{a.capitan}</strong></> : null} · {detail.mesa.capacidad} lugares
              </p>
              {v ? (
                <>
                  <p><strong>{v.nombre_referencia}</strong></p>
                  <p>{v.adultos} adultos{v.ninos ? `, ${v.ninos} niños` : ''} · <strong>{number(v.comensales, 1)}</strong> comensales</p>
                  <p className="text-sm text-muted">Sentados hace {elapsed(minutesSince(v.hora_sentada, now))}</p>
                  {v.mesero_id !== a?.mesero_id && (
                    <p className="text-sm" style={{ marginTop: 4 }}>Atiende: <strong>{waiterName.get(v.mesero_id)}</strong> (reasignada)</p>
                  )}
                  {reassign && (
                    <div style={{ marginTop: 'var(--space-4)' }}>
                      <div className="form-group">
                        <label className="form-label" htmlFor="reassign-waiter">Nuevo mesero responsable</label>
                        <select id="reassign-waiter" className="form-select" value={reassign.meseroId}
                          onChange={(e) => setReassign((r) => ({ ...r, meseroId: e.target.value }))}>
                          <option value="">Selecciona un mesero</option>
                          {coversByWaiter.filter((w) => w.empleado_id !== v.mesero_id).map((w) => (
                            <option key={w.empleado_id} value={w.empleado_id}>{w.mesero} · {w.area}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="reassign-reason">Motivo <span className="required">*</span></label>
                        <input id="reassign-reason" className="form-input" value={reassign.motivo}
                          onChange={(e) => setReassign((r) => ({ ...r, motivo: e.target.value }))}
                          placeholder="Ej: el mesero salió de turno" />
                      </div>
                      <p className="text-sm text-muted">La mesa no se mueve; los comensales cuentan para quien la cierre.</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="table-state">Estado de la mesa</label>
                    <select id="table-state" className="form-select" value={detail.mesa.estado ?? 'disponible'} disabled={busy}
                      onChange={async (e) => {
                        const estado = e.target.value
                        const { mesa } = detail
                        const ok = await act(() => setTableState(mesa.id, estado),
                          `Mesa ${mesa.numero}: ${ESTADOS_MESA[estado].label.toLowerCase()}.`)
                        if (ok) setDetail({ mesa: { ...mesa, estado } })
                      }}>
                      {Object.entries(ESTADOS_MESA).map(([value, e]) => <option key={value} value={value}>{e.label}</option>)}
                    </select>
                  </div>
                  {detail.mesa.estado === 'reservada' && (
                    <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>Al sentar aquí a la reserva, la mesa vuelve a disponible.</p>
                  )}
                  {seatable(detail.mesa) && (<>
                  <div className="form-group">
                    <label className="form-label" htmlFor="quick-name">Nombre de referencia</label>
                    <input id="quick-name" className="form-input" value={quick.nombre_referencia}
                      onChange={(e) => setQuick((q) => ({ ...q, nombre_referencia: e.target.value }))} autoFocus />
                  </div>
                  <div className="grid-2">
                    <Stepper label="Adultos" value={quick.adultos} onChange={(adultos) => setQuick((q) => ({ ...q, adultos }))} />
                    <Stepper label="Niños" value={quick.ninos} onChange={(ninos) => setQuick((q) => ({ ...q, ninos }))} />
                  </div>
                  </>)}
                </>
              )}
            </>
          )
        })()}
      </Modal>
    </div>
  )
}
