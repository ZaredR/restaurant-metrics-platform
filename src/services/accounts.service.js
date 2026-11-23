import { run } from './db'

/* ─── Usuarios y perfiles (contextualización, sección 3.2) ────
   The app never handles passwords: management registers an
   invitation (email, name, profile, employee) and the profile is
   linked automatically when that person has an account in
   Supabase Authentication. Users are deactivated, never deleted.
   ─────────────────────────────────────────────────────────── */

export function listUsers() {
  return run((sb) =>
    sb.from('usuarios').select('id, nombre, email, rol, activo, empleado_id, created_at').order('nombre')
  )
}

export function updateUser(id, fields) {
  return run((sb) => sb.from('usuarios').update(fields).eq('id', id))
}

export function listInvitations() {
  return run((sb) =>
    sb.from('invitaciones').select('email, nombre, rol, empleado_id, created_at').is('usada_at', null).order('created_at', { ascending: false })
  )
}

/* Returns 'perfil_creado' (the account already existed) or 'invitacion'. */
export function inviteUser({ email, nombre, rol, empleado_id }) {
  return run((sb) => sb.rpc('invitar_usuario', {
    p_email: email, p_nombre: nombre, p_rol: rol, p_empleado_id: empleado_id || null,
  }))
}

export function cancelInvitation(email) {
  return run((sb) => sb.rpc('cancelar_invitacion', { p_email: email }))
}

/* Employees to link a user to (only management can read them). */
export function listEmployeesForLink() {
  return run((sb) => sb.from('empleados').select('id, nombre, apellidos, puesto, activo').order('nombre'))
}
