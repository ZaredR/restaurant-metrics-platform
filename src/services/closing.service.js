import { run } from './db'

/* ─── Cierre del turno (contextualización, sección 7) ─────────
   The database computes the proposal and checks every rule;
   these functions only read and call its RPCs.
   ─────────────────────────────────────────────────────────── */

export const METODOS = {
  proporcional: {
    label: 'A · Proporcional por comensales',
    help: 'Cada quien recibe la parte del fondo que corresponde a los comensales que atendió.',
  },
  puntos: {
    label: 'B · Por puntos',
    help: 'Meseros: puntos por comensal. Capitán, runner y hostess: puntos fijos por turno.',
  },
  mixto: {
    label: 'C · Mixto',
    help: 'Un porcentaje se divide en partes iguales y el resto por puntos.',
  },
}

export const ESTADOS_CIERRE = {
  borrador:   { label: 'Borrador',   variant: 'warning' },
  propuesto:  { label: 'Propuesta',  variant: 'info' },
  autorizado: { label: 'Autorizado', variant: 'success' },
}

export const FUNCIONES = { mesero: 'Mesero', capitan: 'Capitán', runner: 'Runner', hostess: 'Hostess' }

const FIELDS = `id, rol_id, fondo, metodo, parametros, estado, notas, calculado_at, autorizado_at,
  participantes:cierre_participantes(id, empleado_id, funcion, comensales, puntos, monto_calculado, ajuste, motivo_ajuste, monto_final)`

export function getClosing(rolId) {
  return run((sb) => sb.from('cierres').select(FIELDS).eq('rol_id', rolId).maybeSingle())
}

export function listClosingEvents(cierreId) {
  return run((sb) =>
    sb.from('cierre_eventos')
      .select('id, accion, detalle, motivo, usuario_nombre, created_at')
      .eq('cierre_id', cierreId)
      .order('created_at', { ascending: false })
  )
}

/* Exit order of the closing waiters (Canvas): fewest covers leave first, per area. */
export function getExitOrder(rolId) {
  return run((sb) =>
    sb.from('v_orden_salida').select('area, mesero, comensales, orden').eq('rol_id', rolId).order('area').order('orden')
  )
}

export async function countSeatedVisits(rolId) {
  const rows = await run((sb) => sb.from('visitas').select('id').eq('rol_id', rolId).eq('estado', 'sentada'))
  return rows.length
}

export function prepareClosing(rolId, { fondo, metodo, parametros }) {
  return run((sb) => sb.rpc('cierre_preparar', {
    p_rol_id: rolId, p_fondo: Number(fondo), p_metodo: metodo, p_parametros: parametros,
  }))
}

export function addParticipant(cierreId, empleadoId, funcion) {
  return run((sb) => sb.rpc('cierre_agregar_participante', { p_cierre_id: cierreId, p_empleado_id: empleadoId, p_funcion: funcion }))
}

export function removeParticipant(id) {
  return run((sb) => sb.rpc('cierre_quitar_participante', { p_participante_id: id }))
}

export function calculateClosing(id) {
  return run((sb) => sb.rpc('cierre_calcular', { p_cierre_id: id }))
}

export function adjustParticipant(id, ajuste, motivo) {
  return run((sb) => sb.rpc('cierre_ajustar', { p_participante_id: id, p_ajuste: Number(ajuste), p_motivo: motivo }))
}

export function returnClosingToDraft(id) {
  return run((sb) => sb.rpc('cierre_regresar', { p_cierre_id: id }))
}

export function authorizeClosing(id) {
  return run((sb) => sb.rpc('cierre_autorizar', { p_cierre_id: id }))
}
