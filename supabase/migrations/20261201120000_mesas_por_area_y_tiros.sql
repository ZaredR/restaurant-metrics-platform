/* ─── Mesas por área, modo de trabajo y runners por función ─
   Tomado de la versión piloto del equipo:
   - Las mesas pertenecen a un área (se registran por rangos, 1–69);
     la estación es opcional.
   - En cada rol, cada área trabaja en uno de tres modos:
       estaciones   (como hasta ahora: mesero por estación)
       tiros        (los meseros del área se turnan: al sentar, el sistema
                     propone al que lleva menos comensales; la hostess
                     puede elegir otro de la misma área)
       sin_servicio (el área está cerrada en ese turno)
     Sin registro, el área trabaja por estaciones.
   - Los runners pueden asignarse por función de cocina (catálogo).
   SUPUESTO: "TIROS" = rotación por menor carga; confirmar con el cliente.
   ──────────────────────────────────────────────────────────── */

/* ─── Mesas: el área es propia, la estación opcional ─────── */

alter table public.mesas add column area_id uuid references public.areas(id);
update public.mesas m set area_id = e.area_id from public.estaciones e where e.id = m.estacion_id;
alter table public.mesas alter column area_id set not null;
alter table public.mesas alter column estacion_id drop not null;

-- Con estación, el área siempre es la de la estación.
create function public.area_de_mesa()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.estacion_id is not null then
    select area_id into new.area_id from estaciones where id = new.estacion_id;
  end if;
  if new.area_id is null then
    raise exception 'La mesa necesita un área' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger mesas_area
  before insert or update on public.mesas
  for each row execute function public.area_de_mesa();

/* ─── Modo de trabajo de cada área en cada rol ────────────── */

create table public.rol_areas (
  rol_id   uuid not null references public.roles_diarios(id) on delete cascade,
  area_id  uuid not null references public.areas(id) on delete cascade,
  modo     text not null default 'estaciones' check (modo in ('estaciones','tiros','sin_servicio')),
  primary key (rol_id, area_id)
);

