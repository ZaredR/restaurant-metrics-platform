/* ─── Reglas de negocio, vistas y auditoría ─────────────────
   Las reglas viven en la base de datos para que se cumplan
   aunque alguien se salte la pantalla.
   ──────────────────────────────────────────────────────────── */

/* ─── Helpers ─────────────────────────────────────────────── */

-- security definer: los triggers deben ver las ausencias aunque
-- quien asigna (capitán) no tenga permiso de leerlas.
create function public.ausencia_en(p_empleado uuid, p_fecha date)
returns text
language sql stable security definer set search_path = public
as $$
  select tipo
  from ausencias
  where empleado_id = p_empleado
    and estado = 'aprobada'
    and p_fecha between fecha_inicio and fecha_fin
  limit 1
$$;

create function public.config_bool(p_clave text, p_default boolean)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select (valor #>> '{}')::boolean from configuracion where clave = p_clave), p_default)
$$;

-- Disponibilidad para armar horarios y roles: ausencia y horario del día.
-- Revela quién tiene incapacidad o vacaciones, así que solo la consultan
-- quienes arman horarios o roles (tiene_rol se define en la migración de seguridad).
create function public.empleados_disponibles(p_fecha date, p_turno uuid default null)
returns table (
  empleado_id  uuid,
  nombre       text,
  puesto       text,
  ausencia     text,
  turno_id     uuid,
  es_descanso  boolean,
  disponible   boolean
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
         ausencia_en(e.id, p_fecha) is null
           and not coalesce(h.es_descanso, false)
           and (p_turno is null or h.turno_id is null or h.turno_id = p_turno)
  from empleados e
  left join horarios h on h.empleado_id = e.id and h.fecha = p_fecha
  where e.activo
  order by e.puesto, e.nombre;
end;
$$;

-- Solo nombre y puesto de cada empleado: lo que cualquier usuario necesita
-- para ver el rol o la hostess. Sin security_invoker a propósito: lee
-- empleados con los permisos del dueño, pero no expone teléfono ni correo.
create view public.empleados_directorio as
select id, nombre, apellidos, trim(nombre || ' ' || coalesce(apellidos, '')) as nombre_completo, puesto, activo
from public.empleados;

/* ─── Horarios: no programar a alguien ausente ────────────── */

create function public.validar_horario()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_ausencia text := ausencia_en(new.empleado_id, new.fecha);
begin
  if not new.es_descanso and v_ausencia is not null
     and config_bool('ausencias_bloquean', true) then
    raise exception 'El empleado tiene una ausencia aprobada (%) el %', v_ausencia, new.fecha
      using errcode = 'check_violation';
  end if;
  if new.es_descanso then
    new.turno_id := null;
  end if;
  return new;
end;
$$;

create trigger horarios_validar
  before insert or update on public.horarios
  for each row execute function public.validar_horario();

/* ─── Rol diario: disponibilidad y consistencia ───────────── */

create function public.validar_rol_asignacion()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_rol      roles_diarios%rowtype;
  v_ausencia text;
begin
  select * into v_rol from roles_diarios
  where id = case when tg_op = 'DELETE' then old.rol_id else new.rol_id end;

  if v_rol.estado = 'cerrado' then
    raise exception 'El rol del % ya está cerrado', v_rol.fecha
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

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

  return new;
end;
$$;

create trigger rol_asignaciones_validar
  before insert or update or delete on public.rol_asignaciones
  for each row execute function public.validar_rol_asignacion();

create function public.publicar_rol(p_rol_id uuid)
returns public.roles_diarios
language plpgsql set search_path = public
as $$
declare
  v_rol roles_diarios%rowtype;
begin
  select * into v_rol from roles_diarios where id = p_rol_id for update;
  if not found then
    raise exception 'Rol no encontrado' using errcode = 'no_data_found';
  end if;
  if v_rol.estado <> 'borrador' then
    raise exception 'Solo se puede publicar un rol en borrador (estado actual: %)', v_rol.estado
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

create function public.cerrar_rol(p_rol_id uuid)
returns public.roles_diarios
language plpgsql set search_path = public
as $$
declare
  v_rol roles_diarios%rowtype;
begin
  update roles_diarios set estado = 'cerrado'
   where id = p_rol_id and estado = 'publicado'
  returning * into v_rol;
  if not found then
    raise exception 'Solo se puede cerrar un rol publicado' using errcode = 'check_violation';
  end if;
  return v_rol;
end;
$$;

/* ─── Visitas: mesa → estación → mesero → área → capitán ──── */

create function public.asignar_mesa_visita()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_estado_rol text;
begin
  if tg_op = 'UPDATE' and new.estado = 'cerrada' and old.estado <> 'cerrada' then
    new.hora_salida := coalesce(new.hora_salida, now());
  end if;

  -- Solo se recalcula cuando cambia la mesa o el rol.
  if tg_op = 'UPDATE'
     and new.mesa_id is not distinct from old.mesa_id
     and new.rol_id = old.rol_id then
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
  if v_estado_rol is distinct from 'publicado' then
    raise exception 'Solo se asignan mesas en un rol publicado' using errcode = 'check_violation';
  end if;

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

create trigger visitas_asignar_mesa
  before insert or update on public.visitas
  for each row execute function public.asignar_mesa_visita();

/* ─── Vistas (respetan RLS de quien consulta) ─────────────── */

create view public.v_mesas_asignadas
with (security_invoker = true) as
select r.id          as rol_id,
       r.fecha,
       t.nombre      as turno,
       r.estado      as estado_rol,
       m.id          as mesa_id,
       m.numero      as mesa,
       e.id          as estacion_id,
       e.nombre      as estacion,
       ar.id         as area_id,
       ar.nombre     as area,
       am.empleado_id as mesero_id,
       trim(em.nombre || ' ' || coalesce(em.apellidos, '')) as mesero,
       ac.empleado_id as capitan_id,
       trim(ec.nombre || ' ' || coalesce(ec.apellidos, '')) as capitan
from roles_diarios r
join turnos t            on t.id = r.turno_id
join rol_asignaciones am on am.rol_id = r.id and am.funcion = 'mesero'
join estaciones e        on e.id = am.estacion_id
join areas ar            on ar.id = e.area_id
join mesas m             on m.estacion_id = e.id and m.activo
join empleados_directorio em        on em.id = am.empleado_id
left join rol_asignaciones ac on ac.rol_id = r.id and ac.funcion = 'capitan' and ac.area_id = e.area_id
left join empleados_directorio ec   on ec.id = ac.empleado_id;

-- Comensales atendidos por cada mesero en cada rol (solo visitas sentadas o cerradas).
create view public.v_comensales_mesero
with (security_invoker = true) as
select a.rol_id,
       r.fecha,
       r.turno_id,
       a.area_id,
       ar.nombre   as area,
       a.estacion_id,
       a.empleado_id,
       trim(e.nombre || ' ' || coalesce(e.apellidos, '')) as mesero,
       a.es_cierre,
       coalesce(sum(v.comensales), 0) as comensales,
       count(v.id)                    as mesas_atendidas
from rol_asignaciones a
join roles_diarios r on r.id = a.rol_id
join empleados_directorio e     on e.id = a.empleado_id
join areas ar        on ar.id = a.area_id
left join visitas v  on v.rol_id = a.rol_id
                    and v.mesero_id = a.empleado_id
                    and v.estado in ('sentada','cerrada')
where a.funcion = 'mesero'
group by a.rol_id, r.fecha, r.turno_id, a.area_id, ar.nombre, a.estacion_id,
         a.empleado_id, e.nombre, e.apellidos, a.es_cierre;

-- Orden de salida: meseros de cierre por área, de menos a más comensales.
-- SUPUESTO: en empate se ordena por nombre.
create view public.v_orden_salida
with (security_invoker = true) as
select c.*,
       row_number() over (partition by c.rol_id, c.area_id order by c.comensales, c.mesero) as orden
from v_comensales_mesero c
where c.es_cierre;

-- Cada respuesta con su contexto operativo y su promedio.
create view public.v_encuestas_contexto
with (security_invoker = true) as
select re.id         as respuesta_id,
       re.encuesta_id,
       re.created_at,
       v.id          as visita_id,
       r.fecha,
       t.nombre      as turno,
       m.numero      as mesa,
       v.area_id,
       ar.nombre     as area,
       v.mesero_id,
       trim(em.nombre || ' ' || coalesce(em.apellidos, '')) as mesero,
       v.capitan_id,
       trim(ec.nombre || ' ' || coalesce(ec.apellidos, '')) as capitan,
       (select round(avg(d.valor_numerico), 2)
          from respuestas_detalle d
         where d.respuesta_id = re.id and d.valor_numerico is not null) as promedio,
       re.comentario
from respuestas_encuesta re
join visitas v         on v.id = re.visita_id
join roles_diarios r   on r.id = v.rol_id
join turnos t          on t.id = r.turno_id
left join mesas m      on m.id = v.mesa_id
left join areas ar     on ar.id = v.area_id
left join empleados_directorio em on em.id = v.mesero_id
left join empleados_directorio ec on ec.id = v.capitan_id;

/* ─── Auditoría ───────────────────────────────────────────── */

create function public.registrar_auditoria()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_antes   jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_despues jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
begin
  insert into auditoria (tabla, registro_id, accion, usuario_id, antes, despues)
  values (tg_table_name,
          coalesce(v_despues, v_antes) ->> 'id',
          tg_op,
          auth.uid(),
          v_antes,
          v_despues);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'empleados','usuarios','configuracion','ausencias','turnos','horarios',
    'areas','estaciones','mesas','roles_diarios','rol_asignaciones',
    'visitas','encuestas','preguntas','reglas_alerta'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.registrar_auditoria()',
      t || '_auditoria', t);
  end loop;
end;
$$;
