/* ─── Ajustes al rol y reasignaciones, con motivo ───────────
   Contextualización, secciones 3.2, 4.2, 6, 8 y 11:
   - El rol pasa por borrador → en revisión → publicado → modificado → cerrado.
   - Proponer no es publicar: capitán/supervisor envían a revisión;
     gerente/admin aprueban y publican.
   - Todo cambio a un rol publicado exige motivo y queda registrado.
   - Supervisor/capitán/gerente pueden transferir una mesa ocupada a otro
     mesero sin moverla; cada cambio de responsable queda registrado.
   ──────────────────────────────────────────────────────────── */

/* ─── Estados del rol ─────────────────────────────────────── */

alter table public.roles_diarios drop constraint roles_diarios_estado_check;
alter table public.roles_diarios add constraint roles_diarios_estado_check
  check (estado in ('borrador','en_revision','publicado','modificado','cerrado'));

alter table public.roles_diarios
  add column enviado_revision_por uuid references auth.users(id) on delete set null,
  add column enviado_revision_at  timestamptz;

-- SUPUESTO: al reasignar una mesa, los comensales cuentan para quien la cierra.
-- El historial permite recalcular si el cliente elige otra regla.
insert into public.configuracion (clave, valor, descripcion) values
  ('reasignacion_conteo', '"quien_cierra"',
   'A quién se cuentan los comensales de una mesa reasignada: quien_cierra (pendiente de aprobar por el cliente).');

/* ─── Historiales ─────────────────────────────────────────── */

create table public.rol_ajustes (
  id              bigint generated always as identity primary key,
  rol_id          uuid not null references public.roles_diarios(id) on delete cascade,
  asignacion_id   uuid,               -- sin FK: la asignación puede haberse borrado
  accion          text not null check (accion in ('alta','cambio','baja')),
  antes           jsonb,
  despues         jsonb,
  motivo          text not null check (length(trim(motivo)) > 0),
  usuario_id      uuid default auth.uid(),
  usuario_nombre  text,               -- copia: quien consulta puede no tener acceso a usuarios
  created_at      timestamptz not null default now()
);

create index rol_ajustes_rol on public.rol_ajustes (rol_id, created_at);

create table public.visita_reasignaciones (
  id               bigint generated always as identity primary key,
  visita_id        uuid not null references public.visitas(id) on delete cascade,
  tipo             text not null check (tipo in ('reasignacion','cambio_mesa')),
  mesero_anterior  uuid references public.empleados(id),
  mesero_nuevo     uuid references public.empleados(id),
  mesa_anterior    uuid references public.mesas(id),
  mesa_nueva       uuid references public.mesas(id),
  motivo           text not null check (length(trim(motivo)) > 0),
  usuario_id       uuid default auth.uid(),
  usuario_nombre   text,
  created_at       timestamptz not null default now()
);

create index visita_reasignaciones_visita on public.visita_reasignaciones (visita_id);

create function public.nombre_usuario_actual()
returns text
language sql stable security definer set search_path = public
as $$
  select nombre from usuarios where id = auth.uid()
$$;

/* ─── Validación del rol (reemplaza la versión anterior) ──── */

create or replace function public.validar_rol_asignacion()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_rol      roles_diarios%rowtype;
  v_ausencia text;
  v_motivo   text;
begin
  select * into v_rol from roles_diarios
  where id = case when tg_op = 'DELETE' then old.rol_id else new.rol_id end;

  if v_rol.estado = 'cerrado' then
    raise exception 'El rol del % ya está cerrado', v_rol.fecha
      using errcode = 'check_violation';
  end if;
  if v_rol.estado = 'en_revision' then
    raise exception 'El rol está en revisión; regrésalo a borrador para cambiarlo'
      using errcode = 'check_violation';
  end if;

  if tg_op <> 'DELETE' then
    if not exists (select 1 from empleados where id = new.empleado_id and activo) then
      raise exception 'El empleado no está activo' using errcode = 'check_violation';
    end if;

    v_ausencia := ausencia_en(new.empleado_id, v_rol.fecha);
    if v_ausencia is not null and config_bool('ausencias_bloquean', true) then
      raise exception 'El empleado tiene una ausencia aprobada (%) el %', v_ausencia, v_rol.fecha
        using errcode = 'check_violation';
    end if;

    if config_bool('exigir_horario_en_rol', false) and not exists (
      select 1 from horarios
      where empleado_id = new.empleado_id and fecha = v_rol.fecha
        and turno_id = v_rol.turno_id and not es_descanso
    ) then
      raise exception 'El empleado no tiene horario en ese turno' using errcode = 'check_violation';
    end if;

    -- El área de un mesero siempre es la de su estación.
    if new.funcion = 'mesero' then
      select area_id into new.area_id from estaciones where id = new.estacion_id;
    end if;
  end if;

  -- Con el rol publicado, cada cambio lleva motivo (lo pone rol_ajustar) y queda registrado.
  if v_rol.estado in ('publicado','modificado') then
    v_motivo := nullif(trim(current_setting('app.motivo_ajuste', true)), '');
    if v_motivo is null then
      raise exception 'El rol ya está publicado: indica el motivo del cambio'
        using errcode = 'check_violation';
    end if;

    insert into rol_ajustes (rol_id, asignacion_id, accion, antes, despues, motivo, usuario_nombre)
    values (v_rol.id,
            case when tg_op = 'DELETE' then old.id else new.id end,
            case tg_op when 'INSERT' then 'alta' when 'UPDATE' then 'cambio' else 'baja' end,
            case when tg_op <> 'INSERT' then to_jsonb(old) end,
            case when tg_op <> 'DELETE' then to_jsonb(new) end,
            v_motivo,
            nombre_usuario_actual());

    update roles_diarios set estado = 'modificado' where id = v_rol.id and estado = 'publicado';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

