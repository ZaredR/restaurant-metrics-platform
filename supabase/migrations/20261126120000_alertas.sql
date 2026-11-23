/* ─── Alertas dentro del sistema ────────────────────────────
   Contextualización, sección 9. Decisiones del cliente (2026-11-22):
   - Solo dentro del sistema (sin correo ni mensajería).
   - Las de eventos salen al momento (triggers); las de umbral se
     revisan cuando alguien abre la app (evaluar_alertas), sin duplicarse.
   - Cada regla define sus perfiles destinatarios; cada quien ve y
     atiende las suyas. Gerente y admin ven todas.
   ──────────────────────────────────────────────────────────── */

/* ─── Reglas: tipos nuevos ────────────────────────────────── */

alter table public.reglas_alerta drop constraint reglas_alerta_tipo_check;
alter table public.reglas_alerta add constraint reglas_alerta_tipo_check check (tipo in (
  -- Operación del turno
  'estacion_sin_mesero', 'saturacion_mesero', 'carga_area',
  -- Rol y disponibilidad
  'asignacion_excepcion', 'reasignacion_mesa',
  -- Satisfacción
  'respuesta_critica', 'promedio_encuesta_mesero', 'promedio_turno',
  -- Cierre y configuración
  'cierre_mesas_ocupadas', 'estacion_sin_mesas'
));

alter table public.reglas_alerta
  add column nivel text not null default 'warning' check (nivel in ('info','warning','critical'));

alter table public.alertas
  add column clave           text,          -- evita repetir la misma alerta
  add column destinatarios   text[] not null default '{}',
  add column atendida_por    uuid references auth.users(id) on delete set null,
  add column atendida_nombre text,
  add column atendida_at     timestamptz,
  add column nota            text;

create unique index alertas_regla_clave on public.alertas (regla_id, clave) where clave is not null;
create index alertas_pendientes on public.alertas (atendida, created_at desc);

-- SUPUESTO: umbrales y destinatarios iniciales (editables en la pantalla de Alertas),
-- según la tabla de ejemplos de la sección 9. Solo se crean los tipos que no existan.
insert into public.reglas_alerta (nombre, tipo, umbral, periodo_dias, destinatarios, nivel)
select x.nombre, x.tipo, x.umbral, x.periodo, x.destinatarios, x.nivel
from (values
  ('Estación sin mesero en el rol',           'estacion_sin_mesero',      0,   1, array['supervisor','capitan','gerente'], 'critical'),
  ('Mesero con muchos comensales en el turno', 'saturacion_mesero',        40,  1, array['supervisor','capitan'],           'warning'),
  ('Carga alta de comensales por área',        'carga_area',               60,  1, array['supervisor','capitan'],           'warning'),
  ('Asignación con excepción',                 'asignacion_excepcion',     0,   1, array['gerente'],                         'warning'),
  ('Mesa reasignada a otro mesero',            'reasignacion_mesa',        0,   1, array['supervisor'],                      'info'),
  ('Respuesta crítica en encuesta',            'respuesta_critica',        2,   1, array['gerente'],                         'critical'),
  ('Promedio de encuesta bajo por mesero',     'promedio_encuesta_mesero', 3.5, 7, array['gerente'],                         'warning'),
  ('Promedio de satisfacción bajo en el turno','promedio_turno',           3.5, 1, array['gerente'],                         'warning'),
  ('Mesas abiertas en un turno cerrado',       'cierre_mesas_ocupadas',    0,   1, array['gerente','supervisor'],            'critical'),
  ('Estación activa sin mesas',                'estacion_sin_mesas',       0,   1, array['admin'],                           'info')
) as x(nombre, tipo, umbral, periodo, destinatarios, nivel)
where not exists (select 1 from public.reglas_alerta r where r.tipo = x.tipo);

-- Las reglas de ejemplo del seed no tenían destinatarios.
update public.reglas_alerta set destinatarios = case tipo
    when 'carga_area' then array['supervisor','capitan']
    else array['gerente'] end
 where destinatarios = '{}';
update public.reglas_alerta set nivel = 'critical' where tipo = 'respuesta_critica';

/* ─── Crear una alerta (interna) ──────────────────────────── */

create function public.crear_alerta(p_regla public.reglas_alerta, p_clave text, p_mensaje text,
                                    p_datos jsonb default null, p_empleado uuid default null, p_area uuid default null)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_n int;
begin
  insert into alertas (regla_id, nivel, mensaje, empleado_id, area_id, datos, clave, destinatarios)
  values (p_regla.id, p_regla.nivel, p_mensaje, p_empleado, p_area, p_datos, p_clave, p_regla.destinatarios)
  on conflict (regla_id, clave) where clave is not null do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

/* ─── Alertas por evento (al momento) ─────────────────────── */

create function public.alerta_por_excepcion()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r reglas_alerta%rowtype;
begin
  for r in select * from reglas_alerta where tipo = 'asignacion_excepcion' and activa loop
    perform crear_alerta(r, 'exc:' || new.id,
      format('%s fue asignado(a) con excepción el %s: %s. Motivo: %s',
             (select trim(nombre || ' ' || coalesce(apellidos, '')) from empleados where id = new.empleado_id),
             to_char((select fecha from roles_diarios where id = new.rol_id), 'DD/MM/YYYY'),
             array_to_string(new.advertencias, '; '), new.motivo),
      jsonb_build_object('rol_id', new.rol_id), new.empleado_id);
  end loop;
  return null;
