/* ─── Disponibilidad del personal y estados operativos ──────
   Contextualización, secciones 3.1, 4.1 y 5:
   - Estado del empleado: activo, inactivo, suspendido o pendiente de alta.
   - Áreas o estaciones en las que puede trabajar cada empleado.
   - Restricciones temporales o permanentes (solo un turno, no cierre,
     no cierta área, día de descanso, en capacitación...).
   - El rol detecta conflictos; las restricciones advierten y, para
     asignar de todos modos, se pide un motivo que queda registrado.
   - Estado operativo de cada mesa (disponible, reservada, en limpieza,
     fuera de servicio, cerrada); "ocupada" se calcula con las visitas.
   ──────────────────────────────────────────────────────────── */

/* ─── Estado del empleado ─────────────────────────────────── */

alter table public.empleados
  add column estado text not null default 'activo'
  check (estado in ('activo','inactivo','suspendido','pendiente_alta'));

update public.empleados set estado = 'inactivo' where not activo;

-- `activo` se conserva (lo usan las pantallas y reglas existentes) y se
-- mantiene sincronizado: solo un empleado en estado "activo" entra al rol.
create function public.sincronizar_estado_empleado()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.estado = 'activo' and not new.activo then
      new.estado := 'inactivo';
    end if;
  elsif new.estado is distinct from old.estado then
    null;  -- manda el estado
  elsif new.activo is distinct from old.activo then
    new.estado := case when new.activo then 'activo' else 'inactivo' end;
  end if;
  new.activo := new.estado = 'activo';
  return new;
end;
$$;

create trigger empleados_sincronizar_estado
  before insert or update on public.empleados
  for each row execute function public.sincronizar_estado_empleado();

/* ─── Dónde puede trabajar cada empleado ──────────────────── */

-- Sin registros, el empleado puede trabajar en cualquier área o estación.
-- Autorizar un área cubre todas sus estaciones.
create table public.empleado_autorizaciones (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  area_id      uuid references public.areas(id) on delete cascade,
  estacion_id  uuid references public.estaciones(id) on delete cascade,
  created_at   timestamptz not null default now(),
  check ((area_id is null) <> (estacion_id is null))
);

create unique index empleado_autorizaciones_area
  on public.empleado_autorizaciones (empleado_id, area_id) where area_id is not null;
create unique index empleado_autorizaciones_estacion
  on public.empleado_autorizaciones (empleado_id, estacion_id) where estacion_id is not null;

/* ─── Restricciones ───────────────────────────────────────── */

-- Sin fechas es permanente; con fechas aplica solo en ese periodo.
-- SUPUESTO: las reglas exactas no están aprobadas; por eso advierten y no bloquean.
create table public.empleado_restricciones (
  id            uuid primary key default gen_random_uuid(),
  empleado_id   uuid not null references public.empleados(id) on delete cascade,
  tipo          text not null check (tipo in
                  ('solo_turno','no_turno','no_cierre','no_area','dia_descanso','capacitacion','otra')),
  turno_id      uuid references public.turnos(id) on delete cascade,
  area_id       uuid references public.areas(id) on delete cascade,
  dia_semana    int check (dia_semana between 1 and 7),   -- 1 = lunes … 7 = domingo
  fecha_inicio  date,
  fecha_fin     date,
  descripcion   text,
  creado_por    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio),
  check (tipo not in ('solo_turno','no_turno') or turno_id is not null),
  check (tipo <> 'no_area' or area_id is not null),
  check (tipo <> 'dia_descanso' or dia_semana is not null),
  check (tipo <> 'otra' or length(trim(coalesce(descripcion, ''))) > 0)
);

create index empleado_restricciones_empleado on public.empleado_restricciones (empleado_id);

-- Asignaciones hechas a pesar de una advertencia, con su motivo.
create table public.rol_excepciones (
  id              bigint generated always as identity primary key,
  rol_id          uuid not null references public.roles_diarios(id) on delete cascade,
  asignacion_id   uuid,
  empleado_id     uuid references public.empleados(id) on delete set null,
  advertencias    text[] not null,
  motivo          text not null check (length(trim(motivo)) > 0),
  usuario_id      uuid default auth.uid(),
  usuario_nombre  text,
  created_at      timestamptz not null default now()
);