/* Ajuste a un rol publicado: alta, cambio o baja de una asignación, con motivo.
   p_datos para 'alta': rol_id, empleado_id, funcion, area_id, estacion_id, es_cierre.
   p_datos para 'cambio': empleado_id y/o es_cierre. */
create function public.rol_ajustar(p_operacion text, p_asignacion_id uuid, p_datos jsonb, p_motivo text)
returns void
language plpgsql set search_path = public
as $$
begin
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indica el motivo del cambio' using errcode = 'check_violation';
  end if;
  perform set_config('app.motivo_ajuste', p_motivo, true);

  if p_operacion = 'alta' then
    insert into rol_asignaciones (rol_id, empleado_id, funcion, area_id, estacion_id, es_cierre)
    values ((p_datos->>'rol_id')::uuid, (p_datos->>'empleado_id')::uuid, p_datos->>'funcion',
            (p_datos->>'area_id')::uuid, (p_datos->>'estacion_id')::uuid,
            coalesce((p_datos->>'es_cierre')::boolean, false));
  elsif p_operacion = 'cambio' then
    update rol_asignaciones
       set empleado_id = coalesce((p_datos->>'empleado_id')::uuid, empleado_id),
           es_cierre   = coalesce((p_datos->>'es_cierre')::boolean, es_cierre)
     where id = p_asignacion_id;
    if not found then
      raise exception 'Asignación no encontrada' using errcode = 'no_data_found';
    end if;
  elsif p_operacion = 'baja' then
    delete from rol_asignaciones where id = p_asignacion_id;
    if not found then
      raise exception 'Asignación no encontrada' using errcode = 'no_data_found';
    end if;
  else
    raise exception 'Operación no válida: %', p_operacion using errcode = 'invalid_parameter_value';
  end if;

  perform set_config('app.motivo_ajuste', '', true);
end;
$$;

/* ─── Flujo de estados ────────────────────────────────────── */

create function public.enviar_rol_a_revision(p_rol_id uuid)
returns public.roles_diarios
language plpgsql set search_path = public
as $$
declare
  v_rol roles_diarios%rowtype;
begin
  if not exists (select 1 from rol_asignaciones where rol_id = p_rol_id and funcion = 'mesero') then
    raise exception 'El rol no tiene meseros asignados' using errcode = 'check_violation';
  end if;
  update roles_diarios
     set estado = 'en_revision', enviado_revision_por = auth.uid(), enviado_revision_at = now()
   where id = p_rol_id and estado = 'borrador'
  returning * into v_rol;
  if not found then
    raise exception 'Solo se envía a revisión un rol en borrador' using errcode = 'check_violation';
  end if;
  return v_rol;
end;
$$;

-- Aprobar y publicar es de gerencia. Sin sesión (SQL Editor, service_role) también se permite.
create or replace function public.publicar_rol(p_rol_id uuid)
returns public.roles_diarios
language plpgsql set search_path = public
as $$
declare
  v_rol roles_diarios%rowtype;
