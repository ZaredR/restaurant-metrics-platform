/* ─── Seguridad: permisos por rol (RLS) ─────────────────────
   Las políticas replican, del lado de la base de datos, lo que
   la app controla con ROLE_PERMISSIONS. Sin sesión (anon) no se
   ve nada.
   ──────────────────────────────────────────────────────────── */

-- security definer para leer `usuarios` sin pasar por su propia RLS.
create function public.rol_actual()
returns text
language sql stable security definer set search_path = public
as $$
  select rol from usuarios where id = auth.uid() and activo
$$;

create function public.tiene_rol(variadic p_roles text[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(rol_actual() = any (p_roles), false)
$$;

create function public.mi_empleado_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select empleado_id from usuarios where id = auth.uid()
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'restaurantes','empleados','usuarios','configuracion','ausencias','turnos','horarios',
    'areas','estaciones','mesas','roles_diarios','rol_asignaciones','visitas',
    'encuestas','preguntas','respuestas_encuesta','respuestas_detalle',
    'reglas_alerta','alertas','auditoria'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- Lectura para cualquier usuario con sesión: catálogos sin datos personales.
  -- Empleados, horarios, rol y visitas tienen su propia política de lectura más abajo.
  foreach t in array array[
    'restaurantes','configuracion','turnos','areas','estaciones','mesas','encuestas','preguntas'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_leer', t);
  end loop;

  -- Configuración del local y de encuestas/alertas: admin y gerente.
  foreach t in array array[
    'restaurantes','configuracion','turnos','areas','estaciones','mesas',
    'encuestas','preguntas','reglas_alerta'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.tiene_rol(''admin'',''gerente''))
         with check (public.tiene_rol(''admin'',''gerente''))',
      t || '_administrar', t);
  end loop;

  -- Personal, ausencias y horarios: admin, gerente y RR. HH.
  foreach t in array array['empleados','ausencias','horarios'] loop
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.tiene_rol(''admin'',''gerente'',''rrhh''))
         with check (public.tiene_rol(''admin'',''gerente'',''rrhh''))',
      t || '_administrar', t);
  end loop;

  -- Rol diario: además de gerencia, lo arman los capitanes (supervisor en la versión actual).
  foreach t in array array['roles_diarios','rol_asignaciones'] loop
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.tiene_rol(''admin'',''gerente'',''capitan'',''supervisor''))
         with check (public.tiene_rol(''admin'',''gerente'',''capitan'',''supervisor''))',
      t || '_administrar', t);
  end loop;
end;
$$;

/* ─── Lectura de datos del personal y de la operación ─────────
   Quien coordina (admin, gerente, RR. HH., capitán, supervisor) ve todo.
   Meseros, runners y hostess solo ven lo propio; los nombres de sus
   compañeros les llegan por la vista empleados_directorio.
   ──────────────────────────────────────────────────────────── */

create policy empleados_leer on public.empleados for select to authenticated
  using (id = public.mi_empleado_id()
         or public.tiene_rol('admin','gerente','rrhh','capitan','supervisor'));

create policy horarios_leer on public.horarios for select to authenticated
  using (empleado_id = public.mi_empleado_id()
         or public.tiene_rol('admin','gerente','rrhh','capitan','supervisor'));

-- Un rol en borrador solo lo ven quienes lo arman; publicado o cerrado, todos.
create policy roles_diarios_leer on public.roles_diarios for select to authenticated
  using (estado <> 'borrador'
         or public.tiene_rol('admin','gerente','capitan','supervisor'));

-- Las asignaciones siguen la visibilidad de su rol (la subconsulta aplica la política de arriba).
create policy rol_asignaciones_leer on public.rol_asignaciones for select to authenticated
  using (exists (select 1 from public.roles_diarios r where r.id = rol_asignaciones.rol_id));