create index rol_excepciones_rol on public.rol_excepciones (rol_id, created_at);

insert into public.configuracion (clave, valor, descripcion) values
  -- SUPUESTO: la operación espera al menos un runner por turno (solo advierte).
  ('exigir_runner', 'true',
   'Si es true, el rol advierte cuando el turno no tiene runner asignado.'),
  ('max_mesas_por_mesero', 'null',
   'Número máximo de mesas por mesero; el rol advierte si una estación lo supera. null = sin límite.'),
  -- SUPUESTO: al cerrar una visita la mesa queda disponible (como hasta ahora).
  ('limpieza_al_cerrar', 'false',
   'Si es true, al cerrar una visita la mesa pasa a "en limpieza" hasta que la hostess la libere.');

/* ─── Advertencias de una asignación ──────────────────────── */

-- Lista de advertencias (texto) por restricciones y autorizaciones.
-- La usan el trigger del rol y conflictos_rol(); no es para la app directa.
create function public.advertencias_asignacion(
  p_empleado uuid, p_fecha date, p_turno uuid, p_funcion text,
  p_area uuid, p_estacion uuid, p_es_cierre boolean)
returns text[]
language plpgsql stable security definer set search_path = public
as $$
declare
  v_area    uuid := p_area;
  v_avisos  text[] := '{}';
  r         record;
  v_dias    text[] := array['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
begin
  if p_estacion is not null then
    select area_id into v_area from estaciones where id = p_estacion;
  end if;

  -- Autorizaciones (la hostess no trabaja por área).
  if p_funcion <> 'hostess' and v_area is not null
     and exists (select 1 from empleado_autorizaciones where empleado_id = p_empleado) then
    if p_estacion is not null then
      if not exists (select 1 from empleado_autorizaciones
                      where empleado_id = p_empleado
                        and (estacion_id = p_estacion or area_id = v_area)) then
        v_avisos := v_avisos || format('no está autorizado para la estación %s',
                                       (select nombre from estaciones where id = p_estacion));
      end if;
    elsif not exists (select 1 from empleado_autorizaciones a
                       left join estaciones e on e.id = a.estacion_id
                       where a.empleado_id = p_empleado
                         and (a.area_id = v_area or e.area_id = v_area)) then
      v_avisos := v_avisos || format('no está autorizado para el área %s',
                                     (select nombre from areas where id = v_area));
    end if;
  end if;

  for r in
    select x.*, t.nombre as turno, a.nombre as area
    from empleado_restricciones x
    left join turnos t on t.id = x.turno_id
    left join areas a on a.id = x.area_id
    where x.empleado_id = p_empleado
      and p_fecha between coalesce(x.fecha_inicio, p_fecha) and coalesce(x.fecha_fin, p_fecha)
  loop
    if r.tipo = 'solo_turno' and r.turno_id <> p_turno then
      v_avisos := v_avisos || format('solo puede trabajar el turno %s', r.turno);
    elsif r.tipo = 'no_turno' and r.turno_id = p_turno then
      v_avisos := v_avisos || format('no puede trabajar el turno %s', r.turno);
    elsif r.tipo = 'no_cierre' and p_es_cierre then
      v_avisos := v_avisos || 'no puede cubrir cierre'::text;
    elsif r.tipo = 'no_area' and r.area_id = v_area then
      v_avisos := v_avisos || format('no puede asignarse a %s', r.area);
    elsif r.tipo = 'dia_descanso' and r.dia_semana = extract(isodow from p_fecha) then
      v_avisos := v_avisos || format('su día de descanso es el %s', v_dias[r.dia_semana]);
    elsif r.tipo = 'capacitacion' then
      v_avisos := v_avisos || 'está en capacitación: requiere asignación acompañada'::text;
    elsif r.tipo = 'otra' then
      v_avisos := v_avisos || r.descripcion;
    end if;
  end loop;

  return v_avisos;
end;
$$;

/* Cada alta o cambio en el rol revisa las restricciones. Si hay advertencias
   nuevas, se necesita un motivo; con motivo se permite y queda en rol_excepciones.
   El motivo llega con rol_ajustar() (sirve igual en borrador que en publicado).
   El error usa el código RA001 para que la app pida el motivo. */
create function public.validar_restricciones_rol()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_rol     roles_diarios%rowtype;
  v_avisos  text[];
  v_previos text[] := '{}';
  v_motivo  text;
begin
  select * into v_rol from roles_diarios where id = new.rol_id;

  v_avisos := advertencias_asignacion(new.empleado_id, v_rol.fecha, v_rol.turno_id, new.funcion,
                                      new.area_id, new.estacion_id, new.es_cierre);
  -- Al editar a la misma persona solo cuentan las advertencias que no tenía.
  if tg_op = 'UPDATE' and new.empleado_id = old.empleado_id then
    v_previos := advertencias_asignacion(old.empleado_id, v_rol.fecha, v_rol.turno_id, old.funcion,
                                         old.area_id, old.estacion_id, old.es_cierre);
  end if;
  select coalesce(array_agg(a), '{}') into v_avisos from unnest(v_avisos) a where a <> all (v_previos);

  if cardinality(v_avisos) = 0 then
    return new;
  end if;

  v_motivo := nullif(trim(current_setting('app.motivo_ajuste', true)), '');
  if v_motivo is null then
    raise exception 'Restricción: % %. Indica el motivo para asignarlo de todos modos.',
      (select trim(nombre || ' ' || coalesce(apellidos, '')) from empleados where id = new.empleado_id),
      array_to_string(v_avisos, '; ')
      using errcode = 'RA001';
  end if;

  insert into rol_excepciones (rol_id, asignacion_id, empleado_id, advertencias, motivo, usuario_nombre)
  values (new.rol_id, new.id, new.empleado_id, v_avisos, v_motivo, nombre_usuario_actual());
  return new;
end;
$$;

-- El nombre hace que corra después de rol_asignaciones_validar (orden alfabético),
-- así primero se revisan rol cerrado, ausencias y estado del empleado.
create trigger rol_asignaciones_validar_restricciones
  before insert or update on public.rol_asignaciones
  for each row execute function public.validar_restricciones_rol();

/* ─── Conflictos del rol ──────────────────────────────────── */

-- Todo lo que hay que revisar antes de publicar o durante el turno (sección 4.1).
create function public.conflictos_rol(p_rol_id uuid)
returns table (severidad text, tipo text, descripcion text, empleado_id uuid, asignacion_id uuid)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_rol      roles_diarios%rowtype;
  v_max      int;
begin
  if not tiene_rol('admin', 'gerente', 'rrhh', 'capitan', 'supervisor') then
    raise exception 'No tienes permiso para revisar los conflictos del rol'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_rol from roles_diarios where id = p_rol_id;
  if not found then
    return;
  end if;

  -- Por persona asignada: estado, ausencia, horario y restricciones.
  return query
  with a as (
    select ra.*, trim(e.nombre || ' ' || coalesce(e.apellidos, '')) as nombre, e.estado as estado_emp,
           ausencia_en(e.id, v_rol.fecha) as ausencia,
           h.turno_id as turno_horario, h.es_descanso
    from rol_asignaciones ra
    join empleados e on e.id = ra.empleado_id
    left join horarios h on h.empleado_id = e.id and h.fecha = v_rol.fecha
    where ra.rol_id = p_rol_id
  )
  select 'error', 'estado', format('%s está %s', a.nombre, replace(a.estado_emp, '_', ' de ')), a.empleado_id, a.id
    from a where a.estado_emp <> 'activo'
  union all
  select case when config_bool('ausencias_bloquean', true) then 'error' else 'advertencia' end,
         'ausencia', format('%s tiene %s ese día', a.nombre, a.ausencia), a.empleado_id, a.id
    from a where a.ausencia is not null
  union all
  select 'advertencia', 'horario',
         format('%s %s', a.nombre, case
           when a.es_descanso then 'tiene descanso ese día'
           when a.turno_horario is null then 'no tiene horario ese día'
           else 'tiene horario en otro turno' end),
         a.empleado_id, a.id
    from a where a.es_descanso or a.turno_horario is distinct from v_rol.turno_id
  union all
  select 'advertencia', 'restriccion', format('%s %s', a.nombre, aviso), a.empleado_id, a.id
    from a, unnest(advertencias_asignacion(a.empleado_id, v_rol.fecha, v_rol.turno_id, a.funcion,
                                           a.area_id, a.estacion_id, a.es_cierre)) as aviso;

  -- Estaciones activas sin mesero responsable.
  return query
  select 'advertencia', 'cobertura', format('La estación %s no tiene mesero responsable', s.nombre),
         null::uuid, null::uuid
  from estaciones s
  join areas ar on ar.id = s.area_id and ar.activo
  where s.activo
    and not exists (select 1 from rol_asignaciones ra
                     where ra.rol_id = p_rol_id and ra.funcion = 'mesero' and ra.estacion_id = s.id)
  order by s.nombre;

  if config_bool('exigir_runner', true)
     and not exists (select 1 from rol_asignaciones where rol_id = p_rol_id and funcion = 'runner') then
    return query select 'advertencia', 'cobertura', 'El turno no tiene runner asignado'::text, null::uuid, null::uuid;
  end if;

  select (valor #>> '{}')::int into v_max
  from configuracion where clave = 'max_mesas_por_mesero' and jsonb_typeof(valor) = 'number';
  if v_max is not null then
    return query
    select 'advertencia', 'carga',
           format('%s tiene %s mesas (máximo %s)', trim(e.nombre || ' ' || coalesce(e.apellidos, '')), count(m.id), v_max),
           ra.empleado_id, ra.id
    from rol_asignaciones ra
    join empleados e on e.id = ra.empleado_id
    join mesas m on m.estacion_id = ra.estacion_id and m.activo
    where ra.rol_id = p_rol_id and ra.funcion = 'mesero'
    group by ra.id, ra.empleado_id, e.nombre, e.apellidos
    having count(m.id) > v_max;
  end if;
end;
$$;

/* ─── Estado operativo de las mesas ───────────────────────── */

alter table public.mesas
  add column estado text not null default 'disponible'
  check (estado in ('disponible','reservada','en_limpieza','fuera_servicio','cerrada'));

-- Hostess, capitán, supervisor y gerencia cambian el estado; el catálogo
-- (número, capacidad, estación) sigue siendo solo de gerencia.
create function public.cambiar_estado_mesa(p_mesa_id uuid, p_estado text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not tiene_rol('admin', 'gerente', 'capitan', 'supervisor', 'hostess') then
    raise exception 'No tienes permiso para cambiar el estado de las mesas' using errcode = 'insufficient_privilege';
  end if;
  if p_estado not in ('disponible','reservada','en_limpieza','fuera_servicio','cerrada') then
    raise exception 'Estado de mesa no válido: %', p_estado using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from visitas where mesa_id = p_mesa_id and estado = 'sentada') then
    raise exception 'La mesa está ocupada; cierra o mueve la visita primero' using errcode = 'check_violation';
  end if;
  update mesas set estado = p_estado where id = p_mesa_id;
  if not found then
    raise exception 'Mesa no encontrada' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Al sentar a alguien la mesa debe estar disponible o reservada (la reserva se
-- consume y la mesa vuelve a disponible). Al cerrar, opcionalmente pasa a limpieza.
create function public.estado_mesa_por_visita()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_estado text;
begin
  if new.mesa_id is not null and new.estado = 'sentada'
     and (tg_op = 'INSERT' or new.mesa_id is distinct from old.mesa_id or old.estado <> 'sentada') then
    select estado into v_estado from mesas where id = new.mesa_id;
    if v_estado not in ('disponible','reservada') then
      raise exception 'La mesa está %; elige otra o cámbiala a disponible',
        replace(replace(v_estado, 'en_limpieza', 'en limpieza'), 'fuera_servicio', 'fuera de servicio')
        using errcode = 'check_violation';
    end if;
    if v_estado = 'reservada' then
      update mesas set estado = 'disponible' where id = new.mesa_id;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.estado = 'sentada' and new.estado = 'cerrada'
     and config_bool('limpieza_al_cerrar', false) then
    update mesas set estado = 'en_limpieza' where id = new.mesa_id and estado = 'disponible';
  end if;
  return new;
end;
$$;

-- "visitas_z…" para correr después de visitas_asignar_mesa, que pone estado 'sentada'.
create trigger visitas_zestado_mesa
  before insert or update on public.visitas
  for each row execute function public.estado_mesa_por_visita();

/* ─── Disponibilidad: se agrega el estado del empleado ────── */

-- Misma firma y columnas que antes más `estado`; incluye a los no activos
-- para que la pantalla explique por qué no se pueden asignar.
drop function public.empleados_disponibles(date, uuid);
create function public.empleados_disponibles(p_fecha date, p_turno uuid default null)
returns table (
  empleado_id  uuid,
  nombre       text,
  puesto       text,
  ausencia     text,
  turno_id     uuid,
  es_descanso  boolean,
  disponible   boolean,
  estado       text
)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not tiene_rol('admin', 'gerente', 'rrhh', 'capitan', 'supervisor') then
    raise exception 'No tienes permiso para consultar la disponibilidad del personal'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select e.id,
         trim(e.nombre || ' ' || coalesce(e.apellidos, '')),
         e.puesto,
         ausencia_en(e.id, p_fecha),
         h.turno_id,
         coalesce(h.es_descanso, false),
         e.estado = 'activo'
           and ausencia_en(e.id, p_fecha) is null
           and not coalesce(h.es_descanso, false)
           and (p_turno is null or h.turno_id is null or h.turno_id = p_turno),
         e.estado
  from empleados e
  left join horarios h on h.empleado_id = e.id and h.fecha = p_fecha
  where e.estado <> 'inactivo'
  order by e.puesto, e.nombre;
end;
$$;

/* ─── Seguridad ───────────────────────────────────────────── */

alter table public.empleado_autorizaciones enable row level security;
alter table public.empleado_restricciones enable row level security;
alter table public.rol_excepciones enable row level security;

-- Quien arma el rol las consulta; las registra personal (admin, gerente, RR. HH.).
create policy empleado_autorizaciones_leer on public.empleado_autorizaciones for select to authenticated
  using (public.tiene_rol('admin','gerente','rrhh','capitan','supervisor'));
create policy empleado_autorizaciones_administrar on public.empleado_autorizaciones for all to authenticated
  using (public.tiene_rol('admin','gerente','rrhh'))
  with check (public.tiene_rol('admin','gerente','rrhh'));

create policy empleado_restricciones_leer on public.empleado_restricciones for select to authenticated
  using (public.tiene_rol('admin','gerente','rrhh','capitan','supervisor'));
create policy empleado_restricciones_administrar on public.empleado_restricciones for all to authenticated
  using (public.tiene_rol('admin','gerente','rrhh'))
  with check (public.tiene_rol('admin','gerente','rrhh'));

create policy rol_excepciones_leer on public.rol_excepciones for select to authenticated
  using (public.tiene_rol('admin','gerente','capitan','supervisor'));

revoke execute on function
  public.sincronizar_estado_empleado(),
  public.advertencias_asignacion(uuid, date, uuid, text, uuid, uuid, boolean),
  public.validar_restricciones_rol(),
  public.conflictos_rol(uuid),
  public.cambiar_estado_mesa(uuid, text),
  public.estado_mesa_por_visita(),
  public.empleados_disponibles(date, uuid)
from public, anon;

grant execute on function
  public.conflictos_rol(uuid),
  public.cambiar_estado_mesa(uuid, text),
  public.empleados_disponibles(date, uuid)
to authenticated;

-- Auditoría de los catálogos nuevos.
create trigger empleado_autorizaciones_auditoria after insert or update or delete on public.empleado_autorizaciones
  for each row execute function public.registrar_auditoria();
create trigger empleado_restricciones_auditoria after insert or update or delete on public.empleado_restricciones
  for each row execute function public.registrar_auditoria();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all functions in schema public to service_role;
  end if;
  -- La hostess ve en vivo los cambios de estado de las mesas.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.mesas;
  end if;
end;
$$;
