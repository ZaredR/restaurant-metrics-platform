import { run } from './db'

/* ─── Disponibilidad: dónde puede trabajar cada quien y sus restricciones ── */

/* Error code of a restriction that can be overridden with a reason. */
export const RESTRICTION_CODE = 'RA001'

export const ESTADOS_EMPLEADO = {
  activo:         { label: 'Activo',            variant: 'success' },
  inactivo:       { label: 'Inactivo',          variant: 'neutral' },
  suspendido:     { label: 'Suspendido',        variant: 'danger' },
  pendiente_alta: { label: 'Pendiente de alta', variant: 'warning' },
}

export const TIPOS_RESTRICCION = {
  solo_turno:   { label: 'Solo puede trabajar un turno', needs: 'turno' },
  no_turno:     { label: 'No puede trabajar un turno',   needs: 'turno' },
  no_cierre:    { label: 'No puede cubrir cierre' },
  no_area:      { label: 'No puede asignarse a un área', needs: 'area' },
  dia_descanso: { label: 'Día de descanso fijo',         needs: 'dia' },
  capacitacion: { label: 'En capacitación (asignación acompañada)' },
  otra:         { label: 'Otra (describir)',              needs: 'descripcion' },
}

export const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

export function listAuthorizations(empleadoId) {
  return run((sb) => {
    const q = sb.from('empleado_autorizaciones').select('id, empleado_id, area_id, estacion_id')
    return empleadoId ? q.eq('empleado_id', empleadoId) : q
  })
}

/* Replaces the employee's authorized areas and stations. */
export async function setAuthorizations(empleadoId, { areaIds, estacionIds }) {
  await run((sb) => sb.from('empleado_autorizaciones').delete().eq('empleado_id', empleadoId))
  const rows = [
    ...areaIds.map((area_id) => ({ empleado_id: empleadoId, area_id })),
    ...estacionIds.map((estacion_id) => ({ empleado_id: empleadoId, estacion_id })),
  ]
  if (rows.length) await run((sb) => sb.from('empleado_autorizaciones').insert(rows))
}

const RESTRICTION_FIELDS = 'id, empleado_id, tipo, turno_id, area_id, dia_semana, fecha_inicio, fecha_fin, descripcion'

export function listRestrictions(empleadoId) {
  return run((sb) => {
    const q = sb.from('empleado_restricciones').select(RESTRICTION_FIELDS).order('created_at')
    return empleadoId ? q.eq('empleado_id', empleadoId) : q
  })
}

export function addRestriction(row) {
  const needs = TIPOS_RESTRICCION[row.tipo]?.needs
  return run((sb) => sb.from('empleado_restricciones').insert({
    empleado_id:  row.empleado_id,
    tipo:         row.tipo,
    turno_id:     needs === 'turno' ? row.turno_id || null : null,
    area_id:      needs === 'area' ? row.area_id || null : null,
    dia_semana:   needs === 'dia' ? Number(row.dia_semana) || null : null,
    fecha_inicio: row.fecha_inicio || null,
    fecha_fin:    row.fecha_fin || null,
    descripcion:  row.descripcion?.trim() || null,
  }))
}

export function removeRestriction(id) {
  return run((sb) => sb.from('empleado_restricciones').delete().eq('id', id))
}

/* Short text of a restriction, e.g. "Solo turno Vespertino · hasta 30/11". */
export function describeRestriction(r, { turnos = [], areas = [] } = {}) {
  const turno = turnos.find((t) => t.id === r.turno_id)?.nombre
  const area = areas.find((a) => a.id === r.area_id)?.nombre
  const text = {
    solo_turno:   `Solo turno ${turno ?? ''}`,
    no_turno:     `No trabaja turno ${turno ?? ''}`,
    no_cierre:    'No cubre cierre',
    no_area:      `No se asigna a ${area ?? ''}`,
    dia_descanso: `Descansa el ${DIAS[(r.dia_semana ?? 1) - 1]}`,
    capacitacion: 'En capacitación',
    otra:         r.descripcion,
  }[r.tipo]
  const when = r.fecha_inicio || r.fecha_fin
    ? ` · ${r.fecha_inicio ? `del ${r.fecha_inicio.split('-').reverse().join('/')} ` : ''}${r.fecha_fin ? `al ${r.fecha_fin.split('-').reverse().join('/')}` : 'en adelante'}`
    : ' · permanente'
  return `${text}${r.tipo === 'capacitacion' && r.descripcion ? ` (${r.descripcion})` : ''}${when}`
}

/* Same rules as advertencias_asignacion() in the database, to label options
   and pick suggestions; the database still has the last word. */
export function slotWarnings(slot, { fecha, turnoId, authorizations, restrictions, stations, areas }) {
  const { empleado_id, funcion, estacion_id, es_cierre } = slot
  const areaId = estacion_id ? stations.find((s) => s.id === estacion_id)?.area_id : slot.area_id
  const warnings = []

  const auth = authorizations.filter((a) => a.empleado_id === empleado_id)
  if (funcion !== 'hostess' && areaId && auth.length) {
    const ok = estacion_id
      ? auth.some((a) => a.estacion_id === estacion_id || a.area_id === areaId)
      : auth.some((a) => a.area_id === areaId || stations.find((s) => s.id === a.estacion_id)?.area_id === areaId)
    if (!ok) warnings.push(estacion_id ? 'no autorizado en esta estación' : 'no autorizado en esta área')
  }

  const dow = ((new Date(`${fecha}T12:00:00`).getDay() + 6) % 7) + 1
  restrictions
    .filter((r) => r.empleado_id === empleado_id
      && (!r.fecha_inicio || r.fecha_inicio <= fecha) && (!r.fecha_fin || fecha <= r.fecha_fin))
    .forEach((r) => {
      if (r.tipo === 'solo_turno' && r.turno_id !== turnoId) warnings.push('solo otro turno')
      if (r.tipo === 'no_turno' && r.turno_id === turnoId) warnings.push('no trabaja este turno')
      if (r.tipo === 'no_cierre' && es_cierre) warnings.push('no cubre cierre')
      if (r.tipo === 'no_area' && r.area_id === areaId) warnings.push(`no se asigna a ${areas.find((a) => a.id === areaId)?.nombre ?? 'esta área'}`)
      if (r.tipo === 'dia_descanso' && r.dia_semana === dow) warnings.push('su día de descanso')
      if (r.tipo === 'capacitacion') warnings.push('en capacitación')
      if (r.tipo === 'otra') warnings.push(r.descripcion)
    })
  return warnings
}