end;
$$;

create trigger rol_excepciones_alerta after insert on public.rol_excepciones
  for each row execute function public.alerta_por_excepcion();

create function public.alerta_por_reasignacion()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r reglas_alerta%rowtype;
begin
  if new.tipo <> 'reasignacion' then
    return null;
  end if;
  for r in select * from reglas_alerta where tipo = 'reasignacion_mesa' and activa loop
    perform crear_alerta(r, 'reas:' || new.id,
      format('Mesa %s pasó de %s a %s. Motivo: %s',
             (select numero from mesas where id = new.mesa_nueva),
             (select trim(nombre || ' ' || coalesce(apellidos, '')) from empleados where id = new.mesero_anterior),
             (select trim(nombre || ' ' || coalesce(apellidos, '')) from empleados where id = new.mesero_nuevo),
             new.motivo),
      jsonb_build_object('visita_id', new.visita_id), new.mesero_nuevo);
  end loop;
  return null;
end;
$$;

create trigger visita_reasignaciones_alerta after insert on public.visita_reasignaciones
  for each row execute function public.alerta_por_reasignacion();

create function public.alerta_por_respuesta()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r reglas_alerta%rowtype;
  c record;
begin
  if new.valor_numerico is null then
    return null;
  end if;
  for r in select * from reglas_alerta where tipo = 'respuesta_critica' and activa and new.valor_numerico <= umbral loop
    select x.mesa, x.mesero, x.mesero_id, x.area_id into c
    from v_encuestas_contexto x where x.respuesta_id = new.respuesta_id;
    perform crear_alerta(r, 'crit:' || new.respuesta_id,
      format('Encuesta con calificación %s en "%s" (mesa %s, atendió %s)',
             new.valor_numerico, (select texto from preguntas where id = new.pregunta_id),
             coalesce(c.mesa::text, '—'), coalesce(c.mesero, '—')),
      jsonb_build_object('respuesta_id', new.respuesta_id), c.mesero_id, c.area_id);
  end loop;
  return null;
end;
$$;

create trigger respuestas_detalle_alerta after insert on public.respuestas_detalle
  for each row execute function public.alerta_por_respuesta();

/* ─── Alertas por umbral (al abrir la app) ────────────────── */

-- Revisa las reglas de umbral del día. Es idempotente: cada alerta tiene una
-- clave (regla + entidad + fecha) y no se repite. Devuelve cuántas creó.
create function public.evaluar_alertas()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  r      reglas_alerta%rowtype;
  x      record;
  v_hoy  date := current_date;
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

/* ─── Atender ─────────────────────────────────────────────── */

create function public.atender_alerta(p_alerta_id uuid, p_nota text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  a alertas%rowtype;
begin
  select * into a from alertas where id = p_alerta_id for update;
  if not found then
    raise exception 'Alerta no encontrada' using errcode = 'no_data_found';
  end if;
  if auth.uid() is not null and not (tiene_rol('admin', 'gerente') or rol_actual() = any (a.destinatarios)) then
    raise exception 'Esta alerta no está dirigida a tu perfil' using errcode = 'insufficient_privilege';
  end if;
  if a.atendida then
    raise exception 'La alerta ya fue atendida' using errcode = 'check_violation';
  end if;
  update alertas
     set atendida = true, atendida_por = auth.uid(), atendida_nombre = nombre_usuario_actual(),
         atendida_at = now(), nota = nullif(trim(coalesce(p_nota, '')), '')
   where id = p_alerta_id;
end;
$$;

/* ─── Seguridad ───────────────────────────────────────────── */

-- Cada quien ve las alertas dirigidas a su perfil; gerente y admin, todas.
drop policy alertas_leer on public.alertas;
drop policy alertas_atender on public.alertas;
create policy alertas_leer on public.alertas for select to authenticated
  using (public.tiene_rol('admin','gerente') or public.rol_actual() = any (destinatarios));

-- Las reglas las leen quienes reciben alertas; las editan gerente y admin (política existente).
drop policy reglas_alerta_leer on public.reglas_alerta;
create policy reglas_alerta_leer on public.reglas_alerta for select to authenticated
  using (public.tiene_rol('admin','gerente') or public.rol_actual() = any (destinatarios));

create trigger alertas_auditoria after update on public.alertas
  for each row execute function public.registrar_auditoria();

revoke execute on function
  public.crear_alerta(public.reglas_alerta, text, text, jsonb, uuid, uuid),
  public.alerta_por_excepcion(),
  public.alerta_por_reasignacion(),
  public.alerta_por_respuesta(),
  public.evaluar_alertas(),
  public.atender_alerta(uuid, text)
from public, anon;
revoke execute on function public.crear_alerta(public.reglas_alerta, text, text, jsonb, uuid, uuid) from authenticated;

grant execute on function public.evaluar_alertas(), public.atender_alerta(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all functions in schema public to service_role;
  end if;
  -- La campana de la barra superior se actualiza en vivo.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.alertas;
  end if;
end;
$$;
