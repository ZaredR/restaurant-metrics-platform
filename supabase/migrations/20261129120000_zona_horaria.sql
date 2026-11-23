/* ─── Zona horaria del restaurante ──────────────────────────
   Supabase trabaja en UTC: después de las 18:00 en México su
   current_date ya es el día siguiente. Las reglas que dependen de
   "hoy" usan la fecha local del restaurante.
   ──────────────────────────────────────────────────────────── */

-- SUPUESTO: el restaurante está en la zona centro de México.
insert into public.configuracion (clave, valor, descripcion) values
  ('zona_horaria', '"America/Mexico_City"',
   'Zona horaria del restaurante: define qué fecha es "hoy" para alertas y resúmenes.')
on conflict (clave) do nothing;

create function public.hoy_local()
returns date
language sql stable security definer set search_path = public
as $$
  select (now() at time zone coalesce(
            (select valor #>> '{}' from configuracion where clave = 'zona_horaria'),
            'America/Mexico_City'))::date
$$;

-- Alertas de umbral: el "hoy" del restaurante (antes, current_date en UTC).
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

-- El resumen del día toma por omisión el "hoy" local.
create or replace function public.resumen_del_dia(p_fecha date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_fecha date := coalesce(p_fecha, hoy_local());
begin
  if not tiene_rol('admin', 'gerente', 'capitan', 'supervisor') then
    raise exception 'No tienes permiso para consultar el resumen del día' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'comensales', (select coalesce(sum(v.comensales), 0) from visitas v join roles_diarios r on r.id = v.rol_id
                    where r.fecha = v_fecha and v.estado in ('sentada','cerrada')),
    'mesas_ocupadas', (select count(*) from visitas v join roles_diarios r on r.id = v.rol_id
                        where r.fecha = v_fecha and v.estado = 'sentada'),
    'en_espera', (select count(*) from visitas v join roles_diarios r on r.id = v.rol_id
                   where r.fecha = v_fecha and v.estado = 'espera'),
    'encuestas', (select count(*) from v_encuestas_contexto where fecha = v_fecha),
    'satisfaccion', (select round(avg(promedio), 2) from v_encuestas_contexto where fecha = v_fecha),
    'roles', (select coalesce(jsonb_agg(x order by x.hora_inicio), '[]') from (
        select t.nombre as turno, t.hora_inicio, r.estado,
               (select count(*) from conflictos_rol(r.id)) as conflictos,
               (select count(*) from conflictos_rol(r.id) c where c.severidad = 'error') as bloqueos
        from roles_diarios r join turnos t on t.id = r.turno_id
        where r.fecha = v_fecha) x)
  );
end;
$$;

revoke execute on function public.hoy_local() from public, anon;
grant execute on function public.hoy_local() to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all functions in schema public to service_role;
  end if;
end;
$$;
