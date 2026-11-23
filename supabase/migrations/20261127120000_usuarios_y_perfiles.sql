/* ─── Usuarios, perfiles y permisos ─────────────────────────
   Contextualización, sección 3.2:
   - Nuevo perfil "analista": consulta indicadores generales sin
     modificar nada ni ver datos personales o desempeño individual.
   - Alta de usuarios desde la app: gerencia registra la invitación
     (correo, nombre, perfil, empleado) y el perfil se crea solo cuando
     esa persona tiene cuenta (creada en Supabase → Authentication, o
     si ya existía). La contraseña nunca pasa por la app.
   - Bajas: se desactiva (no se borra) para conservar la trazabilidad.
   - Nadie cambia su propio perfil ni se desactiva a sí mismo; un
     gerente no crea ni modifica administradores.
   SUPUESTO: los nombres de perfil se conservan (capitán, hostess); el
   documento propone "Supervisor de turno" y "Recepción" (pendiente).
   ──────────────────────────────────────────────────────────── */

alter table public.usuarios drop constraint usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check
  check (rol in ('admin','gerente','supervisor','mesero','capitan','hostess','runner','rrhh','analista'));

/* ─── Invitaciones ────────────────────────────────────────── */

create table public.invitaciones (
  email        text primary key check (email = lower(trim(email)) and email like '%_@_%'),
  nombre       text not null,
  rol          text not null check (rol in ('admin','gerente','supervisor','mesero','capitan','hostess','runner','rrhh','analista')),
  empleado_id  uuid references public.empleados(id) on delete set null,
  creado_por   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  usada_at     timestamptz
);

alter table public.invitaciones enable row level security;
create policy invitaciones_leer on public.invitaciones for select to authenticated
  using (public.tiene_rol('admin','gerente'));

