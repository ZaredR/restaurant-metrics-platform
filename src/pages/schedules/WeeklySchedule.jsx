import { useCallback, useMemo, useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import { useAuthStore } from '../../store/auth.store'
import { PERMISSIONS } from '../../constants/permissions'
import { useLoader } from '../../hooks/useLoader'
import {
  listShiftTypes, getConfigBool, getWeekAvailability,
  listSchedules, setSchedule, insertSchedules, DESCANSO,
} from '../../services/schedules.service'
import { PUESTOS, puestoLabel } from '../../services/staff.service'
import { tipoAusenciaLabel } from '../../services/absences.service'
import { today, startOfWeek, weekDays, addDays, dayHeader } from '../../utils/dates'

const OPERATIVE = ['capitan', 'mesero', 'runner', 'hostess']

/* Employee column stays visible while the week scrolls sideways. */
const STICKY = { position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg-table-row)' }

/* Cell value used by the <select>: '' | DESCANSO | turno id */
const cellValue = (row) => (row.es_descanso ? DESCANSO : row.turno_id ?? '')

export default function WeeklySchedule() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission(PERMISSIONS.MANAGE_SCHEDULES)

  const [monday, setMonday] = useState(() => startOfWeek(today()))
  const [puesto, setPuesto] = useState('operativo')
  const [notice, setNotice] = useState(null) // { type, text }
  const [savingCell, setSavingCell] = useState('')
  const [copying, setCopying] = useState(false)

  const days = useMemo(() => weekDays(monday), [monday])

  const loader = useCallback(async () => {
    const [turnos, bloquea, week] = await Promise.all([
      listShiftTypes(),
      getConfigBool('ausencias_bloquean', true),
      getWeekAvailability(days),
    ])
    return { turnos, bloquea, week }
  }, [days])
  const { data, loading, error, reload } = useLoader(loader)
  const { turnos = [], bloquea = true, week = [] } = data

  /* employees[] with cells[fecha] = { value, ausencia } */
  const employees = useMemo(() => {
    const byId = new Map()
    week.forEach(({ fecha, rows }) => rows.forEach((r) => {
      if (!byId.has(r.empleado_id)) {
        byId.set(r.empleado_id, { id: r.empleado_id, nombre: r.nombre, puesto: r.puesto, cells: {} })
      }
      byId.get(r.empleado_id).cells[fecha] = { value: cellValue(r), ausencia: r.ausencia }
    }))
    return [...byId.values()]
      .filter((e) => (puesto === 'operativo' ? OPERATIVE.includes(e.puesto) : !puesto || e.puesto === puesto))
      .sort((a, b) => a.puesto.localeCompare(b.puesto) || a.nombre.localeCompare(b.nombre))
  }, [week, puesto])

  const turnoNombre = (id) => turnos.find((t) => t.id === id)?.nombre ?? '—'

  const handleChange = async (empleado, fecha, value) => {
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
        return [{ empleado_id: h.empleado_id, fecha, turno_id: h.turno_id, es_descanso: h.es_descanso }]
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
          <span className={cell.value ? '' : 'text-muted'}>
            {cell.value === DESCANSO ? 'Descanso' : cell.value ? turnoNombre(cell.value) : '—'}
          </span>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {absenceBadge}
        <select
          className="form-select"
          style={{ minWidth: 118, padding: '4px 8px', fontSize: 13 }}
          value={cell.value}
          disabled={savingCell === `${emp.id}|${fecha}` || (blocked && !cell.value)}
          onChange={(e) => handleChange(emp, fecha, e.target.value)}
          aria-label={`${emp.nombre}, ${dayHeader(fecha)}`}
        >
          <option value="">—</option>
          {turnos.map((t) => <option key={t.id} value={t.id} disabled={blocked}>{t.nombre}</option>)}
          <option value={DESCANSO}>Descanso</option>
        </select>
      </div>
    )
  }

  const todayISO = today()

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Horarios</h1>
          <p className="page-subtitle">Semana del {dayHeader(days[0])} al {dayHeader(days[6])}</p>
        </div>
        <div className="page-actions">
          <Button variant="secondary" onClick={() => setMonday(addDays(monday, -7))}>‹ Anterior</Button>
          <Button variant="secondary" onClick={() => setMonday(startOfWeek(today()))}>Esta semana</Button>
          <Button variant="secondary" onClick={() => setMonday(addDays(monday, 7))}>Siguiente ›</Button>
          {canManage && (
            <Button variant="primary" onClick={copyPreviousWeek} loading={copying} disabled={loading}>
              Copiar semana anterior
            </Button>
          )}
        </div>
      </div>

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
    </div>
  )
}
