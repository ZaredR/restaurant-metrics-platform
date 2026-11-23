import { run } from './db'

/* ─── Indicadores operativos (contextualización, sección 8) ───
   The database decides the scope: management, captain and
   supervisor get everything; a waiter only their own numbers.
   ─────────────────────────────────────────────────────────── */

export function getIndicators(desde, hasta) {
  return run((sb) => sb.rpc('indicadores', { p_desde: desde, p_hasta: hasta }))
}

/* Today's operation for the dashboard (management and supervision). */
export function getDaySummary(fecha) {
  return run((sb) => sb.rpc('resumen_del_dia', { p_fecha: fecha }))
}
