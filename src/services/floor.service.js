import { run } from './db'

/* Operational state of a table; "ocupada" is not stored, it comes from the seated visit. */
export const ESTADOS_MESA = {
  disponible:     { label: 'Disponible',        variant: 'success' },
  reservada:      { label: 'Reservada',         variant: 'info' },
  en_limpieza:    { label: 'En limpieza',       variant: 'purple' },
  fuera_servicio: { label: 'Fuera de servicio', variant: 'danger' },
  cerrada:        { label: 'Cerrada',           variant: 'neutral' },
}

/* Hostess, captain, supervisor and management; blocked while the table is occupied. */
export function setTableState(mesaId, estado) {
  return run((sb) => sb.rpc('cambiar_estado_mesa', { p_mesa_id: mesaId, p_estado: estado }))
}

/* ─── Catálogo del local: áreas, estaciones y mesas ────────── */

export function listAreas() {
  return run((sb) => sb.from('areas').select('id, nombre, descripcion, orden, activo').order('orden').order('nombre'))
}

export function saveArea({ id, ...fields }) {
  const row = { ...fields, descripcion: fields.descripcion || null, orden: Number(fields.orden) || 0 }
  return run((sb) => (id ? sb.from('areas').update(row).eq('id', id) : sb.from('areas').insert(row)))
}

export function listStations() {
  return run((sb) =>
    sb.from('estaciones')
      .select('id, nombre, activo, area_id, area:areas(nombre), mesas(count)')
      .order('nombre')
  )
}

export function saveStation({ id, ...fields }) {
  return run((sb) => (id ? sb.from('estaciones').update(fields).eq('id', id) : sb.from('estaciones').insert(fields)))
}

export function listTables() {
  return run((sb) =>
    sb.from('mesas')
      .select('id, numero, capacidad, activo, estado, area_id, estacion_id, area:areas(nombre), estacion:estaciones(nombre)')
      .order('numero')
  )
}

export function saveTable({ id, ...fields }) {
  // The station is optional: without one, the table is served in TIROS mode.
  const row = { ...fields, numero: Number(fields.numero), capacidad: Number(fields.capacidad), estacion_id: fields.estacion_id || null }
  return run((sb) => (id ? sb.from('mesas').update(row).eq('id', id) : sb.from('mesas').insert(row)))
}

/* Creates tables desde..hasta (inclusive) in one station. */
export function createTableRange({ area_id, estacion_id, desde, hasta, capacidad }) {
  const from = Number(desde), to = Number(hasta)
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    return Promise.reject(new Error('El rango de mesas no es válido.'))
  }
  if (to - from >= 200) {
    return Promise.reject(new Error('El rango no puede tener más de 200 mesas.'))
  }
  const rows = Array.from({ length: to - from + 1 }, (_, i) => ({
    area_id,
    estacion_id: estacion_id || null,
    numero: from + i,
    capacidad: Number(capacidad),
  }))
  return run((sb) => sb.from('mesas').insert(rows))
}

/* Activo/inactivo para cualquiera de las tres tablas del catálogo. */
export function setFloorItemActive(table, id, activo) {
  return run((sb) => sb.from(table).update({ activo }).eq('id', id))
}

/* Consecutive table numbers of an area as ranges: [1,2,3,7] -> ["1–3", "7"]. */
export function tableRanges(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b)
  const out = []
  sorted.forEach((n) => {
    const last = out.at(-1)
    if (last && n === last[1] + 1) last[1] = n
    else out.push([n, n])
  })
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`))
}

/* ─── Funciones de runner (Fría, Caliente…) ──────────────── */

export function listRunnerFunctions() {
  return run((sb) => sb.from('funciones_runner').select('id, nombre, orden, activo').order('orden').order('nombre'))
}

export function saveRunnerFunction({ id, nombre, orden }) {
  const row = { nombre: nombre.trim(), orden: Number(orden) || 0 }
  return run((sb) => (id ? sb.from('funciones_runner').update(row).eq('id', id) : sb.from('funciones_runner').insert(row)))
}
