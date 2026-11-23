import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Modal from '../../components/ui/Modal'
import ExportButton from '../../components/ui/ExportButton'
import { useAuthStore } from '../../store/auth.store'
import { PERMISSIONS } from '../../constants/permissions'
import { ROUTES } from '../../constants/routes'
import { useLoader } from '../../hooks/useLoader'
import { listShiftTypes } from '../../services/schedules.service'
import { getRoster, getDirectory, ESTADOS_ROL } from '../../services/roster.service'
import {
  METODOS, ESTADOS_CIERRE, FUNCIONES, getClosing, listClosingEvents, getExitOrder, countSeatedVisits,
  prepareClosing, addParticipant, removeParticipant, calculateClosing, adjustParticipant,
  returnClosingToDraft, authorizeClosing,
} from '../../services/closing.service'
import { today, dayHeader } from '../../utils/dates'
import { number, datetime } from '../../utils/formatters'

// Whole pesos, with cents only when the fund has them.
const currency = (v) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(v ?? 0))

const EMPTY_FORM = {
  fondo: '', metodo: '', puntos_por_comensal: 1,
  puntos: { capitan: 0, runner: 0, hostess: 0 }, porcentaje_equitativo: 30,
}

const ACCIONES = {
  preparar: 'Preparó el cierre', calcular: 'Calculó la propuesta', ajustar: 'Ajustó un monto',
  regresar: 'Regresó a borrador', autorizar: 'Autorizó el cierre', participante: 'Cambió participantes',
}

/* Shift that contains the current time, or the first one. */
const currentShift = (turnos) => {
  const now = new Date().toTimeString().slice(0, 8)
  return turnos.find((t) => t.hora_inicio <= now && now < t.hora_fin) ?? turnos[0]
}

