import { useCallback, useEffect, useMemo, useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../store/auth.store'
import { PERMISSIONS } from '../../constants/permissions'
import { useLoader } from '../../hooks/useLoader'
import { listShiftTypes, getConfigBool } from '../../services/schedules.service'
import { listAreas, listStations } from '../../services/floor.service'
import { puestoLabel } from '../../services/staff.service'
import { tipoAusenciaLabel } from '../../services/absences.service'
import {
  ESTADOS_ROL, needsReason, getRoster, createRoster, getAvailability, getDirectory, getPreviousStations,
  addAssignments, updateAssignment, removeAssignment, publishRoster, closeRoster,
  listAdjustments, sendToReview, returnToDraft, getConflicts, listExceptions,
} from '../../services/roster.service'
import {
  listAuthorizations, listRestrictions, slotWarnings, ESTADOS_EMPLEADO, RESTRICTION_CODE,
} from '../../services/availability.service'
import { suggestAssignments } from '../../services/rosterSuggest'
import { today, dayHeader } from '../../utils/dates'
import { datetime } from '../../utils/formatters'

/* Shift that contains the current time, or the first one. */
const currentShift = (turnos) => {
  const now = new Date().toTimeString().slice(0, 8)
  return turnos.find((t) => t.hora_inicio <= now && now < t.hora_fin) ?? turnos[0]
}

const loadCatalogs = async () => {
  const [turnos, areas, estaciones, bloquea, exigeHorario] = await Promise.all([
    listShiftTypes(), listAreas(), listStations(),
    getConfigBool('ausencias_bloquean', true), getConfigBool('exigir_horario_en_rol', false),
  ])
  const activeAreas = areas.filter((a) => a.activo)
  return {
    turnos,
    areas: activeAreas,
    // Stations of inactive areas don't show up in the roster either.
    estaciones: estaciones.filter((e) => e.activo && activeAreas.some((a) => a.id === e.area_id)),
    bloquea,
    exigeHorario,
  }
}

export default function DailyRoster() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission(PERMISSIONS.MANAGE_ROSTER)
  const canPublish = hasPermission(PERMISSIONS.PUBLISH_ROSTER)

  const catalogs = useLoader(loadCatalogs)
  const { turnos = [], areas = [], estaciones = [], bloquea = true, exigeHorario = false } = catalogs.data

  const [fecha, setFecha] = useState(today())
  const [turnoId, setTurnoId] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null) // { type, text }
  const [confirm, setConfirm] = useState(null) // 'review' | 'publish' | 'close'
  const [pending, setPending] = useState(null)  // change waiting for its reason: { description, run(motivo) }
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!turnoId && turnos.length) setTurnoId(currentShift(turnos).id)
  }, [turnos, turnoId])

  const loadRoster = useCallback(async () => {
    const none = { roster: null, availability: [], adjustments: [], conflicts: [], exceptions: [], authorizations: [], restrictions: [] }
    if (!turnoId) return none
    const [roster, availability, authorizations, restrictions] = await Promise.all([
      getRoster(fecha, turnoId),
      canManage ? getAvailability(fecha, turnoId) : getDirectory(),
      canManage ? listAuthorizations() : [],
      canManage ? listRestrictions() : [],
    ])
    const hasHistory = canManage && roster && ['publicado', 'modificado', 'cerrado'].includes(roster.estado)
    const [adjustments, conflicts, exceptions] = await Promise.all([
      hasHistory ? listAdjustments(roster.id) : [],
      canManage && roster && roster.estado !== 'cerrado' ? getConflicts(roster.id) : [],
      canManage && roster ? listExceptions(roster.id) : [],
    ])
    return { ...none, roster, availability, adjustments, conflicts, exceptions, authorizations, restrictions }
  }, [fecha, turnoId, canManage])
  const rosterData = useLoader(loadRoster)
  const {
    roster = null, availability = [], adjustments = [], conflicts = [], exceptions = [],
    authorizations = [], restrictions = [],
  } = rosterData.data
  const assignments = useMemo(() => roster?.asignaciones ?? [], [roster])

  // En revisión y cerrado no se edita; publicado y modificado sí, con motivo.
  const editable = canManage && roster && ['borrador', 'publicado', 'modificado'].includes(roster.estado)
  const byEmployee = useMemo(() => new Map(availability.map((e) => [e.empleado_id, e])), [availability])
  const name = (id) => byEmployee.get(id)?.nombre ?? '—'

  /* Why an employee can't (or shouldn't) take a slot in this shift. */
  const issue = (e) => {
    if (!canManage) return null // viewers only get names, no schedule or absences
    if (e.estado && e.estado !== 'activo') return ESTADOS_EMPLEADO[e.estado]?.label.toLowerCase()
    if (e.ausencia) return tipoAusenciaLabel(e.ausencia)
    if (e.es_descanso) return 'descanso'
    if (e.turno_id && e.turno_id !== turnoId) return 'otro turno'
    if (!e.turno_id) return 'sin horario'
    return null
  }
  const blocked = (e) => Boolean((e.estado && e.estado !== 'activo') || (e.ausencia && bloquea) || (exigeHorario && issue(e)))

  /* Restrictions and authorizations for a slot (warn only; the reason is asked when saving). */
  const warningsFor = (empleadoId, slot) => (canManage
    ? slotWarnings({ empleado_id: empleadoId, es_cierre: false, ...slot },
      { fecha, turnoId, authorizations, restrictions, stations: estaciones, areas })
    : [])

  /* <option>s for a slot: same puesto first, then the rest; taken or blocked ones disabled. */
  const options = (puesto, currentId, slot) => {
    const assigned = new Set(assignments.map((a) => a.empleado_id))
    const warned = (e) => Boolean(issue(e) || warningsFor(e.empleado_id, slot).length)
    return [...availability]
      .sort((a, b) => (a.puesto === puesto ? 0 : 1) - (b.puesto === puesto ? 0 : 1)
        || Number(warned(a)) - Number(warned(b))
        || a.nombre.localeCompare(b.nombre))
      .map((e) => {
        const why = issue(e)
        const taken = assigned.has(e.empleado_id) && e.empleado_id !== currentId
        const tags = [e.puesto !== puesto && puestoLabel(e.puesto), why, ...warningsFor(e.empleado_id, slot),
          taken && 'ya asignado'].filter(Boolean)
        return (
          <option key={e.empleado_id} value={e.empleado_id} disabled={taken || blocked(e)}>
            {e.nombre}{tags.length ? ` (${tags.join(', ')})` : ''}
          </option>
        )
      })
  }

  const act = async (fn, success) => {
    setBusy(true)
    setNotice(null)
    try {
      await fn()
      if (success) setNotice({ type: 'success', text: success })
      await rosterData.reload()
    } catch (err) {
      setNotice({ type: 'danger', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  /* Runs a change to the roster. Once published it first asks for the reason;
     in a draft it asks only if the database reports a restriction (RA001). */
  const change = async (description, run) => {
    if (needsReason(roster.estado)) {
      setReason('')
      setPending({ description, run })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      await run(undefined)
      await rosterData.reload()
    } catch (err) {
      if (err.code === RESTRICTION_CODE) {
        setReason('')
        setPending({ description, run, warning: err.message })
      } else {
        setNotice({ type: 'danger', text: err.message })
      }
    } finally {
      setBusy(false)
    }
  }

  const confirmReason = () => {
    const { run, warning } = pending
    const motivo = reason.trim()
    setPending(null)
    act(() => run(motivo), warning
      ? 'Asignado con excepción: el motivo quedó registrado.'
      : 'Cambio guardado en el historial de ajustes.')
  }

  /* Sets (or clears) the employee of a single-person slot: captain of an area or waiter of a station. */
  const setSlot = (current, empleadoId, row, label) => change(
    `${label}: ${current ? name(current.empleado_id) : 'sin asignar'} → ${empleadoId ? name(empleadoId) : 'sin asignar'}`,
    (motivo) => {
      if (current && !empleadoId) return removeAssignment(current.id, motivo)
      if (current) return updateAssignment(current.id, { empleado_id: empleadoId }, motivo)
      return addAssignments([{ rol_id: roster.id, empleado_id: empleadoId, es_cierre: false, ...row }], motivo)
    },
  )

  const suggest = () => act(async () => {
    const previousStations = await getPreviousStations(fecha, turnoId)
    const { rows, uncovered } = suggestAssignments({
      areas, stations: estaciones, assignments, availability, turnoId, previousStations,
      fits: (slot) => warningsFor(slot.empleado_id, slot).length === 0,
    })
    if (rows.length) await addAssignments(rows.map((r) => ({ ...r, rol_id: roster.id })))
    setNotice({
      type: uncovered ? 'warning' : 'success',
      text: `Se sugirieron ${rows.length} asignaciones.${uncovered ? ` Quedan ${uncovered} estaciones sin mesero disponible.` : ''} Revisa y marca los meseros de cierre antes de publicar.`,
    })
  })

  const handleConfirm = () => {
    const action = confirm
    setConfirm(null)
    if (action === 'review') act(() => sendToReview(roster.id), 'Rol enviado a revisión. Gerencia lo aprueba y publica.')
    if (action === 'publish') act(() => publishRoster(roster.id), 'Rol publicado. La hostess ya puede asignar mesas con este rol.')
    if (action === 'close') act(() => closeRoster(roster.id), 'Rol cerrado. Ya no se puede modificar.')
  }

  const meseros = assignments.filter((a) => a.funcion === 'mesero')
  const covered = estaciones.filter((s) => meseros.some((a) => a.estacion_id === s.id)).length
  const closingCount = meseros.filter((a) => a.es_cierre).length
  const freeScheduled = availability.filter((e) => e.turno_id === turnoId && !e.es_descanso && !e.ausencia
    && !assignments.some((a) => a.empleado_id === e.empleado_id))
  const hostesses = assignments.filter((a) => a.funcion === 'hostess')

  const slotSelect = (current, puesto, row, label) => (
    <select
      className="form-select"
      style={{ padding: '4px 8px', fontSize: 13 }}
      value={current?.empleado_id ?? ''}
      disabled={!editable || busy}
      onChange={(e) => setSlot(current, e.target.value, row, label)}
      aria-label={label}
    >
      <option value="">Sin asignar</option>
      {options(puesto, current?.empleado_id, { ...row, es_cierre: !!current?.es_cierre })}
    </select>
  )

  const people = (list, onRemove) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {list.length === 0 && <span className="text-sm text-muted">Nadie asignado</span>}
      {list.map((a) => (
        <span key={a.id} className="badge badge-neutral" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {name(a.empleado_id)}
          {editable && (
            <button type="button" onClick={() => onRemove(a)} disabled={busy} aria-label={`Quitar a ${name(a.empleado_id)}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
          )}
        </span>
      ))}
    </div>
  )

  const addPerson = (funcion, areaId, label) => editable && (
    <select
      className="form-select"
      style={{ padding: '4px 8px', fontSize: 13, marginTop: 8 }}
      value=""
      disabled={busy}
      onChange={(e) => {
        const empleadoId = e.target.value
        if (!empleadoId) return
        change(`${label}: ${name(empleadoId)}`, (motivo) => addAssignments([{
          rol_id: roster.id, empleado_id: empleadoId, funcion, area_id: areaId, estacion_id: null, es_cierre: false,
        }], motivo))
      }}
      aria-label={label}
    >
      <option value="">+ Agregar {funcion === 'runner' ? 'runner' : 'hostess'}</option>
      {options(funcion, null, { funcion, area_id: areaId, estacion_id: null })}
    </select>
  )

  const remove = (a) => change(`Quitar a ${name(a.empleado_id)} (${a.funcion})`, (motivo) => removeAssignment(a.id, motivo))

  /* Readable summary of an entry of rol_ajustes. */
  const placeOf = (r) => estaciones.find((s) => s.id === r?.estacion_id)?.nombre
    ?? areas.find((a) => a.id === r?.area_id)?.nombre ?? ''
  const describeAdjustment = (adj) => {
    const { antes, despues } = adj
    const r = despues ?? antes
    const where = [r.funcion, placeOf(r)].filter(Boolean).join(' · ')
    if (adj.accion === 'alta') return `Alta de ${name(r.empleado_id)} (${where})`
    if (adj.accion === 'baja') return `Baja de ${name(r.empleado_id)} (${where})`
    if (antes.empleado_id !== despues.empleado_id) return `${name(antes.empleado_id)} → ${name(despues.empleado_id)} (${where})`
    if (antes.es_cierre !== despues.es_cierre) return `${name(r.empleado_id)}: ${despues.es_cierre ? 'marcado' : 'quitado'} de cierre (${where})`
    return `Cambio en ${where}`
  }
  const error = catalogs.error || rosterData.error
  const estado = roster && ESTADOS_ROL[roster.estado]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rol diario</h1>
          <p className="page-subtitle" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {dayHeader(fecha)}
            {estado && <Badge variant={estado.variant}>{estado.label}</Badge>}
            {roster?.publicado_at && <span className="text-sm text-muted">· publicado {datetime(roster.publicado_at)}</span>}
          </p>
        </div>
        <div className="page-actions">
          <input className="form-input" type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} aria-label="Fecha" />
          <select className="form-select" value={turnoId} onChange={(e) => setTurnoId(e.target.value)} aria-label="Turno">
            {turnos.map((t) => <option key={t.id} value={t.id}>{t.nombre} ({t.hora_inicio.slice(0, 5)}–{t.hora_fin.slice(0, 5)})</option>)}
          </select>
          {editable && roster.estado === 'borrador' && (
            <>
              <Button variant="secondary" onClick={suggest} loading={busy}>Sugerir asignación</Button>
              {canPublish
                ? <Button variant="primary" onClick={() => setConfirm('publish')} disabled={busy}>Publicar</Button>
                : <Button variant="primary" onClick={() => setConfirm('review')} disabled={busy}>Enviar a revisión</Button>}
            </>
          )}
          {canPublish && roster?.estado === 'en_revision' && (
            <>
              <Button variant="secondary" onClick={() => act(() => returnToDraft(roster.id), 'Rol regresado a borrador.')} disabled={busy}>Regresar a borrador</Button>
              <Button variant="primary" onClick={() => setConfirm('publish')} disabled={busy}>Aprobar y publicar</Button>
            </>
          )}
          {editable && needsReason(roster.estado) && (
            <Button variant="secondary" onClick={() => setConfirm('close')} disabled={busy}>Cerrar rol</Button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert type="danger" title="No se pudo cargar el rol">{error}</Alert>
        </div>
      )}
      {notice && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert>
        </div>
      )}
      {canManage && roster?.estado === 'en_revision' && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert type="info">
            {canPublish
              ? 'Este rol espera tu aprobación. Para cambiarlo, regrésalo a borrador.'
              : 'Rol enviado a revisión: gerencia lo aprueba y publica. Mientras tanto no se puede editar.'}
          </Alert>
        </div>
      )}
      {editable && needsReason(roster.estado) && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert type="info">El rol ya está publicado: cada cambio pide un motivo y queda en el historial de ajustes.</Alert>
        </div>
      )}

      {error ? null : (catalogs.loading || rosterData.loading || (!turnoId && turnos.length > 0)) && !roster ? (
        <div className="loading-screen"><div className="spinner spinner-lg" /></div>
      ) : !turnos.length ? (
        <Alert type="warning">No hay turnos configurados. Dalos de alta en la tabla <code>turnos</code> de Supabase.</Alert>
      ) : !roster ? (
        !error && (
          <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8, 2rem)' }}>
            <p style={{ marginBottom: 'var(--space-4)' }}>Todavía no hay rol para este día y turno.</p>
            {canManage
              ? <Button variant="primary" loading={busy} onClick={() => act(() => createRoster(fecha, turnoId))}>Crear rol</Button>
              : <p className="text-sm text-muted">Lo crea el gerente o el capitán.</p>}
          </div>
        )
      ) : (
        <>
          <div className="grid-kpi" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="card"><p className="text-sm text-muted">Estaciones cubiertas</p><h3>{covered} / {estaciones.length}</h3></div>
            <div className="card"><p className="text-sm text-muted">Meseros de cierre</p><h3>{closingCount}</h3></div>
            <div className="card"><p className="text-sm text-muted">Personas en el rol</p><h3>{assignments.length}</h3></div>
            {canManage && <div className="card"><p className="text-sm text-muted">Programados sin asignar</p><h3>{freeScheduled.length}</h3></div>}
          </div>

          {canManage && conflicts.length > 0 && (
            <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
              <h3 className="section-title">Conflictos por revisar ({conflicts.length})</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                {conflicts.map((c, i) => (
                  <li key={`${c.tipo}-${c.asignacion_id ?? ''}-${i}`} className="text-sm" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <Badge variant={c.severidad === 'error' ? 'danger' : 'warning'}>{c.severidad === 'error' ? 'Bloquea' : 'Aviso'}</Badge>
                    <span>{c.descripcion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid-2">
            {areas.map((area) => {
              const captain = assignments.find((a) => a.funcion === 'capitan' && a.area_id === area.id)
              const areaStations = estaciones.filter((s) => s.area_id === area.id)
              const runners = assignments.filter((a) => a.funcion === 'runner' && a.area_id === area.id)
              return (
                <div key={area.id} className="card">
                  <h3 className="section-title">{area.nombre}</h3>

                  <div className="form-group">
                    <label className="form-label">Capitán</label>
                    {slotSelect(captain, 'capitan', { funcion: 'capitan', area_id: area.id, estacion_id: null }, `Capitán de ${area.nombre}`)}
                  </div>

                  <table className="data-table" style={{ marginBottom: 'var(--space-4)' }}>
                    <thead>
                      <tr><th>Estación</th><th>Mesero</th><th>Cierre</th></tr>
                    </thead>
                    <tbody>
                      {areaStations.length === 0 && (
                        <tr><td colSpan={3} className="text-sm text-muted">Esta área no tiene estaciones activas</td></tr>
                      )}
                      {areaStations.map((s) => {
                        const waiter = meseros.find((a) => a.estacion_id === s.id)
                        return (
                          <tr key={s.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {s.nombre}
                              <div className="text-sm text-muted">{s.mesas?.[0]?.count ?? 0} mesas</div>
                            </td>
                            <td>{slotSelect(waiter, 'mesero', { funcion: 'mesero', area_id: area.id, estacion_id: s.id }, `Mesero de ${s.nombre}`)}</td>
                            <td>
                              <input
                                type="checkbox"
                                checked={!!waiter?.es_cierre}
                                disabled={!editable || !waiter || busy}
                                onChange={(e) => {
                                  const checked = e.target.checked
                                  change(
                                    `${s.nombre}: ${checked ? 'marcar' : 'quitar'} de cierre a ${name(waiter.empleado_id)}`,
                                    (motivo) => updateAssignment(waiter.id, { es_cierre: checked }, motivo),
                                  )
                                }}
                                aria-label={`${s.nombre}: mesero de cierre`}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  <label className="form-label">Runners</label>
                  {people(runners, remove)}
                  {addPerson('runner', area.id, `Agregar runner a ${area.nombre}`)}
                </div>
              )
            })}

            <div className="card">
              <h3 className="section-title">Hostess</h3>
              {people(hostesses, remove)}
              {addPerson('hostess', null, 'Agregar hostess')}

              {canManage && (
                <>
                  <h3 className="section-title" style={{ marginTop: 'var(--space-6, 1.5rem)' }}>Programados sin asignar</h3>
                  {freeScheduled.length === 0
                    ? <p className="text-sm text-muted">Todo el personal programado en este turno ya está en el rol.</p>
                    : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {freeScheduled.map((e) => (
                          <span key={e.empleado_id} className="badge badge-info">{e.nombre} · {puestoLabel(e.puesto)}</span>
                        ))}
                      </div>
                    )}
                </>
              )}
            </div>
          </div>

          {canManage && exceptions.length > 0 && (
            <div className="card" style={{ marginTop: 'var(--space-4)' }}>
              <h3 className="section-title">Asignaciones con excepción ({exceptions.length})</h3>
              <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
                Personas asignadas a pesar de una restricción, con el motivo.
              </p>
              <table className="data-table">
                <thead>
                  <tr><th>Fecha</th><th>Quién</th><th>Empleado</th><th>Advertencia</th><th>Motivo</th></tr>
                </thead>
                <tbody>
                  {exceptions.map((x) => (
                    <tr key={x.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{datetime(x.created_at)}</td>
                      <td>{x.usuario_nombre ?? '—'}</td>
                      <td>{name(x.empleado_id)}</td>
                      <td>{x.advertencias.join('; ')}</td>
                      <td>{x.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canManage && adjustments.length > 0 && (
            <div className="card" style={{ marginTop: 'var(--space-4)' }}>
              <h3 className="section-title">Historial de ajustes ({adjustments.length})</h3>
              <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
                Cambios hechos después de publicar el rol.
              </p>
              <table className="data-table">
                <thead>
                  <tr><th>Fecha</th><th>Quién</th><th>Cambio</th><th>Motivo</th></tr>
                </thead>
                <tbody>
                  {adjustments.map((adj) => (
                    <tr key={adj.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{datetime(adj.created_at)}</td>
                      <td>{adj.usuario_nombre ?? '—'}</td>
                      <td>{describeAdjustment(adj)}</td>
                      <td>{adj.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending?.warning ? 'Asignar con excepción' : 'Motivo del cambio'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="reason-form" disabled={!reason.trim()}>Guardar cambio</Button>
          </>
        }
      >
        {pending && (
          <form id="reason-form" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) confirmReason() }}>
            <p style={{ marginBottom: 'var(--space-3)' }}><strong>{pending.description}</strong></p>
            {pending.warning && (
              <div style={{ marginBottom: 'var(--space-3)' }}><Alert type="warning">{pending.warning}</Alert></div>
            )}
            <div className="form-group">
              <label className="form-label" htmlFor="adjust-reason">¿Por qué se hace el cambio? <span className="required">*</span></label>
              <input
                id="adjust-reason"
                className="form-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: Ana se reportó enferma"
                autoFocus
                required
              />
            </div>
            <p className="text-sm text-muted">
              {pending.warning
                ? 'Si lo asignas de todos modos, el motivo queda registrado en las excepciones del rol.'
                : 'El rol ya está publicado: el cambio queda en el historial de ajustes.'}
            </p>
          </form>
        )}
      </Modal>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={{ review: 'Enviar a revisión', publish: 'Aprobar y publicar rol', close: 'Cerrar rol' }[confirm] ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>Cancelar</Button>
            <Button variant="primary" onClick={handleConfirm}>
              {{ review: 'Enviar a revisión', publish: 'Publicar', close: 'Cerrar rol' }[confirm]}
            </Button>
          </>
        }
      >
        {confirm === 'review' || confirm === 'publish' ? (
          <>
            <p>Se cubrirán <strong>{covered} de {estaciones.length}</strong> estaciones, con <strong>{closingCount}</strong> meseros de cierre.</p>
            {covered < estaciones.length && <p className="text-sm text-muted" style={{ marginTop: 8 }}>Las mesas de estaciones sin mesero no se podrán asignar a clientes.</p>}
            {conflicts.length > 0 && (
              <p className="text-sm" style={{ marginTop: 8 }}>
                Hay <strong>{conflicts.length}</strong> conflictos por revisar{conflicts.some((c) => c.severidad === 'error') ? ', algunos bloquean' : ''}.
              </p>
            )}
            <p className="text-sm text-muted" style={{ marginTop: 8 }}>
              {confirm === 'review'
                ? 'Gerencia revisa y publica el rol. Mientras está en revisión no se puede editar.'
                : 'Después de publicar, cada cambio pide un motivo y queda en el historial de ajustes.'}
            </p>
          </>
        ) : (
          <p>Al cerrar el rol ya no se podrán registrar visitas ni cambiar asignaciones de este turno.</p>
        )}
      </Modal>
    </div>
  )
}
