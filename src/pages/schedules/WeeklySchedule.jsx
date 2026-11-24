import { useCallback, useMemo, useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../store/auth.store'
import { PERMISSIONS } from '../../constants/permissions'
import { useLoader } from '../../hooks/useLoader'
import {
  listShiftTypes, getConfigBool, getWeekAvailability,
  listSchedules, setSchedule, insertSchedules, DESCANSO, PERSONALIZADO,
  getWeekStatus, publishWeek, hhmm,
} from '../../services/schedules.service'
import { PUESTOS, puestoLabel } from '../../services/staff.service'
import { tipoAusenciaLabel } from '../../services/absences.service'
import { today, startOfWeek, weekDays, addDays, dayHeader } from '../../utils/dates'

const OPERATIVE = ['capitan', 'mesero', 'runner', 'hostess']

/* Employee column stays visible while the week scrolls sideways. */
const STICKY = { position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg-table-row)' }

/* Cell value used by the <select>: '' | DESCANSO | PERSONALIZADO | turno id */
const cellValue = (row, hours) => (row.es_descanso ? DESCANSO : hours ? PERSONALIZADO : row.turno_id ?? '')

/* Minutes two time ranges overlap (an end before the start crosses midnight),
   the same rule the database uses to pick the shift of custom hours. */
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const overlap = (a1, a2, b1, b2) => {
  const [x1, y1] = [toMin(a1), toMin(a2) + (toMin(a2) <= toMin(a1) ? 1440 : 0)]
  const [x2, y2] = [toMin(b1), toMin(b2) + (toMin(b2) <= toMin(b1) ? 1440 : 0)]
  return Math.max(0, Math.min(y1, y2) - Math.max(x1, x2))
}

export default function WeeklySchedule() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission(PERMISSIONS.MANAGE_SCHEDULES)

  const [monday, setMonday] = useState(() => startOfWeek(today()))
  const [puesto, setPuesto] = useState('operativo')
  const [notice, setNotice] = useState(null) // { type, text }
  const [savingCell, setSavingCell] = useState('')
  const [copying, setCopying] = useState(false)
  const [custom, setCustom] = useState(null) // { emp, fecha, inicio, fin } while editing custom hours
  const [publishing, setPublishing] = useState(false)

  const days = useMemo(() => weekDays(monday), [monday])

  const loader = useCallback(async () => {
    const [turnos, bloquea, week, schedules, status] = await Promise.all([
      listShiftTypes(),
      getConfigBool('ausencias_bloquean', true),
      getWeekAvailability(days),
      listSchedules(days[0], days[6]),
      getWeekStatus(days[0]),
    ])
    return { turnos, bloquea, week, schedules, status }
  }, [days])
  const { data, loading, error, reload } = useLoader(loader)
  const { turnos = [], bloquea = true, week = [], schedules = [], status = null } = data
  const published = status?.estado === 'publicada'

  /* Custom hours by employee and day (empleados_disponibles only returns the shift). */
  const hoursOf = useMemo(() => new Map(schedules
    .filter((h) => h.hora_inicio)
    .map((h) => [`${h.empleado_id}|${h.fecha}`, { inicio: hhmm(h.hora_inicio), fin: hhmm(h.hora_fin) }])), [schedules])

  /* employees[] with cells[fecha] = { value, ausencia } */
  const employees = useMemo(() => {
    const byId = new Map()
    week.forEach(({ fecha, rows }) => rows.forEach((r) => {
      if (!byId.has(r.empleado_id)) {
        byId.set(r.empleado_id, { id: r.empleado_id, nombre: r.nombre, puesto: r.puesto, cells: {} })
      }
      const hours = hoursOf.get(`${r.empleado_id}|${fecha}`)
      byId.get(r.empleado_id).cells[fecha] = { value: cellValue(r, hours), hours, turnoId: r.turno_id, ausencia: r.ausencia }
    }))
    return [...byId.values()]
      .filter((e) => (puesto === 'operativo' ? OPERATIVE.includes(e.puesto) : !puesto || e.puesto === puesto))
      .sort((a, b) => a.puesto.localeCompare(b.puesto) || a.nombre.localeCompare(b.nombre))
  }, [week, puesto, hoursOf])

  const turnoNombre = (id) => turnos.find((t) => t.id === id)?.nombre ?? '—'
  const turnoHoras = (id) => { const t = turnos.find((x) => x.id === id); return t ? `${hhmm(t.hora_inicio)}–${hhmm(t.hora_fin)}` : '' }
  /* Words for a cell: "Vespertino", "16:00–00:00" or "Descanso". */
  const cellText = (cell) => (cell.value === DESCANSO ? 'Descanso'
    : cell.hours ? `${cell.hours.inicio}–${cell.hours.fin}`
      : cell.value ? turnoNombre(cell.value) : '—')

  /* Shift the custom hours fall into (shown in the dialog before saving). */
  const shiftFor = (inicio, fin) => {
    if (!inicio || !fin || inicio === fin) return null
    return [...turnos]
      .map((t) => ({ t, m: overlap(inicio, fin, hhmm(t.hora_inicio), hhmm(t.hora_fin)) }))
      .filter((x) => x.m > 0)
      .sort((a, b) => b.m - a.m)[0]?.t ?? null
  }

  const handleChange = async (empleado, fecha, value) => {
    if (value === PERSONALIZADO) {
      const cell = empleado.cells[fecha]
      const t = turnos.find((x) => x.id === cell?.turnoId)
      setCustom({ emp: empleado, fecha,
        inicio: cell?.hours?.inicio ?? (t ? hhmm(t.hora_inicio) : '10:00'),
        fin: cell?.hours?.fin ?? (t ? hhmm(t.hora_fin) : '18:00') })
      return
    }
    const key = `${empleado.id}|${fecha}`
    setSavingCell(key)
    setNotice(null)
    try {
      await setSchedule(empleado.id, fecha, value)
      await reload()
    } catch (err) {
      setNotice({ type: 'danger', text: `${empleado.nombre}: ${err.message}` })
    } finally {
      setSavingCell('')
    }
  }

  /* Fills this week's empty cells with last week's schedule; never overwrites. */
  const copyPreviousWeek = async () => {
    setCopying(true)
    setNotice(null)
    try {
      const prev = await listSchedules(addDays(monday, -7), addDays(monday, -1))
      const current = new Map(employees.map((e) => [e.id, e]))
      let skippedAbsence = 0
      const rows = prev.flatMap((h) => {
        const emp = current.get(h.empleado_id)
        const fecha = addDays(h.fecha, 7)
        const cell = emp?.cells[fecha]
        if (!cell || cell.value) return []
        if (cell.ausencia && !h.es_descanso && bloquea) { skippedAbsence++; return [] }
        return [{ empleado_id: h.empleado_id, fecha, turno_id: h.turno_id, es_descanso: h.es_descanso,
          hora_inicio: h.hora_inicio, hora_fin: h.hora_fin }]
      })
      if (rows.length) await insertSchedules(rows)
      setNotice({
        type: rows.length ? 'success' : 'info',
        text: rows.length
          ? `Se copiaron ${rows.length} registros de la semana anterior${skippedAbsence ? `; se omitieron ${skippedAbsence} por ausencias` : ''}.`
          : 'No había celdas vacías que llenar con la semana anterior (con el filtro actual).',
      })
      reload()
    } catch (err) {
      setNotice({ type: 'danger', text: err.message })
    } finally {
      setCopying(false)
    }
  }

  const scheduledCount = (fecha) =>
    employees.filter((e) => { const v = e.cells[fecha]?.value; return v && v !== DESCANSO }).length

  const togglePublished = async () => {
    setPublishing(true)
    setNotice(null)
    try {
      await publishWeek(days[0], !published)
      setNotice({ type: 'success', text: published
        ? 'La semana regresó a borrador: el personal deja de verla.'
        : 'Semana publicada: cada colaborador ya puede ver su horario.' })
      await reload()
    } catch (err) {
      setNotice({ type: 'danger', text: err.message })
    } finally {
      setPublishing(false)
    }
  }

  const saveCustom = async (e) => {
    e.preventDefault()
    const { emp, fecha, inicio, fin } = custom
    setCustom(null)
    await handleChange(emp, fecha, { inicio, fin })
  }

  const renderCell = (emp, fecha) => {
    const cell = emp.cells[fecha] ?? { value: '', ausencia: null }
    const blocked = cell.ausencia && bloquea
    const absenceBadge = cell.ausencia && (
      <Badge variant={blocked ? 'danger' : 'warning'}>{tipoAusenciaLabel(cell.ausencia)}</Badge>
    )

    if (!canManage) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {absenceBadge}
          <span className={cell.value ? '' : 'text-muted'}>{cellText(cell)}</span>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {absenceBadge}
        <select
          className="form-select no-print"
          style={{ minWidth: 118, padding: '4px 8px', fontSize: 13 }}
          value={cell.value}
          disabled={savingCell === `${emp.id}|${fecha}` || (blocked && !cell.value)}
          onChange={(e) => handleChange(emp, fecha, e.target.value)}
          aria-label={`${emp.nombre}, ${dayHeader(fecha)}`}
        >
          <option value="">—</option>
          {turnos.map((t) => <option key={t.id} value={t.id} disabled={blocked}>{t.nombre} ({turnoHoras(t.id)})</option>)}
          <option value={PERSONALIZADO} disabled={blocked}>{cell.hours ? `${cell.hours.inicio}–${cell.hours.fin}` : 'Personalizado…'}</option>
          <option value={DESCANSO}>Descanso</option>
        </select>
        {cell.hours && (
          <button type="button" className="schedule-hours no-print" onClick={() => handleChange(emp, fecha, PERSONALIZADO)}
            title="Cambiar horas">{turnoNombre(cell.turnoId)} · editar horas</button>
        )}
        <span className="print-only">{cellText(cell)}</span>
      </div>
    )
  }

  const todayISO = today()

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Horarios</h1>
          <p className="page-subtitle" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            Semana del {dayHeader(days[0])} al {dayHeader(days[6])}
            {status && (published
              ? <Badge variant="success">Publicada</Badge>
              : <Badge variant="warning">Borrador</Badge>)}
          </p>
        </div>
        <div className="page-actions no-print">
          <Button variant="secondary" onClick={() => setMonday(addDays(monday, -7))}>‹ Anterior</Button>
          <Button variant="secondary" onClick={() => setMonday(startOfWeek(today()))}>Esta semana</Button>
          <Button variant="secondary" onClick={() => setMonday(addDays(monday, 7))}>Siguiente ›</Button>
          <Button variant="secondary" onClick={() => window.print()} disabled={loading}>Imprimir semana</Button>
          {canManage && (
            <Button variant="secondary" onClick={copyPreviousWeek} loading={copying} disabled={loading}>
              Copiar semana anterior
            </Button>
          )}
          {canManage && status && (
            <Button variant={published ? 'secondary' : 'primary'} onClick={togglePublished} loading={publishing} disabled={loading}>
              {published ? 'Regresar a borrador' : 'Publicar semana'}
            </Button>
          )}
        </div>
      </div>

      {canManage && status && !published && (
        <div className="no-print" style={{ marginBottom: 'var(--space-4)' }}>
          <Alert type="info">Semana en borrador: el personal todavía no ve estos horarios. Publícala cuando esté lista.</Alert>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert type="danger" title="No se pudieron cargar los horarios">{error}</Alert>
        </div>
      )}
      {notice && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert>
        </div>
      )}
      {!bloquea && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert type="warning">Las ausencias solo se advierten: la configuración permite programar a empleados ausentes.</Alert>
        </div>
      )}

      <div className="table-wrapper">
        <div className="table-toolbar">
          <div className="table-toolbar-left">
            <select className="form-select" value={puesto} onChange={(e) => setPuesto(e.target.value)} aria-label="Filtrar por puesto">
              <option value="operativo">Personal operativo</option>
              <option value="">Todos los puestos</option>
              {PUESTOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <span className="text-sm text-muted">{employees.length} empleados</span>
          </div>
        </div>

        {loading && !week.length ? (
          <div className="loading-screen"><div className="spinner spinner-lg" /></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ ...STICKY, background: 'var(--bg-table-head)' }}>Empleado</th>
                  {days.map((d) => (
                    <th key={d} style={d === todayISO ? { color: 'var(--color-brand)' } : undefined}>{dayHeader(d)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
                      No hay empleados activos con este filtro
                    </td>
                  </tr>
                ) : employees.map((emp) => (
                  <tr key={emp.id}>
                    <td style={{ ...STICKY, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600 }}>{emp.nombre}</div>
                      <div className="text-sm text-muted">{puestoLabel(emp.puesto)}</div>
                    </td>
                    {days.map((d) => <td key={d}>{renderCell(emp, d)}</td>)}
                  </tr>
                ))}
              </tbody>
              {employees.length > 0 && (
                <tfoot>
                  <tr>
                    <td className="text-sm text-muted" style={STICKY}>Programados</td>
                    {days.map((d) => <td key={d} className="text-sm" style={{ fontWeight: 600 }}>{scheduledCount(d)}</td>)}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!custom}
        onClose={() => setCustom(null)}
        title="Horario personalizado"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCustom(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="custom-hours" disabled={!custom || !shiftFor(custom.inicio, custom.fin)}>Guardar</Button>
          </>
        }
      >
        {custom && (() => {
          const t = shiftFor(custom.inicio, custom.fin)
          return (
            <form id="custom-hours" onSubmit={saveCustom}>
              <p style={{ marginBottom: 'var(--space-3)' }}><strong>{custom.emp.nombre}</strong> · {dayHeader(custom.fecha)}</p>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="h-inicio">Entra</label>
                  <input id="h-inicio" type="time" className="form-input" value={custom.inicio} required
                    onChange={(e) => setCustom((c) => ({ ...c, inicio: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="h-fin">Sale</label>
                  <input id="h-fin" type="time" className="form-input" value={custom.fin} required
                    onChange={(e) => setCustom((c) => ({ ...c, fin: e.target.value }))} />
                </div>
              </div>
              <p className="text-sm text-muted">
                {t ? <>Cuenta como turno <strong>{t.nombre}</strong> para el rol diario.</>
                  : 'Esas horas no coinciden con ningún turno.'}
                {' '}Si sale después de medianoche, pon la hora de salida (por ejemplo 01:00).
              </p>
            </form>
          )
        })()}
      </Modal>
    </div>
  )
}