export default function ShiftClosing() {
  const { hasPermission } = useAuthStore()
  const canAuthorize = hasPermission(PERMISSIONS.AUTHORIZE_CLOSING)

  const shifts = useLoader(listShiftTypes)
  const turnos = shifts.data
  const [fecha, setFecha] = useState(today())
  const [turnoId, setTurnoId] = useState('')
  useEffect(() => {
    if (!turnoId && turnos.length) setTurnoId(currentShift(turnos).id)
  }, [turnos, turnoId])

  const load = useCallback(async () => {
    const none = { roster: null, closing: null, directory: [], events: [], exitOrder: [], seated: 0 }
    if (!turnoId) return none
    const [roster, directory] = await Promise.all([getRoster(fecha, turnoId), getDirectory()])
    if (!roster) return { ...none, directory }
    const [closing, exitOrder, seated] = await Promise.all([
      getClosing(roster.id), getExitOrder(roster.id), countSeatedVisits(roster.id),
    ])
    const events = closing ? await listClosingEvents(closing.id) : []
    return { roster, closing, directory, events, exitOrder, seated }
  }, [fecha, turnoId])
  const data = useLoader(load)
  const { roster = null, closing = null, directory = [], events = [], exitOrder = [], seated = 0 } = data.data

  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [adjusting, setAdjusting] = useState(null) // { participante, ajuste, motivo }
  const [confirmAuth, setConfirmAuth] = useState(false)
  const [newPerson, setNewPerson] = useState({ empleado_id: '', funcion: 'mesero' })

  /* The form mirrors the saved closing (or starts empty: no default method). */
  useEffect(() => {
    if (!closing) return setForm(EMPTY_FORM)
    const p = closing.parametros ?? {}
    setForm({
      fondo: String(closing.fondo),
      metodo: closing.metodo,
      puntos_por_comensal: p.puntos_por_comensal ?? 1,
      puntos: { capitan: 0, runner: 0, hostess: 0, ...(p.puntos ?? {}) },
      porcentaje_equitativo: p.porcentaje_equitativo ?? 30,
    })
  }, [closing])

  const nameOf = useMemo(() => new Map(directory.map((e) => [e.empleado_id, e.nombre])), [directory])
  const participants = useMemo(() => [...(closing?.participantes ?? [])].sort((a, b) =>
    Number(b.monto_final) - Number(a.monto_final) || (nameOf.get(a.empleado_id) ?? '').localeCompare(nameOf.get(b.empleado_id) ?? '')),
  [closing, nameOf])

  const act = async (fn, success) => {
    setBusy(true)
    setNotice(null)
    try {
      await fn()
      if (success) setNotice({ type: 'success', text: success })
      await data.reload()
      return true
    } catch (err) {
      setNotice({ type: 'danger', text: err.message })
      return false
    } finally {
      setBusy(false)
    }
  }

  const parametros = () => (form.metodo === 'proporcional' ? {} : {
    puntos_por_comensal: Number(form.puntos_por_comensal) || 0,
    puntos: Object.fromEntries(Object.entries(form.puntos).map(([k, v]) => [k, Number(v) || 0])),
    ...(form.metodo === 'mixto' ? { porcentaje_equitativo: Number(form.porcentaje_equitativo) || 0 } : {}),
  })

  const formValid = Number(form.fondo) > 0 && form.metodo
  const save = () => act(() => prepareClosing(roster.id, { fondo: form.fondo, metodo: form.metodo, parametros: parametros() }),
    'Cierre guardado. Revisa los participantes y calcula la propuesta.')
  const calculate = () => act(async () => {
    const saved = await prepareClosing(roster.id, { fondo: form.fondo, metodo: form.metodo, parametros: parametros() })
    await calculateClosing(saved.id)
  }, 'Propuesta calculada. Gerencia la revisa y autoriza.')

  const editable = !closing || closing.estado === 'borrador'
  const total = participants.reduce((s, p) => s + Number(p.monto_final), 0)
  const diff = closing ? Math.round((Number(closing.fondo) - total) * 100) / 100 : 0
  const estado = closing && ESTADOS_CIERRE[closing.estado]
  const rosterReady = roster && ['publicado', 'modificado', 'cerrado'].includes(roster.estado)
  const available = directory.filter((e) => !participants.some((p) => p.empleado_id === e.empleado_id))
  const error = shifts.error || data.error
  const showPoints = closing && closing.metodo !== 'proporcional'

  const field = (label, value, onChange, props = {}) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type="number" min="0" value={value} disabled={!editable || busy}
        onChange={(e) => onChange(e.target.value)} {...props} />
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cierre del turno</h1>
          <p className="page-subtitle" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {dayHeader(fecha)}
            {estado && <Badge variant={estado.variant}>{estado.label}</Badge>}
            {closing?.autorizado_at && <span className="text-sm text-muted">· autorizado {datetime(closing.autorizado_at)}</span>}
          </p>
        </div>
        <div className="page-actions">
          <input className="form-input" type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} aria-label="Fecha" />
          <select className="form-select" value={turnoId} onChange={(e) => setTurnoId(e.target.value)} aria-label="Turno">
            {turnos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
      </div>

      {error && <div style={{ marginBottom: 'var(--space-4)' }}><Alert type="danger" title="No se pudo cargar el cierre">{error}</Alert></div>}
      {notice && <div style={{ marginBottom: 'var(--space-4)' }}><Alert type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert></div>}

      {error ? null : data.loading && !roster ? (
        <div className="loading-screen"><div className="spinner spinner-lg" /></div>
      ) : !rosterReady ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8, 2rem)' }}>
          <p style={{ marginBottom: 'var(--space-4)' }}>
            {roster
              ? `El rol de este turno está ${ESTADOS_ROL[roster.estado]?.label.toLowerCase()}: el cierre se prepara sobre un rol publicado.`
              : 'No hay rol para este día y turno.'}
          </p>
          <Link to={ROUTES.ROSTER} className="btn btn-secondary">Ir al rol diario</Link>
        </div>
      ) : (
        <>
          {seated > 0 && closing?.estado !== 'autorizado' && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <Alert type="warning">
                Hay {seated} {seated === 1 ? 'mesa ocupada' : 'mesas ocupadas'}: libéralas en la Hostess antes de calcular (una mesa abierta no tiene quién la cerró).
              </Alert>
            </div>
          )}

          <div className="grid-2" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="card">
              <h3 className="section-title">Fondo y método</h3>
              <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
                La fórmula no está definida por el cliente: elige el método y sus valores en cada cierre. El resultado es una propuesta que gerencia autoriza.
              </p>
              {field('Fondo a distribuir ($)', form.fondo, (fondo) => setForm((f) => ({ ...f, fondo })), { step: '0.01', placeholder: 'Ej: 10000' })}

              <div className="form-group">
                <label className="form-label">Método</label>
                {Object.entries(METODOS).map(([value, m]) => (
                  <label key={value} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                    <input type="radio" name="metodo" value={value} checked={form.metodo === value}
                      disabled={!editable || busy} onChange={() => setForm((f) => ({ ...f, metodo: value }))} />
                    <span>
                      <strong className="text-sm">{m.label}</strong>
                      <span className="text-sm text-muted" style={{ display: 'block' }}>{m.help}</span>
                    </span>
                  </label>
                ))}
              </div>

              {(form.metodo === 'puntos' || form.metodo === 'mixto') && (
                <div className="grid-2">
                  {field('Puntos por comensal (mesero)', form.puntos_por_comensal, (v) => setForm((f) => ({ ...f, puntos_por_comensal: v })), { step: '0.1' })}
                  {['capitan', 'runner', 'hostess'].map((k) => (
                    <div key={k}>
                      {field(`Puntos fijos: ${FUNCIONES[k].toLowerCase()}`, form.puntos[k], (v) => setForm((f) => ({ ...f, puntos: { ...f.puntos, [k]: v } })))}
                    </div>
                  ))}
                </div>
              )}
              {form.metodo === 'mixto' && field('% en partes iguales', form.porcentaje_equitativo,
                (v) => setForm((f) => ({ ...f, porcentaje_equitativo: v })), { min: 1, max: 99 })}

              <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
                Redondeo a pesos: los pesos que sobran se dan uno por uno a quien tiene más carga, así la suma es exactamente el fondo.
              </p>
              {editable ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="secondary" disabled={!formValid} loading={busy} onClick={save}>Guardar</Button>
                  <Button variant="primary" disabled={!formValid || seated > 0} loading={busy} onClick={calculate}>Calcular propuesta</Button>
                </div>
              ) : closing.estado === 'propuesto' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button variant="secondary" disabled={busy} onClick={() => act(() => returnClosingToDraft(closing.id), 'Cierre regresado a borrador.')}>
                    Regresar a borrador
                  </Button>
                  {canAuthorize
                    ? <Button variant="primary" disabled={busy || diff !== 0} onClick={() => setConfirmAuth(true)}>Autorizar cierre</Button>
                    : <span className="text-sm text-muted" style={{ alignSelf: 'center' }}>Gerencia autoriza la propuesta.</span>}
                </div>
              )}
            </div>

            <div className="card">
              <h3 className="section-title">Orden de salida</h3>
              <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>Meseros de cierre por área, de menos a más comensales.</p>
              {exitOrder.length === 0
                ? <p className="text-sm text-muted">No hay meseros de cierre en el rol.</p>
                : (
                  <table className="data-table">
                    <thead><tr><th>Área</th><th>#</th><th>Mesero</th><th style={{ textAlign: 'right' }}>Comensales</th></tr></thead>
                    <tbody>
                      {exitOrder.map((o) => (
                        <tr key={`${o.area}-${o.orden}`}>
                          <td>{o.area}</td><td>{o.orden}</td><td>{o.mesero}</td>
                          <td style={{ textAlign: 'right' }}>{number(o.comensales, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          </div>

          {closing && (
            <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <h3 className="section-title">Participantes ({participants.length})</h3>
                {closing.estado !== 'borrador' && (
                  <ExportButton getExport={() => ({
                    tipo: 'cierre', filtros: { fecha, turno: turnos.find((t) => t.id === turnoId)?.nombre, estado: closing.estado, metodo: closing.metodo },
                    rows: participants, filename: `cierre_${fecha}_${closing.estado}`,
                    columns: [
                      { header: 'Nombre', value: (p) => nameOf.get(p.empleado_id) }, { header: 'Función', value: (p) => FUNCIONES[p.funcion] },
                      { header: 'Comensales', value: (p) => p.comensales }, { header: 'Puntos', value: (p) => p.puntos },
                      { header: 'Propuesta', value: (p) => p.monto_calculado }, { header: 'Ajuste', value: (p) => p.ajuste },
                      { header: 'Motivo del ajuste', value: (p) => p.motivo_ajuste }, { header: 'Final', value: (p) => p.monto_final },
                    ],
                  })} />
                )}
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nombre</th><th>Función</th>
                    <th style={{ textAlign: 'right' }}>Comensales</th>
                    {showPoints && <th style={{ textAlign: 'right' }}>Puntos</th>}
                    <th style={{ textAlign: 'right' }}>Propuesta</th>
                    <th style={{ textAlign: 'right' }}>Ajuste</th>
                    <th style={{ textAlign: 'right' }}>Final</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {participants.map((p) => (
                    <tr key={p.id}>
                      <td>{nameOf.get(p.empleado_id) ?? '—'}</td>
                      <td>{FUNCIONES[p.funcion]}</td>
                      <td style={{ textAlign: 'right' }}>{closing.estado === 'borrador' ? '—' : number(p.comensales, 1)}</td>
                      {showPoints && <td style={{ textAlign: 'right' }}>{closing.estado === 'borrador' ? '—' : number(p.puntos, 1)}</td>}
                      <td style={{ textAlign: 'right' }}>{closing.estado === 'borrador' ? '—' : currency(p.monto_calculado)}</td>
                      <td style={{ textAlign: 'right' }} title={p.motivo_ajuste ?? ''}>
                        {Number(p.ajuste) ? `${Number(p.ajuste) > 0 ? '+' : ''}${currency(p.ajuste)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{closing.estado === 'borrador' ? '—' : currency(p.monto_final)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {closing.estado === 'borrador' && (
                          <Button variant="ghost" size="sm" disabled={busy}
                            onClick={() => act(() => removeParticipant(p.id), `${nameOf.get(p.empleado_id)} quedó fuera del reparto.`)}>Quitar</Button>
                        )}
                        {closing.estado === 'propuesto' && (
                          <Button variant="ghost" size="sm" disabled={busy}
                            onClick={() => setAdjusting({ participante: p, ajuste: String(Number(p.ajuste) || ''), motivo: p.motivo_ajuste ?? '' })}>Ajustar</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {closing.estado !== 'borrador' && (
                  <tfoot>
                    <tr>
                      <td colSpan={showPoints ? 6 : 5} style={{ textAlign: 'right' }}><strong>Total / fondo</strong></td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{currency(total)} / {currency(closing.fondo)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
              {closing.estado === 'propuesto' && diff !== 0 && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <Alert type="warning">
                    Los ajustes {diff > 0 ? `dejan ${currency(diff)} sin repartir` : `reparten ${currency(-diff)} de más`}. Para autorizar, lo que se suma a alguien debe quitarse a otro.
                  </Alert>
                </div>
              )}
              {closing.estado === 'borrador' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <select className="form-select" value={newPerson.empleado_id} disabled={busy} aria-label="Agregar participante"
                    onChange={(e) => setNewPerson((n) => ({ ...n, empleado_id: e.target.value }))}>
                    <option value="">+ Agregar participante</option>
                    {available.map((e) => <option key={e.empleado_id} value={e.empleado_id}>{e.nombre}</option>)}
                  </select>
                  <select className="form-select" value={newPerson.funcion} disabled={busy} aria-label="Función"
                    onChange={(e) => setNewPerson((n) => ({ ...n, funcion: e.target.value }))}>
                    {Object.entries(FUNCIONES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <Button variant="secondary" size="sm" disabled={!newPerson.empleado_id || busy}
                    onClick={async () => {
                      const ok = await act(() => addParticipant(closing.id, newPerson.empleado_id, newPerson.funcion), 'Participante agregado.')
                      if (ok) setNewPerson({ empleado_id: '', funcion: 'mesero' })
                    }}>Agregar</Button>
                </div>
              )}
            </div>
          )}

          {events.length > 0 && (
            <div className="card">
              <h3 className="section-title">Historial del cierre</h3>
              <table className="data-table">
                <thead><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Motivo</th></tr></thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{datetime(ev.created_at)}</td>
                      <td>{ev.usuario_nombre ?? '—'}</td>
                      <td>
                        {ACCIONES[ev.accion] ?? ev.accion}
                        {ev.accion === 'ajustar' && ev.detalle && ` · ${nameOf.get(ev.detalle.empleado_id) ?? ''}: ${currency(ev.detalle.despues)}`}
                        {ev.accion === 'calcular' && ev.detalle && ` · ${METODOS[ev.detalle.metodo]?.label ?? ''}, ${currency(ev.detalle.fondo)}`}
                      </td>
                      <td>{ev.motivo ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <Modal
        open={!!adjusting}
        onClose={() => setAdjusting(null)}
        title={adjusting ? `Ajustar a ${nameOf.get(adjusting.participante.empleado_id) ?? ''}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjusting(null)}>Cancelar</Button>
            <Button variant="primary" disabled={!adjusting?.motivo.trim() || adjusting?.ajuste === ''}
              onClick={() => {
                const { participante, ajuste, motivo } = adjusting
                setAdjusting(null)
                act(() => adjustParticipant(participante.id, ajuste, motivo.trim()), 'Ajuste registrado.')
              }}>Guardar ajuste</Button>
          </>
        }
      >
        {adjusting && (
          <>
            <p className="text-sm" style={{ marginBottom: 'var(--space-3)' }}>
              Propuesta: <strong>{currency(adjusting.participante.monto_calculado)}</strong>
            </p>
            <div className="form-group">
              <label className="form-label" htmlFor="adj-amount">Ajuste ($, negativo para restar)</label>
              <input id="adj-amount" className="form-input" type="number" step="0.01" value={adjusting.ajuste}
                onChange={(e) => setAdjusting((a) => ({ ...a, ajuste: e.target.value }))} placeholder="Ej: 50 o -50" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="adj-reason">Motivo <span className="required">*</span></label>
              <input id="adj-reason" className="form-input" value={adjusting.motivo}
                onChange={(e) => setAdjusting((a) => ({ ...a, motivo: e.target.value }))} placeholder="Ej: cubrió otra estación" />
            </div>
            <p className="text-sm text-muted">Con 0 se quita el ajuste. Queda registrado en el historial del cierre.</p>
          </>
        )}
      </Modal>

      <Modal
        open={confirmAuth}
        onClose={() => setConfirmAuth(false)}
        title="Autorizar cierre"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmAuth(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => { setConfirmAuth(false); act(() => authorizeClosing(closing.id), 'Cierre autorizado.') }}>Autorizar</Button>
          </>
        }
      >
        {closing && (
          <p>
            Se autoriza la distribución de <strong>{currency(closing.fondo)}</strong> entre {participants.length} personas
            ({METODOS[closing.metodo]?.label}). Después ya no se puede modificar.
          </p>
        )}
      </Modal>
    </div>
  )
}
