import { run } from './db'

/* ─── Ausencias: vacaciones, incapacidades y permisos ──────── */

export const TIPOS_AUSENCIA = [
  { value: 'vacaciones',  label: 'Vacaciones' },
  { value: 'incapacidad', label: 'Incapacidad' },
  { value: 'permiso',     label: 'Permiso' },
  { value: 'otro',        label: 'Otro' },
]

export const ESTADOS_AUSENCIA = [
  { value: 'pendiente', label: 'Pendiente', variant: 'warning' },
  { value: 'aprobada',  label: 'Aprobada',  variant: 'success' },
  { value: 'rechazada', label: 'Rechazada', variant: 'neutral' },
]

export const tipoAusenciaLabel = (value) =>
  TIPOS_AUSENCIA.find((t) => t.value === value)?.label ?? value

export function listAbsences() {
  return run((sb) =>
    sb.from('ausencias')
      .select('id, empleado_id, tipo, fecha_inicio, fecha_fin, estado, motivo, created_at, empleado:empleados(nombre, apellidos, puesto)')
      .order('fecha_inicio', { ascending: false })
  )
}

export function saveAbsence({ id, ...fields }) {
  const row = { ...fields, motivo: fields.motivo || null }
  return run((sb) => (id ? sb.from('ausencias').update(row).eq('id', id) : sb.from('ausencias').insert(row)))
}

export function setAbsenceStatus(id, estado, userId) {
  return run((sb) =>
    sb.from('ausencias')
      .update({ estado, aprobada_por: estado === 'aprobada' ? userId : null })
      .eq('id', id)
  )
}

/* Turnos ya programados (no descansos) que se enciman con una ausencia. */
export async function countShiftsInRange(empleadoId, desde, hasta) {
  const rows = await run((sb) =>
    sb.from('horarios')
      .select('id')
      .eq('empleado_id', empleadoId)
      .eq('es_descanso', false)
      .gte('fecha', desde)
      .lte('fecha', hasta)
  )
  return rows.length
}
