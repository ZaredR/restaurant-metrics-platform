import { run } from './db'

/* ─── Rol diario: quién trabaja dónde en cada turno ────────── */

export const ESTADOS_ROL = {
  borrador:    { label: 'Borrador',    variant: 'warning' },
  en_revision: { label: 'En revisión', variant: 'info' },
  publicado:   { label: 'Publicado',   variant: 'success' },
  modificado:  { label: 'Modificado',  variant: 'purple' },
  cerrado:     { label: 'Cerrado',     variant: 'neutral' },
}

/* Once published, every change goes through rol_ajustar() with a reason. */
export const needsReason = (estado) => estado === 'publicado' || estado === 'modificado'

const ASSIGNMENT_FIELDS = 'id, empleado_id, funcion, area_id, estacion_id, es_cierre, funcion_runner_id'

/* The roster for a date and shift, or null if it hasn't been created yet. */
export function getRoster(fecha, turnoId) {
  return run((sb) =>
    sb.from('roles_diarios')
      .select(`id, fecha, turno_id, estado, notas, publicado_at, asignaciones:rol_asignaciones(${ASSIGNMENT_FIELDS}), modos:rol_areas(area_id, modo)`)
      .eq('fecha', fecha)
      .eq('turno_id', turnoId)
      .maybeSingle()
  )
}

export function createRoster(fecha, turnoId) {
  return run((sb) => sb.from('roles_diarios').insert({ fecha, turno_id: turnoId }))
}

/* Who can work this date/shift: absence, schedule and availability per employee. */
export function getAvailability(fecha, turnoId) {
  return run((sb) => sb.rpc('empleados_disponibles', { p_fecha: fecha, p_turno: turnoId }))
}

/* Names only, for users who view the roster but can't see availability
   (it reveals absences). Same shape as getAvailability() without the schedule. */
export async function getDirectory() {
  const rows = await run((sb) =>
    sb.from('empleados_directorio').select('id, nombre_completo, puesto').eq('activo', true)
  )
  return rows.map((e) => ({ empleado_id: e.id, nombre: e.nombre_completo, puesto: e.puesto }))
}

/* Last roster of the same shift before `fecha`, to rotate stations. */
export async function getPreviousStations(fecha, turnoId) {
  const rows = await run((sb) =>
    sb.from('roles_diarios')
      .select('fecha, asignaciones:rol_asignaciones(empleado_id, estacion_id, funcion)')
      .eq('turno_id', turnoId)
      .lt('fecha', fecha)
      .order('fecha', { ascending: false })
      .limit(1)
  )
  const last = rows[0]?.asignaciones ?? []
  return new Map(last.filter((a) => a.funcion === 'mesero').map((a) => [a.empleado_id, a.estacion_id]))
}

/* What to review before publishing: absences, schedule, restrictions, coverage (managers only). */
export function getConflicts(rolId) {
  return run((sb) => sb.rpc('conflictos_rol', { p_rol_id: rolId }))
}

/* Assignments made despite a restriction, with their reason. */
export function listExceptions(rolId) {
  return run((sb) =>
    sb.from('rol_excepciones')
      .select('id, empleado_id, advertencias, motivo, usuario_nombre, created_at')
      .eq('rol_id', rolId)
      .order('created_at', { ascending: false })
  )
}

/* `motivo` is required when the roster is published (see needsReason), or to
   assign someone despite a restriction (error RA001). It goes through rol_ajustar(). */
export function addAssignments(rows, motivo) {
  if (motivo) {
    return Promise.all(rows.map((row) =>
      run((sb) => sb.rpc('rol_ajustar', { p_operacion: 'alta', p_asignacion_id: null, p_datos: row, p_motivo: motivo }))
    ))
  }
  return run((sb) => sb.from('rol_asignaciones').insert(rows))
}

export function updateAssignment(id, fields, motivo) {
  if (motivo) {
    return run((sb) => sb.rpc('rol_ajustar', { p_operacion: 'cambio', p_asignacion_id: id, p_datos: fields, p_motivo: motivo }))
  }
  return run((sb) => sb.from('rol_asignaciones').update(fields).eq('id', id))
}

export function removeAssignment(id, motivo) {
  if (motivo) {
    return run((sb) => sb.rpc('rol_ajustar', { p_operacion: 'baja', p_asignacion_id: id, p_datos: null, p_motivo: motivo }))
  }
  return run((sb) => sb.from('rol_asignaciones').delete().eq('id', id))
}

export function listAdjustments(rolId) {
  return run((sb) =>
    sb.from('rol_ajustes')
      .select('id, accion, antes, despues, motivo, usuario_nombre, created_at')
      .eq('rol_id', rolId)
      .order('created_at', { ascending: false })
  )
}

export function sendToReview(id) {
  return run((sb) => sb.rpc('enviar_rol_a_revision', { p_rol_id: id }))
}

export function returnToDraft(id) {
  return run((sb) => sb.rpc('regresar_rol_a_borrador', { p_rol_id: id }))
}

export function publishRoster(id) {
  return run((sb) => sb.rpc('publicar_rol', { p_rol_id: id }))
}

export function closeRoster(id) {
  return run((sb) => sb.rpc('cerrar_rol', { p_rol_id: id }))
}

/* Work mode of an area in a roster: 'estaciones' (default), 'tiros' or 'sin_servicio'. */
export const MODOS_AREA = {
  sin_servicio: 'Sin servicio',
  estaciones:   'Estaciones',
  tiros:        'TIROS',
}

export function setAreaMode(rolId, areaId, modo) {
  return run((sb) => sb.from('rol_areas').upsert({ rol_id: rolId, area_id: areaId, modo }, { onConflict: 'rol_id,area_id' }))
}