-- Un mesero solo ve las visitas que atendió; la hostess y los encargados, todas.
create policy visitas_leer on public.visitas for select to authenticated
  using (mesero_id = public.mi_empleado_id()
         or public.tiene_rol('admin','gerente','capitan','supervisor','hostess'));

/* ─── Usuarios ────────────────────────────────────────────── */

create policy usuarios_leer on public.usuarios for select to authenticated
  using (id = auth.uid() or public.tiene_rol('admin','gerente','rrhh'));

create policy usuarios_administrar on public.usuarios for all to authenticated
  using (public.tiene_rol('admin','gerente'))
  with check (public.tiene_rol('admin','gerente'));

/* ─── Ausencias: cada quien ve las suyas ──────────────────── */

create policy ausencias_leer on public.ausencias for select to authenticated
  using (empleado_id = public.mi_empleado_id()
         or public.tiene_rol('admin','gerente','rrhh'));

/* ─── Hostess ─────────────────────────────────────────────── */

create policy visitas_registrar on public.visitas for all to authenticated
  using (public.tiene_rol('admin','gerente','capitan','supervisor','hostess'))
  with check (public.tiene_rol('admin','gerente','capitan','supervisor','hostess'));

/* ─── Encuestas ───────────────────────────────────────────── */

-- SUPUESTO: la encuesta la captura personal del restaurante; si la llena
-- el cliente (QR), se agregará un acceso público controlado.
create policy respuestas_leer on public.respuestas_encuesta for select to authenticated
  using (public.tiene_rol('admin','gerente','capitan','supervisor'));
create policy respuestas_capturar on public.respuestas_encuesta for insert to authenticated
  with check (public.tiene_rol('admin','gerente','capitan','supervisor','hostess'));

create policy respuestas_detalle_leer on public.respuestas_detalle for select to authenticated
  using (public.tiene_rol('admin','gerente','capitan','supervisor'));
create policy respuestas_detalle_capturar on public.respuestas_detalle for insert to authenticated
  with check (public.tiene_rol('admin','gerente','capitan','supervisor','hostess'));

/* ─── Alertas y auditoría ─────────────────────────────────── */

create policy reglas_alerta_leer on public.reglas_alerta for select to authenticated
  using (public.tiene_rol('admin','gerente','capitan','supervisor'));

create policy alertas_leer on public.alertas for select to authenticated
  using (public.tiene_rol('admin','gerente','capitan','supervisor'));
create policy alertas_atender on public.alertas for update to authenticated
  using (public.tiene_rol('admin','gerente'))
  with check (public.tiene_rol('admin','gerente'));

-- Solo lectura: los registros los escribe el trigger de auditoría.
create policy auditoria_leer on public.auditoria for select to authenticated
  using (public.tiene_rol('admin'));

/* ─── Funciones y vistas: quién puede usarlas ───────────────
   Postgres deja ejecutar cualquier función a PUBLIC y Supabase
   además a anon, así que sin esto se podrían llamar por la API
   sin iniciar sesión.
   ──────────────────────────────────────────────────────────── */

revoke execute on all functions in schema public from public, anon;

-- Las que usan la app y las políticas.
grant execute on function
  public.rol_actual(),
  public.tiene_rol(text[]),
  public.mi_empleado_id(),
  public.empleados_disponibles(date, uuid),
  public.publicar_rol(uuid),
  public.cerrar_rol(uuid)
to authenticated;

-- Internas: solo las usan los triggers y otras funciones (que corren como dueño).
revoke execute on function
  public.ausencia_en(uuid, date),
  public.config_bool(text, boolean)
from authenticated;

-- service_role (dashboard y funciones del servidor) conserva acceso a todo.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all functions in schema public to service_role;
  end if;
end;
$$;

-- Las funciones de migraciones futuras tampoco quedan abiertas por defecto.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- El directorio no aplica RLS (es su propósito), así que solo para usuarios con sesión.
revoke all on public.empleados_directorio from public, anon;
grant select on public.empleados_directorio to authenticated;
