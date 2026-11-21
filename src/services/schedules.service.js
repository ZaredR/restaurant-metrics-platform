import { run } from './db'

/* ─── Horarios semanales ───────────────────────────────────── */

export const DESCANSO = 'descanso'

export function listShiftTypes() {
  return run((sb) => sb.from('turnos').select('id, nombre, hora_inicio, hora_fin').eq('activo', true).order('hora_inicio'))
}

export async function getConfigBool(clave, fallback) {
  const rows = await run((sb) => sb.from('configuracion').select('valor').eq('clave', clave))
  return rows.length ? rows[0].valor === true : fallback
}

/* One call per day to empleados_disponibles(): it returns the schedule
   and any approved absence, even for roles that can't read ausencias. */
export async function getWeekAvailability(days) {
  const perDay = await Promise.all(days.map((fecha) =>
    run((sb) => sb.rpc('empleados_disponibles', { p_fecha: fecha }))
  ))
  return days.map((fecha, i) => ({ fecha, rows: perDay[i] }))
}

export function listSchedules(desde, hasta) {
  return run((sb) =>
    sb.from('horarios').select('empleado_id, fecha, turno_id, es_descanso').gte('fecha', desde).lte('fecha', hasta)
  )
}

/* value: '' = sin asignar (borra), DESCANSO o el id de un turno. */
export function setSchedule(empleadoId, fecha, value) {
  if (!value) {
    return run((sb) => sb.from('horarios').delete().eq('empleado_id', empleadoId).eq('fecha', fecha))
  }
  const row = value === DESCANSO
    ? { empleado_id: empleadoId, fecha, turno_id: null, es_descanso: true }
    : { empleado_id: empleadoId, fecha, turno_id: value, es_descanso: false }
  return run((sb) => sb.from('horarios').upsert(row, { onConflict: 'empleado_id,fecha' }))
}

export function insertSchedules(rows) {
  return run((sb) => sb.from('horarios').insert(rows))
}