begin
  if auth.uid() is not null and not tiene_rol('admin', 'gerente') then
    raise exception 'Solo gerencia puede aprobar y publicar el rol' using errcode = 'insufficient_privilege';
  end if;

  select * into v_rol from roles_diarios where id = p_rol_id for update;
  if not found then
    raise exception 'Rol no encontrado' using errcode = 'no_data_found';
  end if;
  if v_rol.estado not in ('borrador','en_revision') then
    raise exception 'Solo se publica un rol en borrador o en revisión (estado actual: %)', v_rol.estado
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from rol_asignaciones where rol_id = p_rol_id and funcion = 'mesero') then
    raise exception 'El rol no tiene meseros asignados' using errcode = 'check_violation';
  end if;

  update roles_diarios
     set estado = 'publicado', publicado_por = auth.uid(), publicado_at = now()
   where id = p_rol_id
  returning * into v_rol;
  return v_rol;
end;
$$;

create function public.regresar_rol_a_borrador(p_rol_id uuid)
returns public.roles_diarios
language plpgsql set search_path = public
as $$
declare
  v_rol roles_diarios%rowtype;
begin
  if auth.uid() is not null and not tiene_rol('admin', 'gerente') then
    raise exception 'Solo gerencia puede regresar el rol a borrador' using errcode = 'insufficient_privilege';
  end if;
  update roles_diarios set estado = 'borrador'
   where id = p_rol_id and estado = 'en_revision'
  returning * into v_rol;
  if not found then
    raise exception 'Solo se regresa a borrador un rol en revisión' using errcode = 'check_violation';
  end if;
  return v_rol;
end;
$$;

create or replace function public.cerrar_rol(p_rol_id uuid)
returns public.roles_diarios
language plpgsql set search_path = public
as $$
declare
  v_rol roles_diarios%rowtype;
begin
  update roles_diarios set estado = 'cerrado'
   where id = p_rol_id and estado in ('publicado','modificado')
  returning * into v_rol;
  if not found then
    raise exception 'Solo se puede cerrar un rol publicado' using errcode = 'check_violation';
  end if;
  return v_rol;
end;
$$;

/* Las funciones de arriba son el camino normal, pero quien arma el rol puede
   actualizar roles_diarios por la API; este trigger impide saltarse el flujo
   (por ejemplo, que un capitán se publique su propio rol). Sin sesión
   (SQL Editor, seed) no se restringe. */
create function public.validar_estado_rol()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.estado <> 'borrador' then
      raise exception 'Un rol nuevo empieza en borrador' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.estado = old.estado then
    return new;
  end if;

  if (old.estado, new.estado) not in (
       ('borrador','en_revision'), ('borrador','publicado'),
       ('en_revision','borrador'), ('en_revision','publicado'),
       ('publicado','modificado'), ('publicado','cerrado'), ('modificado','cerrado')) then
    raise exception 'No se puede pasar el rol de % a %', old.estado, new.estado
      using errcode = 'check_violation';
  end if;

  if (new.estado = 'publicado' or (old.estado = 'en_revision' and new.estado = 'borrador'))
     and not tiene_rol('admin', 'gerente') then
    raise exception 'Solo gerencia puede aprobar, publicar o regresar el rol a borrador'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger roles_diarios_validar_estado
  before insert or update on public.roles_diarios
  for each row execute function public.validar_estado_rol();

/* ─── Visitas (reemplaza la versión anterior) ─────────────── */

create or replace function public.asignar_mesa_visita()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_estado_rol     text;
  v_mesero_previo  uuid;
begin
  if tg_op = 'UPDATE' and new.estado = 'cerrada' and old.estado <> 'cerrada' then
    new.hora_salida := coalesce(new.hora_salida, now());
  end if;

  if tg_op = 'UPDATE'
     and new.mesa_id is not distinct from old.mesa_id
     and new.rol_id = old.rol_id then
    -- Cambiar al responsable sin mover la mesa solo por reasignar_visita (deja registro).
    if new.mesero_id is distinct from old.mesero_id
       and current_setting('app.reasignacion', true) is distinct from 'on' then
      raise exception 'Para cambiar al mesero responsable usa la reasignación con motivo'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.mesa_id is null then
    new.estacion_id := null;
    new.area_id     := null;
    new.mesero_id   := null;
    new.capitan_id  := null;
    return new;
  end if;

  select estado into v_estado_rol from roles_diarios where id = new.rol_id;
  if v_estado_rol is null or v_estado_rol not in ('publicado','modificado') then
    raise exception 'Solo se asignan mesas en un rol publicado' using errcode = 'check_violation';
  end if;

  v_mesero_previo := case when tg_op = 'UPDATE' then old.mesero_id end;

  select m.estacion_id, e.area_id
    into new.estacion_id, new.area_id
  from mesas m
  join estaciones e on e.id = m.estacion_id
  where m.id = new.mesa_id and m.activo;
  if not found then
    raise exception 'La mesa no existe o está inactiva' using errcode = 'check_violation';
  end if;

  select empleado_id into new.mesero_id
  from rol_asignaciones
  where rol_id = new.rol_id and funcion = 'mesero' and estacion_id = new.estacion_id;
  if new.mesero_id is null then
    raise exception 'La estación de esa mesa no tiene mesero en el rol' using errcode = 'check_violation';
  end if;

  select empleado_id into new.capitan_id
  from rol_asignaciones
  where rol_id = new.rol_id and funcion = 'capitan' and area_id = new.area_id;

  -- Mover a una mesa de otro mesero también cambia al responsable: queda registrado.
  if tg_op = 'UPDATE' and old.mesa_id is not null and v_mesero_previo is distinct from new.mesero_id then
    insert into visita_reasignaciones
      (visita_id, tipo, mesero_anterior, mesero_nuevo, mesa_anterior, mesa_nueva, motivo, usuario_nombre)
    values (new.id, 'cambio_mesa', v_mesero_previo, new.mesero_id, old.mesa_id, new.mesa_id,
            'Cambio de mesa', nombre_usuario_actual());
  end if;

  if new.estado = 'espera' then
    new.estado := 'sentada';
  end if;
  new.hora_sentada := coalesce(new.hora_sentada, now());
  if new.estado = 'cerrada' then
    new.hora_salida := coalesce(new.hora_salida, now());
  end if;

  return new;
