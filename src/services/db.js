import { getSupabase } from './supabase'

/* ─── Query helper ─────────────────────────────────────────
   Runs a Supabase query built from the client and returns its
   data, or throws an Error with a message the UI can show.
   ─────────────────────────────────────────────────────────── */

const FRIENDLY = {
  '23505': 'Ya existe un registro con ese valor.',
  '23503': 'No se puede completar: hay registros relacionados.',
  '42501': 'No tienes permiso para realizar esta acción.',
}

/* Unique constraints with a clearer message than the generic 23505 one. */
const CONSTRAINTS = {
  visitas_mesa_ocupada:                  'Esa mesa ya está ocupada. Actualiza la pantalla y elige otra.',
  rol_asignaciones_rol_id_empleado_id_key: 'Ese empleado ya está asignado en este rol.',
  rol_asignaciones_mesero_estacion:      'Esa estación ya tiene mesero en este rol.',
  rol_asignaciones_capitan_area:         'Esa área ya tiene capitán en este rol.',
  roles_diarios_fecha_turno_id_key:      'Ya existe un rol para ese día y turno.',
  mesas_numero_key:                      'Ya existe una mesa con ese número.',
}

export async function run(build) {
  const { data, error } = await build(getSupabase())
  if (error) {
    const constraint = Object.keys(CONSTRAINTS).find((c) => error.message?.includes(c))
    // Business-rule errors (check_violation) come from our triggers already in Spanish.
    const err = new Error(constraint ? CONSTRAINTS[constraint] : FRIENDLY[error.code] ?? error.message)
    err.code = error.code // e.g. RA001: a restriction that needs a reason to proceed
    throw err
  }
  return data
}
