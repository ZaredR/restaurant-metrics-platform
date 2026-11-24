import { run } from './db'
import { getSupabase } from './supabase'
import { ROUTES } from '../constants/routes'

/* ─── Dispositivos vinculados (tablets de Hostess y Encuestas) ──
   Management registers a device and gets a one-time link (24 h).
   Opened on the tablet, the link signs in anonymously and redeems
   it; from then on the tablet works with the device's function
   and no personal password. Revoking it cuts access at once.
   ─────────────────────────────────────────────────────────── */

export const FUNCIONES_DISPOSITIVO = {
  hostess:   'Hostess (recepción)',
  encuestas: 'Encuestas',
}

export const ESTADOS_DISPOSITIVO = {
  pendiente: { label: 'Pendiente de vincular', variant: 'warning' },
  vinculado: { label: 'Vinculado',             variant: 'success' },
  revocado:  { label: 'Revocado',              variant: 'neutral' },
}

export const linkUrl = (token) => `${window.location.origin}${ROUTES.LINK_DEVICE_BASE}/${token}`

export function listDevices() {
  return run((sb) =>
    sb.from('dispositivos')
      .select('id, nombre, funcion, estado, token_expira, vinculado_at, ultimo_uso, revocado_at, created_at')
      .order('created_at', { ascending: false })
  )
}

/* Returns { id, token }. */
export function createDevice(nombre, funcion) {
  return run((sb) => sb.rpc('crear_dispositivo', { p_nombre: nombre.trim(), p_funcion: funcion }))
}

/* New link for a pending device (the previous one stops working). Returns the token. */
export function newDeviceLink(id) {
  return run((sb) => sb.rpc('generar_enlace_dispositivo', { p_dispositivo_id: id }))
}

export function revokeDevice(id) {
  return run((sb) => sb.rpc('revocar_dispositivo', { p_dispositivo_id: id }))
}

export function renameDevice(id, nombre) {
  return run((sb) => sb.from('dispositivos').update({ nombre: nombre.trim() }).eq('id', id))
}

/* User object for the auth store; the role key maps to the device permissions. */
const deviceUser = (uid, d) => ({
  id: uid,
  nombre: d.nombre,
  email: null,
  rol: `dispositivo_${d.funcion}`,
  restaurante: null,
  activo: true,
  dispositivo: { id: d.id, funcion: d.funcion },
})

/* On the tablet: anonymous session + redeem the link. */
export async function linkThisDevice(token) {
  const sb = getSupabase()
  const { data: current } = await sb.auth.getSession()
  if (current.session) await sb.auth.signOut()
  const { data, error } = await sb.auth.signInAnonymously()
  if (error) {
    throw new Error(/anonymous/i.test(error.message)
      ? 'El acceso de tablets no está activado en Supabase (Allow anonymous sign-ins).'
      : error.message)
  }
  try {
    const device = await run((client) => client.rpc('vincular_dispositivo', { p_token: token }))
    return { user: deviceUser(data.user.id, device), token: data.session.access_token }
  } catch (err) {
    await sb.auth.signOut()
    throw err
  }
}

/* On app start in a tablet: still linked? (null once revoked). */
export async function checkThisDevice() {
  const sb = getSupabase()
  const { data } = await sb.auth.getSession()
  if (!data.session) return null
  const device = await run((client) => client.rpc('mi_dispositivo'))
  return device ? deviceUser(data.session.user.id, device) : null
}
