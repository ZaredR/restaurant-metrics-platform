import { run } from './db'
import { getSupabase } from './supabase'

/* ─── Alertas dentro del sistema (contextualización, sección 9) ─
   Event alerts are created by triggers; threshold alerts are
   checked by evaluar_alertas() when someone opens the app. Each
   rule says which profiles receive it (RLS filters what you see).
   ─────────────────────────────────────────────────────────── */

export const NIVELES = {
  critical: { label: 'Crítica', variant: 'danger' },
  warning:  { label: 'Atención', variant: 'warning' },
  info:     { label: 'Aviso', variant: 'info' },
}

export const TIPOS_ALERTA = {
  estacion_sin_mesero:      { grupo: 'Operación del turno', umbral: null },
  saturacion_mesero:        { grupo: 'Operación del turno', umbral: 'Comensales por mesero en el turno' },
  carga_area:               { grupo: 'Operación del turno', umbral: 'Comensales por área en el turno' },
  asignacion_excepcion:     { grupo: 'Rol y disponibilidad', umbral: null },
  reasignacion_mesa:        { grupo: 'Rol y disponibilidad', umbral: null },
  respuesta_critica:        { grupo: 'Satisfacción', umbral: 'Calificación igual o menor a' },
  promedio_encuesta_mesero: { grupo: 'Satisfacción', umbral: 'Promedio menor a', periodo: true },
  promedio_turno:           { grupo: 'Satisfacción', umbral: 'Promedio menor a' },
  cierre_mesas_ocupadas:    { grupo: 'Cierre y configuración', umbral: null },
  estacion_sin_mesas:       { grupo: 'Cierre y configuración', umbral: null },
}

export const PERFILES_DESTINO = [
  { value: 'gerente', label: 'Gerente' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'capitan', label: 'Capitán' },
  { value: 'rrhh', label: 'RR. HH.' },
  { value: 'hostess', label: 'Hostess' },
  { value: 'admin', label: 'Admin' },
]

// The threshold check runs at most every 2 minutes per browser tab.
let lastEvaluation = 0
export async function evaluateAlerts({ force = false } = {}) {
  if (!force && Date.now() - lastEvaluation < 120000) return 0
  lastEvaluation = Date.now()
  return run((sb) => sb.rpc('evaluar_alertas'))
}

export async function countPendingAlerts() {
  const { count, error } = await getSupabase()
    .from('alertas').select('id', { count: 'exact', head: true }).eq('atendida', false)
  if (error) throw new Error(error.message)
  return count ?? 0
}

export function listAlerts(pendientes) {
  return run((sb) =>
    sb.from('alertas')
      .select('id, nivel, mensaje, created_at, atendida, atendida_nombre, atendida_at, nota, destinatarios, regla:reglas_alerta(nombre, tipo)')
      .eq('atendida', !pendientes)
      .order('created_at', { ascending: false })
      .limit(200)
  )
}

/* Fired after attending so the bell recounts even without Realtime. */
export const ALERTS_CHANGED = 'alertas:cambio'

export async function attendAlert(id, nota) {
  await run((sb) => sb.rpc('atender_alerta', { p_alerta_id: id, p_nota: nota || null }))
  window.dispatchEvent(new Event(ALERTS_CHANGED))
}

export function listRules() {
  return run((sb) =>
    sb.from('reglas_alerta').select('id, nombre, tipo, umbral, periodo_dias, destinatarios, nivel, activa').order('nombre')
  )
}

export function saveRule({ id, umbral, periodo_dias, destinatarios, nivel, activa }) {
  return run((sb) => sb.from('reglas_alerta').update({
    umbral: Number(umbral) || 0, periodo_dias: Number(periodo_dias) || 1, destinatarios, nivel, activa,
  }).eq('id', id))
}

/* Calls onChange when an alert is created or attended. Returns the unsubscribe function. */
export function subscribeToAlerts(onChange) {
  const sb = getSupabase()
  const channel = sb.channel('alertas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas' }, onChange)
    .subscribe()
  return () => { sb.removeChannel(channel) }
}