end;
$$;

-- Transferir una mesa ocupada a otro mesero del mismo rol, sin moverla.
create function public.reasignar_visita(p_visita_id uuid, p_mesero_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v visitas%rowtype;
begin
  if auth.uid() is not null and not tiene_rol('admin', 'gerente', 'capitan', 'supervisor') then
    raise exception 'No tienes permiso para reasignar mesas' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indica el motivo de la reasignación' using errcode = 'check_violation';
  end if;

  select * into v from visitas where id = p_visita_id for update;
  if not found then
    raise exception 'Visita no encontrada' using errcode = 'no_data_found';
  end if;
  if v.estado <> 'sentada' then
    raise exception 'Solo se reasigna una mesa ocupada' using errcode = 'check_violation';
  end if;
  if p_mesero_id = v.mesero_id then
    raise exception 'Ese mesero ya es el responsable de la mesa' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from rol_asignaciones
                  where rol_id = v.rol_id and empleado_id = p_mesero_id and funcion = 'mesero') then
    raise exception 'Ese mesero no está en el rol de este turno' using errcode = 'check_violation';
  end if;

  insert into visita_reasignaciones
    (visita_id, tipo, mesero_anterior, mesero_nuevo, mesa_anterior, mesa_nueva, motivo, usuario_nombre)
  values (v.id, 'reasignacion', v.mesero_id, p_mesero_id, v.mesa_id, v.mesa_id, p_motivo, nombre_usuario_actual());

  perform set_config('app.reasignacion', 'on', true);
  update visitas set mesero_id = p_mesero_id where id = v.id;
  perform set_config('app.reasignacion', '', true);
end;
$$;

/* ─── Seguridad ───────────────────────────────────────────── */

alter table public.rol_ajustes enable row level security;
alter table public.visita_reasignaciones enable row level security;

-- Solo lectura para quien coordina; los registros los escriben los triggers y funciones.
create policy rol_ajustes_leer on public.rol_ajustes for select to authenticated
  using (public.tiene_rol('admin','gerente','capitan','supervisor'));
create policy visita_reasignaciones_leer on public.visita_reasignaciones for select to authenticated
  using (public.tiene_rol('admin','gerente','capitan','supervisor'));

-- Un rol en revisión, igual que en borrador, solo lo ven quienes lo arman.
drop policy roles_diarios_leer on public.roles_diarios;
create policy roles_diarios_leer on public.roles_diarios for select to authenticated
  using (estado not in ('borrador','en_revision')
         or public.tiene_rol('admin','gerente','capitan','supervisor'));

revoke execute on function
  public.nombre_usuario_actual(),
  public.rol_ajustar(text, uuid, jsonb, text),
  public.enviar_rol_a_revision(uuid),
  public.regresar_rol_a_borrador(uuid),
  public.reasignar_visita(uuid, uuid, text)
from public, anon;

grant execute on function
  public.rol_ajustar(text, uuid, jsonb, text),
  public.enviar_rol_a_revision(uuid),
  public.regresar_rol_a_borrador(uuid),
  public.reasignar_visita(uuid, uuid, text)
to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all functions in schema public to service_role;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.visita_reasignaciones;
  end if;
end;
$$;