-- Crea el perfil de una cuenta a partir de su invitación (interna).
create function public.aplicar_invitacion(p_user_id uuid, p_email text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  i invitaciones%rowtype;
begin
  select * into i from invitaciones where email = lower(trim(p_email)) and usada_at is null;
  if not found or exists (select 1 from usuarios where id = p_user_id) then
    return false;
  end if;
  insert into usuarios (id, nombre, email, rol, empleado_id)
  values (p_user_id, i.nombre, i.email, i.rol, i.empleado_id);
  update invitaciones set usada_at = now() where email = i.email;
  return true;
end;
$$;

-- Cuando se crea la cuenta (dashboard o registro), el perfil se liga solo.
create function public.perfil_desde_invitacion()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform aplicar_invitacion(new.id, new.email);
  return new;
end;
$$;

create trigger usuarios_desde_invitacion
  after insert on auth.users
  for each row execute function public.perfil_desde_invitacion();

create function public.invitar_usuario(p_email text, p_nombre text, p_rol text, p_empleado_id uuid default null)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_uid   uuid;
begin
  if auth.uid() is not null and not tiene_rol('admin', 'gerente') then
    raise exception 'No tienes permiso para dar de alta usuarios' using errcode = 'insufficient_privilege';
  end if;
  if auth.uid() is not null and p_rol = 'admin' and not tiene_rol('admin') then
    raise exception 'Solo un administrador puede crear otro administrador' using errcode = 'insufficient_privilege';
  end if;
  if v_email not like '%_@_%' then
    raise exception 'El correo no es válido' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Indica el nombre' using errcode = 'check_violation';
  end if;
  if exists (select 1 from usuarios where lower(email) = v_email) then
    raise exception 'Ya existe un usuario con ese correo' using errcode = 'unique_violation';
  end if;
  if p_empleado_id is not null and exists (select 1 from usuarios where empleado_id = p_empleado_id) then
    raise exception 'Ese empleado ya tiene un usuario' using errcode = 'unique_violation';
  end if;

  insert into invitaciones (email, nombre, rol, empleado_id)
  values (v_email, trim(p_nombre), p_rol, p_empleado_id)
  on conflict (email) do update
    set nombre = excluded.nombre, rol = excluded.rol, empleado_id = excluded.empleado_id,
        creado_por = auth.uid(), created_at = now(), usada_at = null;

  -- Si la cuenta ya existe en Authentication, el perfil se crea de una vez.
  select id into v_uid from auth.users where lower(email) = v_email;
  if v_uid is not null and aplicar_invitacion(v_uid, v_email) then
    return 'perfil_creado';
  end if;
  return 'invitacion';
end;
$$;

create function public.cancelar_invitacion(p_email text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not tiene_rol('admin', 'gerente') then
    raise exception 'No tienes permiso' using errcode = 'insufficient_privilege';
  end if;
  delete from invitaciones where email = lower(trim(p_email)) and usada_at is null;
end;
$$;

/* ─── Protección de usuarios ──────────────────────────────── */

create function public.proteger_usuarios()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Los usuarios no se borran: desactívalos para conservar su historial'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if new.rol = 'admin' and not tiene_rol('admin') then
      raise exception 'Solo un administrador puede crear otro administrador' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if old.id = auth.uid() and (new.rol is distinct from old.rol or new.activo is distinct from old.activo) then
    raise exception 'No puedes cambiar tu propio perfil ni desactivarte' using errcode = 'check_violation';
  end if;
  if not tiene_rol('admin') and (old.rol = 'admin' or new.rol = 'admin') then
    raise exception 'Solo un administrador puede modificar administradores' using errcode = 'insufficient_privilege';
  end if;
  if new.id <> old.id or lower(new.email) <> lower(old.email) then
    raise exception 'El correo y la cuenta no se cambian aquí' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger usuarios_proteger
  before insert or update or delete on public.usuarios
  for each row execute function public.proteger_usuarios();

create trigger invitaciones_auditoria after insert or update or delete on public.invitaciones
  for each row execute function public.registrar_auditoria();

/* ─── Indicadores: el analista ve los generales ───────────── */

create or replace function public.indicadores(p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_todo  boolean := tiene_rol('admin', 'gerente', 'capitan', 'supervisor', 'analista');
  v_analista boolean := rol_actual() = 'analista';
  v_yo    uuid := mi_empleado_id();
  v_res   jsonb;
begin
  if p_hasta < p_desde or p_hasta - p_desde > 366 then
    raise exception 'El periodo debe ser de un año como máximo' using errcode = 'invalid_parameter_value';
  end if;
  if not v_todo and (v_yo is null or not tiene_rol('mesero')) then
    raise exception 'No tienes permiso para consultar indicadores' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'alcance', case when v_todo then 'todo' else 'propio' end,
    'resumen', (select jsonb_build_object(
        'comensales',      coalesce(sum(comensales), 0),
        'visitas',         count(*),
        'adultos',         coalesce(sum(adultos), 0),
        'ninos',           coalesce(sum(ninos), 0),
        'espera_min',      round(avg(extract(epoch from hora_sentada - hora_llegada) / 60)
                                   filter (where hora_sentada > hora_llegada + interval '1 minute'), 1),
        'estancia_min',    round(avg(extract(epoch from hora_salida - hora_sentada) / 60)
                                   filter (where hora_salida is not null), 1))
       from ind_visitas(p_desde, p_hasta, v_todo, v_yo)),
    'por_dia', (select coalesce(jsonb_agg(x order by x.fecha), '[]') from (
        select r.fecha, sum(i.comensales) as comensales, count(*) as visitas
        from ind_visitas(p_desde, p_hasta, v_todo, v_yo) i join roles_diarios r on r.id = i.rol_id
        group by r.fecha) x),
    'por_turno', (select coalesce(jsonb_agg(x order by x.comensales desc), '[]') from (
        select t.nombre as turno, sum(i.comensales) as comensales, count(*) as visitas,
               count(distinct r.id) as roles
        from ind_visitas(p_desde, p_hasta, v_todo, v_yo) i join roles_diarios r on r.id = i.rol_id join turnos t on t.id = r.turno_id
        group by t.nombre) x)
  ) into v_res;

  if not v_todo then
    return v_res;
  end if;

  -- Solo gerencia, capitán y supervisor: comparativos, satisfacción y operación del rol.
  v_res := v_res || jsonb_build_object(
    'por_area', (select coalesce(jsonb_agg(x order by x.comensales desc), '[]') from (
        select a.nombre as area, sum(i.comensales) as comensales, count(*) as visitas,
               (select round(avg(c.promedio), 2) from v_encuestas_contexto c
                 where c.area_id = a.id and c.fecha between p_desde and p_hasta) as satisfaccion
        from ind_visitas(p_desde, p_hasta, v_todo, v_yo) i join areas a on a.id = i.area_id
        group by a.id, a.nombre) x),
    'por_estacion', (select coalesce(jsonb_agg(x order by x.comensales desc), '[]') from (
        select e.nombre as estacion, a.nombre as area, sum(i.comensales) as comensales, count(*) as visitas
        from ind_visitas(p_desde, p_hasta, v_todo, v_yo) i join estaciones e on e.id = i.estacion_id join areas a on a.id = e.area_id
        group by e.nombre, a.nombre) x),
    'por_mesero', (select coalesce(jsonb_agg(x order by x.comensales desc), '[]') from (
        select em.id as empleado_id, trim(em.nombre || ' ' || coalesce(em.apellidos, '')) as mesero,
               coalesce(sum(i.comensales), 0) as comensales, count(i.id) as visitas, t.turnos,
               round(coalesce(sum(i.comensales), 0) / nullif(t.turnos, 0), 1) as comensales_por_turno,
               (select round(avg(c.promedio), 2) from v_encuestas_contexto c
                 where c.mesero_id = em.id and c.fecha between p_desde and p_hasta) as satisfaccion,
               (select count(*) from visita_reasignaciones vr join visitas v2 on v2.id = vr.visita_id
                  join roles_diarios r2 on r2.id = v2.rol_id
                 where vr.mesero_nuevo = em.id and r2.fecha between p_desde and p_hasta) as mesas_recibidas
        from (select ra.empleado_id, count(distinct ra.rol_id) as turnos
                from rol_asignaciones ra join roles_diarios r on r.id = ra.rol_id
               where ra.funcion = 'mesero' and r.fecha between p_desde and p_hasta
                 and r.estado in ('publicado','modificado','cerrado')
               group by ra.empleado_id) t
        join empleados em on em.id = t.empleado_id
        left join ind_visitas(p_desde, p_hasta, v_todo, v_yo) i on i.mesero_id = em.id
        group by em.id, em.nombre, em.apellidos, t.turnos) x),
    'satisfaccion', (select jsonb_build_object(
        'encuestas', count(*),
        'promedio',  round(avg(promedio), 2),
        'bajas',     count(*) filter (where promedio < 3))
       from v_encuestas_contexto where fecha between p_desde and p_hasta),
    'rol', (select jsonb_build_object(
        'publicados',  count(*) filter (where r.estado in ('publicado','modificado','cerrado')),
        'modificados', count(*) filter (where exists (select 1 from rol_ajustes aj where aj.rol_id = r.id)),
        'ajustes',     (select count(*) from rol_ajustes aj join roles_diarios r2 on r2.id = aj.rol_id
                         where r2.fecha between p_desde and p_hasta),
        'excepciones', (select count(*) from rol_excepciones x join roles_diarios r2 on r2.id = x.rol_id
                         where r2.fecha between p_desde and p_hasta),
        'reasignaciones', (select count(*) filter (where vr.tipo = 'reasignacion')
                             from visita_reasignaciones vr join visitas v2 on v2.id = vr.visita_id
                             join roles_diarios r2 on r2.id = v2.rol_id
                            where r2.fecha between p_desde and p_hasta),
        'cambios_mesa',   (select count(*) filter (where vr.tipo = 'cambio_mesa')
                             from visita_reasignaciones vr join visitas v2 on v2.id = vr.visita_id
                             join roles_diarios r2 on r2.id = v2.rol_id
                            where r2.fecha between p_desde and p_hasta))
       from roles_diarios r where r.fecha between p_desde and p_hasta),
    -- Días-persona de ausencia aprobada dentro del periodo, por tipo.
    'ausencias', (select coalesce(jsonb_agg(x order by x.dias desc), '[]') from (
        select a.tipo, sum(least(a.fecha_fin, p_hasta) - greatest(a.fecha_inicio, p_desde) + 1) as dias,
               count(distinct a.empleado_id) as personas
        from ausencias a
        where a.estado = 'aprobada' and a.fecha_inicio <= p_hasta and a.fecha_fin >= p_desde
        group by a.tipo) x)
  );

  -- El analista consulta indicadores generales, sin desempeño individual.
  if v_analista then
    v_res := (v_res - 'por_mesero') || jsonb_build_object('alcance', 'general');
  end if;
  return v_res;
end;
$$;

revoke execute on function
  public.aplicar_invitacion(uuid, text),
  public.perfil_desde_invitacion(),
  public.invitar_usuario(text, text, text, uuid),
  public.cancelar_invitacion(text),
  public.proteger_usuarios()
from public, anon;
revoke execute on function public.aplicar_invitacion(uuid, text), public.perfil_desde_invitacion() from authenticated;

grant execute on function
  public.invitar_usuario(text, text, text, uuid),
  public.cancelar_invitacion(text)
to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all functions in schema public to service_role;
  end if;
  -- Supabase Auth inserta en auth.users con su propio rol: debe poder correr el trigger.
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.perfil_desde_invitacion(), public.aplicar_invitacion(uuid, text)
      to supabase_auth_admin;
  end if;
end;
$$;
