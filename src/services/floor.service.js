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
      .select('id, numero, capacidad, activo, estado, estacion_id, estacion:estaciones(nombre, area:areas(nombre))')
      .order('numero')
  )
}

export function saveTable({ id, ...fields }) {
  const row = { ...fields, numero: Number(fields.numero), capacidad: Number(fields.capacidad) }
  return run((sb) => (id ? sb.from('mesas').update(row).eq('id', id) : sb.from('mesas').insert(row)))
}

/* Creates tables desde..hasta (inclusive) in one station. */
export function createTableRange({ estacion_id, desde, hasta, capacidad }) {
  const from = Number(desde), to = Number(hasta)
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    return Promise.reject(new Error('El rango de mesas no es válido.'))
  }
  if (to - from >= 200) {
    return Promise.reject(new Error('El rango no puede tener más de 200 mesas.'))
  }
  const rows = Array.from({ length: to - from + 1 }, (_, i) => ({
    estacion_id,
    numero: from + i,
    capacidad: Number(capacidad),
  }))
  return run((sb) => sb.from('mesas').insert(rows))
}

/* Activo/inactivo para cualquiera de las tres tablas del catálogo. */
export function setFloorItemActive(table, id, activo) {
  return run((sb) => sb.from(table).update({ activo }).eq('id', id))
}
