import { getSupabase } from './supabase'
import { ROLES } from '../constants/roles'
import { ROUTES } from '../constants/routes'

/* ─── Auth service ─────────────────────────────────────────
   All Supabase auth calls live here. The store calls these
   functions and gets back plain objects; it never imports
   Supabase directly.
   ─────────────────────────────────────────────────────────── */

export async function loginWithEmail(email, password) {
  const sb = getSupabase()
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw error

  const { data: profile, error: profileError } = await sb
    .from('usuarios')
    .select('*, restaurante:restaurantes(nombre)')
    .eq('id', data.user.id)
    .single()

  if (profileError) {
    await sb.auth.signOut()
    throw new Error('Tu cuenta todavía no tiene perfil. Pide a gerencia que te dé de alta en Usuarios.')
  }

  // Deactivated users keep their history but can't sign in.
  if (!profile.activo) {
    await sb.auth.signOut()
    throw new Error('Tu acceso está desactivado. Habla con gerencia.')
  }

  return {
    user: {
      id:          profile.id,
      nombre:      profile.nombre,
      email:       profile.email,
      rol:         profile.rol,
      restaurante: profile.restaurante?.nombre ?? null,
      restaurante_id: profile.restaurante_id ?? null,
      activo:      profile.activo,
    },
    token: data.session.access_token,
  }
}

export async function recoverPassword(email) {
  const sb = getSupabase()
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${ROUTES.RESET_PASSWORD}`,
  })
  if (error) throw error
}

export async function updatePassword(newPassword) {
  const sb = getSupabase()
  const { error } = await sb.auth.updateUser({ password: newPassword })
  if (error) throw error
}

export async function logout() {
  const sb = getSupabase()
  await sb.auth.signOut()
}

/* ─── Demo login (used when Supabase is not configured) ──── */
export function demoLogin(email, password) {
  const demos = {
    'admin@demo.com':      { id: '1', nombre: 'Luis Cervantes', email, rol: ROLES.ADMIN,      restaurante: null },
    'gerente@demo.com':    { id: '2', nombre: 'Ana García',     email, rol: ROLES.GERENTE,    restaurante: 'Sucursal Centro' },
    'supervisor@demo.com': { id: '3', nombre: 'Carlos López',   email, rol: ROLES.SUPERVISOR, restaurante: 'Sucursal Norte' },
    'mesero@demo.com':     { id: '4', nombre: 'Diego Ruiz',     email, rol: ROLES.MESERO,     restaurante: 'Sucursal Centro' },
  }
  const user = demos[email]
  if (!user || password !== 'demo1234') throw new Error('Credenciales incorrectas')
  return { user, token: 'demo-token' }
}