create function public.modo_area(p_rol_id uuid, p_area_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce((select modo from rol_areas where rol_id = p_rol_id and area_id = p_area_id), 'estaciones')
$$;

-- El rol cerrado o en revisión no cambia de modo (misma regla que sus asignaciones).
create function public.validar_rol_area()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_estado text;
begin
  select estado into v_estado from roles_diarios
   where id = case when tg_op = 'DELETE' then old.rol_id else new.rol_id end;
  if v_estado in ('cerrado','en_revision') then
    raise exception 'El rol está %; no se puede cambiar el modo de las áreas', replace(v_estado, '_', ' ')
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger rol_areas_validar
  before insert or update or delete on public.rol_areas
  for each row execute function public.validar_rol_area();

/* ─── Meseros en TIROS: área sin estación ─────────────────── */

do $$
declare
  c text;
begin
  -- La regla original exige estación a todo mesero; se reemplaza.
  select conname into c from pg_constraint
   where conrelid = 'public.rol_asignaciones'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%capitan%';
  execute format('alter table public.rol_asignaciones drop constraint %I', c);
end;
$$;

alter table public.rol_asignaciones add constraint rol_asignaciones_funcion_lugar check (
     (funcion = 'mesero'  and (estacion_id is not null or area_id is not null))
  or (funcion = 'capitan' and area_id is not null and estacion_id is null)
  or (funcion in ('runner','hostess') and estacion_id is null)
);

-- El siguiente mesero de TIROS: el que lleva menos comensales en el rol (empate: menos mesas, nombre).
create function public.mesero_siguiente_tiro(p_rol_id uuid, p_area_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select ra.empleado_id
  from rol_asignaciones ra
  join empleados e on e.id = ra.empleado_id
  left join visitas v on v.rol_id = ra.rol_id and v.mesero_id = ra.empleado_id and v.estado in ('sentada','cerrada')
  where ra.rol_id = p_rol_id and ra.funcion = 'mesero' and ra.estacion_id is null and ra.area_id = p_area_id
  group by ra.empleado_id, e.nombre, e.apellidos
  order by coalesce(sum(v.comensales), 0), count(v.id), e.nombre, e.apellidos
  limit 1
$$;

/* ─── Runners por función de cocina ───────────────────────── */

create table public.funciones_runner (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique,
  orden   int not null default 0,
  activo  boolean not null default true
);

-- SUPUESTO: funciones de la versión piloto; editables por gerencia.
insert into public.funciones_runner (nombre, orden) values
  ('Fría', 1), ('Caliente', 2), ('Descamoche', 3), ('Stand boy', 4);

alter table public.rol_asignaciones
  add column funcion_runner_id uuid references public.funciones_runner(id),
  add constraint rol_asignaciones_funcion_runner check (funcion_runner_id is null or funcion = 'runner');

/* ─── Validación del rol (un mesero en TIROS no tiene estación) ─── */

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
    -- (Un mesero en TIROS no tiene estación: conserva su área.)
    if new.funcion = 'mesero' and new.estacion_id is not null then
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

/* ─── Asignar mesa: el modo del área decide quién atiende ─── */

create or replace function public.asignar_mesa_visita()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_estado_rol     text;
  v_mesero_previo  uuid;
  v_modo           text;
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

  select m.estacion_id, m.area_id
    into new.estacion_id, new.area_id
  from mesas m
  where m.id = new.mesa_id and m.activo;
  if not found then
    raise exception 'La mesa no existe o está inactiva' using errcode = 'check_violation';
  end if;

  v_modo := modo_area(new.rol_id, new.area_id);
  if v_modo = 'sin_servicio' then
    raise exception 'El área de esa mesa no tiene servicio en este turno' using errcode = 'check_violation';
  elsif v_modo = 'tiros' then
    -- TIROS: se respeta el mesero elegido si está en tiros en esa área; si no, el siguiente.
    if new.mesero_id is null or not exists (
         select 1 from rol_asignaciones
          where rol_id = new.rol_id and funcion = 'mesero' and estacion_id is null
            and area_id = new.area_id and empleado_id = new.mesero_id) then
      new.mesero_id := mesero_siguiente_tiro(new.rol_id, new.area_id);
    end if;
    if new.mesero_id is null then
      raise exception 'El área trabaja en TIROS y no tiene meseros en el rol' using errcode = 'check_violation';
    end if;
  else
    if new.estacion_id is null then
      raise exception 'La mesa no tiene estación y su área trabaja por estaciones' using errcode = 'check_violation';
    end if;
    select empleado_id into new.mesero_id
    from rol_asignaciones
    where rol_id = new.rol_id and funcion = 'mesero' and estacion_id = new.estacion_id;
    if new.mesero_id is null then
      raise exception 'La estación de esa mesa no tiene mesero en el rol' using errcode = 'check_violation';
    end if;
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

/* ─── Conflictos del rol según el modo de cada área ─── */

create or replace function public.conflictos_rol(p_rol_id uuid)
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

  -- Áreas por estaciones: estaciones sin mesero y mesas sin estación.
  return query
  select 'advertencia', 'cobertura', format('La estación %s no tiene mesero responsable', s.nombre),
         null::uuid, null::uuid
  from estaciones s
  join areas ar on ar.id = s.area_id and ar.activo
  where s.activo and modo_area(p_rol_id, ar.id) = 'estaciones'
    and not exists (select 1 from rol_asignaciones ra
                     where ra.rol_id = p_rol_id and ra.funcion = 'mesero' and ra.estacion_id = s.id)
  order by s.nombre;

  return query
  select 'advertencia', 'cobertura',
         format('%s mesa(s) de %s no tienen estación y el área trabaja por estaciones', count(*), ar.nombre),
         null::uuid, null::uuid
  from mesas m join areas ar on ar.id = m.area_id and ar.activo
  where m.activo and m.estacion_id is null and modo_area(p_rol_id, ar.id) = 'estaciones'
  group by ar.nombre;

  -- Áreas en TIROS sin meseros.
  return query
  select 'advertencia', 'cobertura', format('El área %s trabaja en TIROS y no tiene meseros', ar.nombre),
         null::uuid, null::uuid
  from areas ar
  where ar.activo and modo_area(p_rol_id, ar.id) = 'tiros'
    and not exists (select 1 from rol_asignaciones ra
                     where ra.rol_id = p_rol_id and ra.funcion = 'mesero' and ra.estacion_id is null
                       and ra.area_id = ar.id);

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

/* ─── Ajustes al rol publicado (incluye la función del runner) ─── */

create or replace function public.rol_ajustar(p_operacion text, p_asignacion_id uuid, p_datos jsonb, p_motivo text)
returns void
language plpgsql set search_path = public
as $$
begin
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indica el motivo del cambio' using errcode = 'check_violation';
  end if;
  perform set_config('app.motivo_ajuste', p_motivo, true);

  if p_operacion = 'alta' then
    insert into rol_asignaciones (rol_id, empleado_id, funcion, area_id, estacion_id, es_cierre, funcion_runner_id)
    values ((p_datos->>'rol_id')::uuid, (p_datos->>'empleado_id')::uuid, p_datos->>'funcion',
            (p_datos->>'area_id')::uuid, (p_datos->>'estacion_id')::uuid,
            coalesce((p_datos->>'es_cierre')::boolean, false), (p_datos->>'funcion_runner_id')::uuid);
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

/* ─── Alertas: "estación sin mesero" solo en áreas por estaciones ─── */

create or replace function public.evaluar_alertas()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  r      reglas_alerta%rowtype;
  x      record;
  v_hoy  date := hoy_local();
  v_n    int := 0;
begin
  if auth.uid() is not null and rol_actual() is null then
    raise exception 'No tienes permiso' using errcode = 'insufficient_privilege';
  end if;

  for r in select * from reglas_alerta where activa loop
    if r.tipo = 'estacion_sin_mesero' then
      for x in
        select ro.id as rol_id, t.nombre as turno, s.id as estacion_id, s.nombre as estacion, s.area_id
        from roles_diarios ro join turnos t on t.id = ro.turno_id
        join estaciones s on s.activo
        join areas a on a.id = s.area_id and a.activo
        where ro.fecha = v_hoy and ro.estado in ('publicado','modificado')
          and modo_area(ro.id, a.id) = 'estaciones'
          and exists (select 1 from mesas m where m.estacion_id = s.id and m.activo)
          and not exists (select 1 from rol_asignaciones ra
                           where ra.rol_id = ro.id and ra.funcion = 'mesero' and ra.estacion_id = s.id)
      loop
        v_n := v_n + crear_alerta(r, format('sinmes:%s:%s', x.rol_id, x.estacion_id),
          format('La estación %s no tiene mesero en el turno %s de hoy', x.estacion, x.turno),
          jsonb_build_object('rol_id', x.rol_id), null, x.area_id);
      end loop;

    elsif r.tipo = 'saturacion_mesero' then
      for x in
        select v.rol_id, v.mesero_id, t.nombre as turno, sum(v.comensales) as comensales,
               trim(e.nombre || ' ' || coalesce(e.apellidos, '')) as mesero
        from visitas v join roles_diarios ro on ro.id = v.rol_id join turnos t on t.id = ro.turno_id
        join empleados e on e.id = v.mesero_id
        where ro.fecha = v_hoy and v.estado in ('sentada','cerrada')
        group by v.rol_id, v.mesero_id, t.nombre, e.nombre, e.apellidos
        having sum(v.comensales) > r.umbral
      loop
        v_n := v_n + crear_alerta(r, format('sat:%s:%s', x.rol_id, x.mesero_id),
          format('%s lleva %s comensales en el turno %s (límite %s)', x.mesero, x.comensales, x.turno, r.umbral),
          jsonb_build_object('rol_id', x.rol_id), x.mesero_id);
      end loop;

    elsif r.tipo = 'carga_area' then
      for x in
        select v.rol_id, v.area_id, a.nombre as area, t.nombre as turno, sum(v.comensales) as comensales
        from visitas v join roles_diarios ro on ro.id = v.rol_id join turnos t on t.id = ro.turno_id
        join areas a on a.id = v.area_id
        where ro.fecha = v_hoy and v.estado in ('sentada','cerrada')
        group by v.rol_id, v.area_id, a.nombre, t.nombre
        having sum(v.comensales) > r.umbral
      loop
        v_n := v_n + crear_alerta(r, format('area:%s:%s', x.rol_id, x.area_id),
          format('%s lleva %s comensales en el turno %s (límite %s)', x.area, x.comensales, x.turno, r.umbral),
          jsonb_build_object('rol_id', x.rol_id), null, x.area_id);
      end loop;

    elsif r.tipo = 'promedio_encuesta_mesero' then
      for x in
        select c.mesero_id, c.mesero, round(avg(c.promedio), 2) as promedio, count(*) as encuestas
        from v_encuestas_contexto c
        where c.fecha > v_hoy - r.periodo_dias and c.promedio is not null and c.mesero_id is not null
        group by c.mesero_id, c.mesero
        -- SUPUESTO: al menos 3 encuestas para que el promedio sea representativo.
        having count(*) >= 3 and avg(c.promedio) < r.umbral
      loop
        v_n := v_n + crear_alerta(r, format('promes:%s:%s', x.mesero_id, v_hoy),
          format('%s tiene promedio %s en %s encuestas de los últimos %s días (umbral %s)',
                 x.mesero, x.promedio, x.encuestas, r.periodo_dias, r.umbral),
          null, x.mesero_id);
      end loop;

    elsif r.tipo = 'promedio_turno' then
      for x in
        select ro.id as rol_id, t.nombre as turno, round(avg(c.promedio), 2) as promedio, count(*) as encuestas
        from v_encuestas_contexto c
        join visitas v on v.id = c.visita_id join roles_diarios ro on ro.id = v.rol_id
        join turnos t on t.id = ro.turno_id
        where ro.fecha = v_hoy and c.promedio is not null
        group by ro.id, t.nombre
        having count(*) >= 3 and avg(c.promedio) < r.umbral
      loop
        v_n := v_n + crear_alerta(r, format('proturno:%s', x.rol_id),
          format('El turno %s de hoy tiene satisfacción promedio %s en %s encuestas (umbral %s)',
                 x.turno, x.promedio, x.encuestas, r.umbral),
          jsonb_build_object('rol_id', x.rol_id));
      end loop;

    elsif r.tipo = 'cierre_mesas_ocupadas' then
      -- Mesas que siguen ocupadas en un turno ya cerrado o de un día anterior:
      -- no tienen quién las cerró para el cálculo del cierre.
      for x in
        select ro.id as rol_id, ro.fecha, t.nombre as turno, count(*) as mesas
        from visitas v join roles_diarios ro on ro.id = v.rol_id join turnos t on t.id = ro.turno_id
        where v.estado = 'sentada' and (ro.estado = 'cerrado' or ro.fecha < v_hoy)
        group by ro.id, ro.fecha, t.nombre
      loop
        v_n := v_n + crear_alerta(r, format('cierre:%s', x.rol_id),
          format('El turno %s del %s tiene %s mesa(s) sin cerrar: no tienen responsable para el cierre',
                 x.turno, to_char(x.fecha, 'DD/MM/YYYY'), x.mesas),
          jsonb_build_object('rol_id', x.rol_id));
      end loop;

    elsif r.tipo = 'estacion_sin_mesas' then
      for x in
        select s.id, s.nombre, s.area_id from estaciones s
        where s.activo and not exists (select 1 from mesas m where m.estacion_id = s.id and m.activo)
      loop
        v_n := v_n + crear_alerta(r, format('vacia:%s', x.id),
          format('La estación %s está activa pero no tiene mesas', x.nombre), null, null, x.area_id);
      end loop;
    end if;
  end loop;

  return v_n;
end;
$$;

/* ─── Mesas del rol para la Hostess ───────────────────────── */

-- Cada mesa activa con su área, el modo del área en el rol y, por estaciones,
-- su mesero. "atendible" = se le puede sentar a alguien en este rol.
create view public.v_mesas_rol
with (security_invoker = true) as
select r.id          as rol_id,
       m.id          as mesa_id,
       m.numero,
       m.area_id,
       m.estacion_id,
       public.modo_area(r.id, m.area_id) as modo,
       am.empleado_id as mesero_id,
       case public.modo_area(r.id, m.area_id)
         when 'sin_servicio' then false
         when 'tiros' then exists (select 1 from rol_asignaciones t
                                    where t.rol_id = r.id and t.funcion = 'mesero'
                                      and t.estacion_id is null and t.area_id = m.area_id)
         else am.empleado_id is not null
       end as atendible
from roles_diarios r
cross join mesas m
left join rol_asignaciones am
       on am.rol_id = r.id and am.funcion = 'mesero' and am.estacion_id = m.estacion_id
      and public.modo_area(r.id, m.area_id) = 'estaciones'
where m.activo;

/* ─── Seguridad ───────────────────────────────────────────── */

alter table public.rol_areas enable row level security;
alter table public.funciones_runner enable row level security;

-- rol_areas sigue la visibilidad de su rol, como rol_asignaciones.
create policy rol_areas_leer on public.rol_areas for select to authenticated
  using (exists (select 1 from public.roles_diarios r where r.id = rol_areas.rol_id));
create policy rol_areas_administrar on public.rol_areas for all to authenticated
  using (public.tiene_rol('admin','gerente','capitan','supervisor'))
  with check (public.tiene_rol('admin','gerente','capitan','supervisor'));

create policy funciones_runner_leer on public.funciones_runner for select to authenticated using (true);
create policy funciones_runner_administrar on public.funciones_runner for all to authenticated
  using (public.tiene_rol('admin','gerente'))
  with check (public.tiene_rol('admin','gerente'));

revoke all on public.v_mesas_rol from public, anon;
grant select on public.v_mesas_rol to authenticated;

create trigger rol_areas_auditoria after insert or update or delete on public.rol_areas
  for each row execute function public.registrar_auditoria();

revoke execute on function
  public.area_de_mesa(),
  public.modo_area(uuid, uuid),
  public.validar_rol_area(),
  public.mesero_siguiente_tiro(uuid, uuid)
from public, anon;
-- La vista y la Hostess los usan con la sesión del usuario.
grant execute on function public.modo_area(uuid, uuid), public.mesero_siguiente_tiro(uuid, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all functions in schema public to service_role;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rol_areas;
  end if;
end;
$$;
