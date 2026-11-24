import { run } from './db'

/* ─── Horarios semanales ───────────────────────────────────── */

export const DESCANSO = 'descanso'
/* Cell value for a custom schedule with its own hours (10:00–18:00). */
export const PERSONALIZADO = 'personalizado'

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
    sb.from('horarios').select('empleado_id, fecha, turno_id, es_descanso, hora_inicio, hora_fin').gte('fecha', desde).lte('fecha', hasta)
  )
}

/* value: '' = sin asignar (borra), DESCANSO, el id de un turno, or
   { inicio: 'HH:MM', fin: 'HH:MM' } for custom hours (the database picks the shift). */
export function setSchedule(empleadoId, fecha, value) {
  if (!value) {
    return run((sb) => sb.from('horarios').delete().eq('empleado_id', empleadoId).eq('fecha', fecha))
  }
  const base = { empleado_id: empleadoId, fecha, hora_inicio: null, hora_fin: null }
  const row = value === DESCANSO
    ? { ...base, turno_id: null, es_descanso: true }
    : typeof value === 'object'
      ? { ...base, turno_id: null, es_descanso: false, hora_inicio: value.inicio, hora_fin: value.fin }
      : { ...base, turno_id: value, es_descanso: false }
  return run((sb) => sb.from('horarios').upsert(row, { onConflict: 'empleado_id,fecha' }))
}

export function insertSchedules(rows) {
  return run((sb) => sb.from('horarios').insert(rows))
}

/* Week status: 'borrador' until published (staff only see published weeks). */
export async function getWeekStatus(lunes) {
  const rows = await run((sb) => sb.from('horarios_semanas').select('semana, estado, publicado_at').eq('semana', lunes))
  return rows[0] ?? { semana: lunes, estado: 'borrador', publicado_at: null }
}

export function publishWeek(lunes, publicar = true) {
  return run((sb) => sb.rpc('publicar_semana', { p_lunes: lunes, p_publicar: publicar }))
}

/* 'HH:MM:SS' → 'HH:MM' */
export const hhmm = (t) => (t ? t.slice(0, 5) : '')
