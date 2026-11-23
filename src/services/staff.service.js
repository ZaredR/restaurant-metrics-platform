import { run } from './db'

/* ─── Personal (tabla empleados) ───────────────────────────── */

export const PUESTOS = [
  { value: 'gerente', label: 'Gerente' },
  { value: 'rrhh',    label: 'Recursos Humanos' },
  { value: 'capitan', label: 'Capitán' },
  { value: 'mesero',  label: 'Mesero' },
  { value: 'runner',  label: 'Runner' },
  { value: 'hostess', label: 'Hostess' },
  { value: 'otro',    label: 'Otro' },
]

export const puestoLabel = (value) =>
  PUESTOS.find((p) => p.value === value)?.label ?? value

const FIELDS = 'id, numero_empleado, nombre, apellidos, puesto, telefono, email, fecha_ingreso, activo, estado'

export function listEmployees() {
  return run((sb) => sb.from('empleados').select(FIELDS).order('nombre'))
}

export function saveEmployee({ id, ...fields }) {
  const row = {
    ...fields,
    numero_empleado: fields.numero_empleado || null,
    apellidos:       fields.apellidos || null,
    telefono:        fields.telefono || null,
    email:           fields.email || null,
    fecha_ingreso:   fields.fecha_ingreso || null,
  }
  return run((sb) =>
    id
      ? sb.from('empleados').update(row).eq('id', id).select(FIELDS).single()
      : sb.from('empleados').insert(row).select(FIELDS).single()
  )
}

/* `activo` stays in sync with `estado` in the database (activo = estado 'activo'). */
export function setEmployeeActive(id, activo) {
  return run((sb) => sb.from('empleados').update({ activo }).eq('id', id))
}
