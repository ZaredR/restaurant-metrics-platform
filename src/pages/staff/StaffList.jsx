import { useMemo, useState } from 'react'
import DataTable from '../../components/ui/DataTable'
import Badge, { StatusBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Alert from '../../components/ui/Alert'
import { useAuthStore } from '../../store/auth.store'
import { PERMISSIONS } from '../../constants/permissions'
import { useLoader } from '../../hooks/useLoader'
import { listEmployees, saveEmployee, setEmployeeActive, PUESTOS, puestoLabel } from '../../services/staff.service'
import { date } from '../../utils/formatters'

const EMPTY = {
  numero_empleado: '', nombre: '', apellidos: '', puesto: 'mesero',
  telefono: '', email: '', fecha_ingreso: '', activo: true,
}

const puestoVariant = {
  gerente: 'brand', rrhh: 'success', capitan: 'info', mesero: 'neutral',
  runner: 'neutral', hostess: 'warning', otro: 'neutral',
}

export default function StaffList() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission(PERMISSIONS.MANAGE_STAFF)
  const { data: employees, loading, error, reload } = useLoader(listEmployees)

  const [puesto, setPuesto] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')

  const rows = useMemo(() => employees
    .filter((e) => showInactive || e.activo)
    .filter((e) => !puesto || e.puesto === puesto)
    .map((e) => ({ ...e, nombre_completo: [e.nombre, e.apellidos].filter(Boolean).join(' ') })),
  [employees, puesto, showInactive])

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const openForm = (employee) => {
    setFormError('')
    if (!employee) return setForm(EMPTY)
    // Only the editable fields; nulls become '' for the inputs.
    setForm({
      id: employee.id,
      ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, employee[k] ?? ''])),
    })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await saveEmployee(form)
      setForm(null)
      reload()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (employee) => {
    setActionError('')
    try {
      await setEmployeeActive(employee.id, !employee.activo)
      reload()
    } catch (err) {
      setActionError(err.message)
    }
  }

  const columns = [
    { header: 'No.',     accessor: 'numero_empleado', sortable: true },
    { header: 'Nombre',  accessor: 'nombre_completo', sortable: true },
    { header: 'Puesto',  accessor: 'puesto', sortable: true,
      render: (r) => <Badge variant={puestoVariant[r.puesto]}>{puestoLabel(r.puesto)}</Badge> },
    { header: 'Teléfono', accessor: 'telefono' },
    { header: 'Ingreso',  accessor: 'fecha_ingreso', sortable: true, render: (r) => date(r.fecha_ingreso) },
    { header: 'Estado',   accessor: 'activo', render: (r) => <StatusBadge active={r.activo} /> },
    ...(canManage ? [{
      header: 'Acciones', key: 'actions',
      render: (r) => (
        <div className="table-actions">
          <Button variant="ghost" size="sm" onClick={() => openForm(r)}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => toggleActive(r)}>
            {r.activo ? 'Desactivar' : 'Activar'}
          </Button>
        </div>
      ),
    }] : []),
  ]

  const activeCount = employees.filter((e) => e.activo).length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Personal</h1>
          <p className="page-subtitle">{activeCount} empleados activos</p>
        </div>
        {canManage && (
          <div className="page-actions">
            <Button variant="primary" onClick={() => openForm(null)}>Nuevo empleado</Button>
          </div>
        )}
      </div>

      {(error || actionError) && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert type="danger" title="No se pudo cargar o guardar el personal" onClose={actionError ? () => setActionError('') : undefined}>
            {error || actionError}
          </Alert>
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        searchPlaceholder="Buscar por nombre o número..."
        emptyMessage="No hay empleados con estos filtros"
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <select className="form-select" value={puesto} onChange={(e) => setPuesto(e.target.value)} aria-label="Filtrar por puesto">
              <option value="">Todos los puestos</option>
              {PUESTOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <label className="text-sm" style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Mostrar inactivos
            </label>
          </div>
        }
      />

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Editar empleado' : 'Nuevo empleado'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="employee-form" loading={saving}>
              {form?.id ? 'Guardar cambios' : 'Crear empleado'}
            </Button>
          </>
        }
      >
        {form && (
          <form id="employee-form" onSubmit={handleSave}>
            {formError && <div style={{ marginBottom: 'var(--space-4)' }}><Alert type="danger">{formError}</Alert></div>}

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Nombre <span className="required">*</span></label>
                <input className="form-input" value={form.nombre} onChange={set('nombre')} required />
              </div>
              <div className="form-group">
                <label className="form-label">Apellidos</label>
                <input className="form-input" value={form.apellidos} onChange={set('apellidos')} />
              </div>
              <div className="form-group">
                <label className="form-label">Puesto <span className="required">*</span></label>
                <select className="form-select" value={form.puesto} onChange={set('puesto')} required>
                  {PUESTOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Número de empleado</label>
                <input className="form-input" placeholder="Ej: E017" value={form.numero_empleado} onChange={set('numero_empleado')} />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input className="form-input" type="tel" value={form.telefono} onChange={set('telefono')} />
              </div>
              <div className="form-group">
                <label className="form-label">Correo</label>
                <input className="form-input" type="email" value={form.email} onChange={set('email')} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha de ingreso</label>
                <input className="form-input" type="date" value={form.fecha_ingreso} onChange={set('fecha_ingreso')} />
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
