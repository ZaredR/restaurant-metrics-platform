import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Alert from '../../components/ui/Alert'
import { useAuthStore } from '../../store/auth.store'
import { ROUTES } from '../../constants/routes'
import { useLoader } from '../../hooks/useLoader'
import {
  listAbsences, saveAbsence, setAbsenceStatus, countShiftsInRange,
  TIPOS_AUSENCIA, ESTADOS_AUSENCIA, tipoAusenciaLabel,
} from '../../services/absences.service'
import { listEmployees } from '../../services/staff.service'
import { date } from '../../utils/formatters'
import { today, parseISODate } from '../../utils/dates'

const EMPTY = { empleado_id: '', tipo: 'vacaciones', fecha_inicio: '', fecha_fin: '', motivo: '' }

const loadAbsences = async () => {
  const [absences, employees] = await Promise.all([listAbsences(), listEmployees()])
  return { absences, employees }
}

const fullName = (e) => [e?.nombre, e?.apellidos].filter(Boolean).join(' ')

const days = (a) => Math.round((parseISODate(a.fecha_fin) - parseISODate(a.fecha_inicio)) / 86400000) + 1

export default function AbsenceList() {
  const { user } = useAuthStore()
  const { data, loading, error, reload } = useLoader(loadAbsences)
  const { absences = [], employees = [] } = data

  const [estado, setEstado] = useState('')
  const [onlyCurrent, setOnlyCurrent] = useState(true)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState(null) // { type, text }

  const todayISO = today()
  const rows = useMemo(() => absences
    .filter((a) => !estado || a.estado === estado)
    .filter((a) => !onlyCurrent || a.fecha_fin >= todayISO)
    .map((a) => ({ ...a, empleado_nombre: fullName(a.empleado), dias: days(a) })),
  [absences, estado, onlyCurrent, todayISO])

  const pendingCount = absences.filter((a) => a.estado === 'pendiente').length

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const openForm = (absence) => {
    setFormError('')
    setForm(absence
      ? { id: absence.id, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, absence[k] ?? ''])) }
      : EMPTY)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (form.fecha_fin < form.fecha_inicio) {
      setFormError('La fecha final no puede ser anterior a la inicial.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await saveAbsence(form)
      setForm(null)
      reload()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (absence, nuevo) => {
    setNotice(null)
    try {
      await setAbsenceStatus(absence.id, nuevo, user?.id)
      if (nuevo === 'aprobada') {
        // Approving doesn't touch shifts already scheduled; tell who approves so they fix them.
        const shifts = await countShiftsInRange(absence.empleado_id, absence.fecha_inicio, absence.fecha_fin)
        if (shifts > 0) {
          setNotice({
            type: 'warning',
            text: `${absence.empleado_nombre} tiene ${shifts} turno${shifts > 1 ? 's' : ''} programado${shifts > 1 ? 's' : ''} entre el ${date(absence.fecha_inicio)} y el ${date(absence.fecha_fin)}. Revísalos en Horarios.`,
          })
        }
      }
      reload()
    } catch (err) {
      setNotice({ type: 'danger', text: err.message })
    }
  }

  const estadoCfg = (value) => ESTADOS_AUSENCIA.find((s) => s.value === value)

  const columns = [
    { header: 'Empleado', accessor: 'empleado_nombre', sortable: true },
    { header: 'Tipo',     accessor: 'tipo', sortable: true, render: (r) => tipoAusenciaLabel(r.tipo) },
    { header: 'Desde',    accessor: 'fecha_inicio', sortable: true, render: (r) => date(r.fecha_inicio) },
    { header: 'Hasta',    accessor: 'fecha_fin', sortable: true, render: (r) => date(r.fecha_fin) },
    { header: 'Días',     accessor: 'dias', sortable: true },
    { header: 'Estado',   accessor: 'estado', sortable: true,
      render: (r) => <Badge variant={estadoCfg(r.estado)?.variant}>{estadoCfg(r.estado)?.label}</Badge> },
    { header: 'Motivo',   accessor: 'motivo' },
    {
      header: 'Acciones', key: 'actions',
      render: (r) => (
        <div className="table-actions">
          {r.estado === 'pendiente' && <Button variant="ghost" size="sm" onClick={() => openForm(r)}>Editar</Button>}
          {r.estado !== 'aprobada' && <Button variant="ghost" size="sm" onClick={() => changeStatus(r, 'aprobada')}>Aprobar</Button>}
          {r.estado !== 'rechazada' && <Button variant="ghost" size="sm" onClick={() => changeStatus(r, 'rechazada')}>Rechazar</Button>}
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ausencias</h1>
          <p className="page-subtitle">
            Vacaciones, incapacidades y permisos · {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''} de aprobar
          </p>
        </div>
        <div className="page-actions">
          <Link to={ROUTES.SCHEDULES} className="btn btn-secondary">Ver horarios</Link>
          <Button variant="primary" onClick={() => openForm(null)}>Registrar ausencia</Button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert type="danger" title="No se pudieron cargar las ausencias">{error}</Alert>
        </div>
      )}
      {notice && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert>
        </div>
      )}

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Alert type="info">
          Una ausencia <strong>aprobada</strong> impide programar al empleado en Horarios y asignarlo al rol diario esos días.
        </Alert>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        searchPlaceholder="Buscar por empleado o motivo..."
        emptyMessage="No hay ausencias con estos filtros"
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <select className="form-select" value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Filtrar por estado">
              <option value="">Todos los estados</option>
              {ESTADOS_AUSENCIA.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <label className="text-sm" style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={onlyCurrent} onChange={(e) => setOnlyCurrent(e.target.checked)} />
              Solo vigentes y futuras
            </label>
          </div>
        }
      />

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Editar ausencia' : 'Registrar ausencia'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="absence-form" loading={saving}>Guardar</Button>
          </>
        }
      >
        {form && (
          <form id="absence-form" onSubmit={handleSave}>
            {formError && <div style={{ marginBottom: 'var(--space-4)' }}><Alert type="danger">{formError}</Alert></div>}

            <div className="form-group">
              <label className="form-label">Empleado <span className="required">*</span></label>
              <select className="form-select" value={form.empleado_id} onChange={set('empleado_id')} required disabled={!!form.id}>
                <option value="">Selecciona un empleado</option>
                {employees.filter((e) => e.activo).map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo <span className="required">*</span></label>
              <select className="form-select" value={form.tipo} onChange={set('tipo')} required>
                {TIPOS_AUSENCIA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Desde <span className="required">*</span></label>
                <input className="form-input" type="date" value={form.fecha_inicio} onChange={set('fecha_inicio')} required />
              </div>
              <div className="form-group">
                <label className="form-label">Hasta <span className="required">*</span></label>
                <input className="form-input" type="date" value={form.fecha_fin} min={form.fecha_inicio || undefined} onChange={set('fecha_fin')} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Motivo</label>
              <input className="form-input" value={form.motivo} onChange={set('motivo')} />
            </div>
            <p className="text-sm text-muted">La ausencia se registra como pendiente; apruébala desde la lista.</p>
          </form>
        )}
      </Modal>
    </div>
  )
}
