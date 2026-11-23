/* ─── Indicadores operativos ────────────────────────────────
   Contextualización, sección 8. Decisiones del cliente (2026-11-22):
   - Los indicadores reemplazan las ventas de ejemplo de "Métricas".
   - El Dashboard muestra un resumen real del día a gerencia y supervisión.
   - Cada mesero ve solo sus propios indicadores (sin encuestas).

   Las funciones corren como dueño y deciden qué devolver según el perfil:
   gerencia, capitán y supervisor ven todo; un mesero, solo lo suyo.
   ──────────────────────────────────────────────────────────── */

-- Visitas atendidas del periodo; con p_todo = false, solo las del mesero p_yo. Interna.
create function public.ind_visitas(p_desde date, p_hasta date, p_todo boolean, p_yo uuid)
returns setof public.visitas
language sql stable security definer set search_path = public
as $$
  select v.* from visitas v join roles_diarios r on r.id = v.rol_id
  where r.fecha between p_desde and p_hasta
    and v.estado in ('sentada','cerrada')
    and (p_todo or v.mesero_id = p_yo)
$$;

create function public.indicadores(p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_todo  boolean := tiene_rol('admin', 'gerente', 'capitan', 'supervisor');
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
  return v_res || jsonb_build_object(
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
end;
$$;

/* Resumen del día para el Dashboard (gerencia y supervisión). */
create function public.resumen_del_dia(p_fecha date default current_date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not tiene_rol('admin', 'gerente', 'capitan', 'supervisor') then
    raise exception 'No tienes permiso para consultar el resumen del día' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'comensales', (select coalesce(sum(v.comensales), 0) from visitas v join roles_diarios r on r.id = v.rol_id
                    where r.fecha = p_fecha and v.estado in ('sentada','cerrada')),
    'mesas_ocupadas', (select count(*) from visitas v join roles_diarios r on r.id = v.rol_id
                        where r.fecha = p_fecha and v.estado = 'sentada'),
    'en_espera', (select count(*) from visitas v join roles_diarios r on r.id = v.rol_id
                   where r.fecha = p_fecha and v.estado = 'espera'),
    'encuestas', (select count(*) from v_encuestas_contexto where fecha = p_fecha),
    'satisfaccion', (select round(avg(promedio), 2) from v_encuestas_contexto where fecha = p_fecha),
    'roles', (select coalesce(jsonb_agg(x order by x.hora_inicio), '[]') from (
        select t.nombre as turno, t.hora_inicio, r.estado,
               (select count(*) from conflictos_rol(r.id)) as conflictos,
               (select count(*) from conflictos_rol(r.id) c where c.severidad = 'error') as bloqueos
        from roles_diarios r join turnos t on t.id = r.turno_id
        where r.fecha = p_fecha) x)
  );
end;
$$;

revoke execute on function public.indicadores(date, date), public.resumen_del_dia(date),
  public.ind_visitas(date, date, boolean, uuid) from public, anon;
revoke execute on function public.ind_visitas(date, date, boolean, uuid) from authenticated;
grant execute on function public.indicadores(date, date), public.resumen_del_dia(date) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all functions in schema public to service_role;
  end if;
end;
$$;
