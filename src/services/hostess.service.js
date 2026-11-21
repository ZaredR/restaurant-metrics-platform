import { run } from './db'
import { getSupabase } from './supabase'

/* ─── Hostess: llegadas, mesas y comensales ────────────────── */

const VISIT_FIELDS =
  'id, nombre_referencia, adultos, ninos, comensales, estado, hora_llegada, hora_sentada, hora_salida, mesa_id, estacion_id, area_id, mesero_id, capitan_id'

/* Published rosters of a day (also after adjustments); the hostess only works with these. */
export function listPublishedRosters(fecha) {
  return run((sb) =>
    sb.from('roles_diarios')
      .select('id, fecha, estado, turno:turnos(nombre, hora_inicio, hora_fin)')
      .eq('fecha', fecha)
      .in('estado', ['publicado', 'modificado'])
  )
}

/* Every active table with its station and area (including stations without a waiter). */
export function listFloorTables() {
  return run((sb) =>
    sb.from('mesas')
      .select('id, numero, capacidad, estacion:estaciones(id, nombre, activo, area:areas(id, nombre, orden, activo))')
      .eq('activo', true)
      .order('numero')
  )
}

/* Table → waiter → captain for a roster. */
export function getTableAssignments(rolId) {
  return run((sb) => sb.from('v_mesas_asignadas').select('mesa_id, mesero_id, mesero, capitan').eq('rol_id', rolId))
}

export function listVisits(rolId) {
  return run((sb) =>
    sb.from('visitas').select(VISIT_FIELDS).eq('rol_id', rolId).order('hora_llegada')
  )
}

export function getCoversByWaiter(rolId) {
  return run((sb) =>
    sb.from('v_comensales_mesero')
      .select('empleado_id, mesero, area, comensales, mesas_atendidas, es_cierre')
      .eq('rol_id', rolId)
      .order('comensales')
  )
}

/* With mesa_id the trigger seats the visit and fills waiter, area and captain. */
export function registerVisit({ rol_id, nombre_referencia, adultos, ninos, mesa_id = null }) {
  return run((sb) => sb.from('visitas').insert({ rol_id, nombre_referencia, adultos, ninos, mesa_id }))
}

/* Seat a waiting visit, or move a seated one to another table. */
export function seatVisit(id, mesaId) {
  return run((sb) => sb.from('visitas').update({ mesa_id: mesaId }).eq('id', id))
}

export function closeVisit(id) {
  return run((sb) => sb.from('visitas').update({ estado: 'cerrada' }).eq('id', id))
}

/* Hand an occupied table to another waiter of the roster without moving it (logged with the reason). */
export function reassignVisit(id, meseroId, motivo) {
  return run((sb) => sb.rpc('reasignar_visita', { p_visita_id: id, p_mesero_id: meseroId, p_motivo: motivo }))
}

export function cancelVisit(id) {
  return run((sb) => sb.from('visitas').update({ estado: 'cancelada' }).eq('id', id))
}

/* Calls onChange whenever a visit of this roster (or the roster itself) changes,
   from this or any other device. Returns the unsubscribe function. */
export function subscribeToRoster(rolId, onChange) {
  const sb = getSupabase()
  const channel = sb.channel(`hostess-${rolId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visitas', filter: `rol_id=eq.${rolId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rol_asignaciones', filter: `rol_id=eq.${rolId}` }, onChange)
    .subscribe()
  return () => { sb.removeChannel(channel) }
}
