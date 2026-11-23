/* ─── Cierre del turno: propuesta de distribución del fondo ──
   Contextualización, sección 7. El sistema no asume una fórmula:
   gerencia (o quien arma el rol) elige en cada cierre el método y
   sus parámetros, el sistema calcula una PROPUESTA y solo gerencia
   la autoriza. Los ajustes llevan motivo y todo queda registrado.

   Métodos:
     proporcional (A)  fondo × comensales de cada quien / total de comensales
     puntos       (B)  meseros: comensales × puntos_por_comensal;
                       capitán, runner y hostess: puntos fijos por turno
     mixto        (C)  un % en partes iguales y el resto por puntos

   Decisiones del cliente (2026-11-22):
   - Los participantes se eligen en cada cierre (por defecto, todo el rol).
   - Solo gerente y admin autorizan.
   - Redondeo a pesos; los pesos que sobran se dan uno por uno a quien
     tiene más carga, así la suma es exactamente el fondo.
   ──────────────────────────────────────────────────────────── */

create table public.cierres (
  id              uuid primary key default gen_random_uuid(),
  rol_id          uuid not null unique references public.roles_diarios(id) on delete cascade,
  fondo           numeric(12,2) not null check (fondo > 0),
  -- Sin valor por defecto a propósito: el método se elige en cada cierre.
  metodo          text not null check (metodo in ('proporcional','puntos','mixto')),
  parametros      jsonb not null default '{}',
  estado          text not null default 'borrador' check (estado in ('borrador','propuesto','autorizado')),
  notas           text,
  preparado_por   uuid default auth.uid() references auth.users(id) on delete set null,
  calculado_at    timestamptz,
  autorizado_por  uuid references auth.users(id) on delete set null,
  autorizado_at   timestamptz,
  created_at      timestamptz not null default now()
);

create table public.cierre_participantes (
  id               uuid primary key default gen_random_uuid(),
  cierre_id        uuid not null references public.cierres(id) on delete cascade,
  empleado_id      uuid not null references public.empleados(id),
  funcion          text not null check (funcion in ('mesero','capitan','runner','hostess')),
  comensales       numeric(8,1) not null default 0,
  puntos           numeric(12,2) not null default 0,
  monto_calculado  numeric(12,2) not null default 0,
  ajuste           numeric(12,2) not null default 0,
  motivo_ajuste    text,
  monto_final      numeric(12,2) generated always as (monto_calculado + ajuste) stored,
  unique (cierre_id, empleado_id),
  check (ajuste = 0 or length(trim(coalesce(motivo_ajuste, ''))) > 0)
);

create table public.cierre_eventos (
  id              bigint generated always as identity primary key,
  cierre_id       uuid not null references public.cierres(id) on delete cascade,
  accion          text not null,     -- preparar, calcular, ajustar, regresar, autorizar, participante
  detalle         jsonb,
  motivo          text,
  usuario_id      uuid default auth.uid(),
  usuario_nombre  text default public.nombre_usuario_actual(),
  created_at      timestamptz not null default now()
);

create index cierre_eventos_cierre on public.cierre_eventos (cierre_id, created_at);

/* ─── Helpers ─────────────────────────────────────────────── */

create function public.cierre_bloquear(p_cierre_id uuid, p_estados text[])
returns public.cierres
language plpgsql security definer set search_path = public
as $$
declare
  v cierres%rowtype;
begin
  select * into v from cierres where id = p_cierre_id for update;
  if not found then
    raise exception 'Cierre no encontrado' using errcode = 'no_data_found';
  end if;
  if not v.estado = any (p_estados) then
    raise exception 'El cierre está %; no se puede hacer esta operación', v.estado
      using errcode = 'check_violation';
  end if;
  return v;
end;
$$;

create function public.cierre_puede_preparar()
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is null or tiene_rol('admin', 'gerente', 'capitan', 'supervisor')
$$;

/* ─── Preparar: fondo, método, parámetros y participantes ─── */

create function public.cierre_preparar(p_rol_id uuid, p_fondo numeric, p_metodo text, p_parametros jsonb default '{}')
returns public.cierres
language plpgsql security definer set search_path = public
as $$
declare
  v_estado_rol text;
  v cierres%rowtype;
  v_pct numeric;
begin
  if not cierre_puede_preparar() then
    raise exception 'No tienes permiso para preparar el cierre' using errcode = 'insufficient_privilege';
  end if;
  select estado into v_estado_rol from roles_diarios where id = p_rol_id;
  if v_estado_rol is null then
    raise exception 'Rol no encontrado' using errcode = 'no_data_found';
  end if;
  if v_estado_rol not in ('publicado','modificado','cerrado') then
    raise exception 'El cierre se prepara sobre un rol publicado' using errcode = 'check_violation';
  end if;
  if p_metodo is null or p_metodo not in ('proporcional','puntos','mixto') then
    raise exception 'Elige el método de distribución' using errcode = 'check_violation';
  end if;
  v_pct := coalesce((p_parametros->>'porcentaje_equitativo')::numeric, 0);
  if p_metodo = 'mixto' and (v_pct <= 0 or v_pct >= 100) then
    raise exception 'En el método mixto, el porcentaje en partes iguales debe estar entre 1 y 99'
      using errcode = 'check_violation';
  end if;

  select * into v from cierres where rol_id = p_rol_id for update;
  if found then
    if v.estado <> 'borrador' then
      raise exception 'El cierre está %; regrésalo a borrador para cambiarlo', v.estado
        using errcode = 'check_violation';
    end if;
    update cierres set fondo = p_fondo, metodo = p_metodo, parametros = coalesce(p_parametros, '{}')
     where id = v.id returning * into v;
  else
    insert into cierres (rol_id, fondo, metodo, parametros)
    values (p_rol_id, p_fondo, p_metodo, coalesce(p_parametros, '{}'))
    returning * into v;
    -- Por defecto entra todo el personal del rol; luego se quitan o agregan personas.
    insert into cierre_participantes (cierre_id, empleado_id, funcion)
    select distinct on (empleado_id) v.id, empleado_id, funcion
    from rol_asignaciones where rol_id = p_rol_id
    order by empleado_id, case funcion when 'mesero' then 0 when 'capitan' then 1 else 2 end;
  end if;

  insert into cierre_eventos (cierre_id, accion, detalle)
  values (v.id, 'preparar', jsonb_build_object('fondo', p_fondo, 'metodo', p_metodo, 'parametros', p_parametros));
  return v;
end;
$$;

create function public.cierre_agregar_participante(p_cierre_id uuid, p_empleado_id uuid, p_funcion text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not cierre_puede_preparar() then
    raise exception 'No tienes permiso para preparar el cierre' using errcode = 'insufficient_privilege';
  end if;
  perform cierre_bloquear(p_cierre_id, array['borrador']);
  insert into cierre_participantes (cierre_id, empleado_id, funcion) values (p_cierre_id, p_empleado_id, p_funcion);
  insert into cierre_eventos (cierre_id, accion, detalle)
  values (p_cierre_id, 'participante', jsonb_build_object('alta', p_empleado_id, 'funcion', p_funcion));
end;
$$;

create function public.cierre_quitar_participante(p_participante_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  p cierre_participantes%rowtype;
begin
  if not cierre_puede_preparar() then
    raise exception 'No tienes permiso para preparar el cierre' using errcode = 'insufficient_privilege';
  end if;
  select * into p from cierre_participantes where id = p_participante_id;
  if not found then
    raise exception 'Participante no encontrado' using errcode = 'no_data_found';
  end if;
  perform cierre_bloquear(p.cierre_id, array['borrador']);
  delete from cierre_participantes where id = p_participante_id;
  insert into cierre_eventos (cierre_id, accion, detalle)
  values (p.cierre_id, 'participante', jsonb_build_object('baja', p.empleado_id, 'funcion', p.funcion));
end;
$$;

/* ─── Calcular la propuesta ───────────────────────────────── */

create function public.cierre_calcular(p_cierre_id uuid)
returns public.cierres
language plpgsql security definer set search_path = public
as $$
declare
  v        cierres%rowtype;
  v_ppc    numeric;
  v_pct    numeric;
  v_n      int;
  v_total  numeric;
  v_equit  numeric;
  v_resto  numeric;
  v_sobra  numeric;
begin
  if not cierre_puede_preparar() then
    raise exception 'No tienes permiso para calcular el cierre' using errcode = 'insufficient_privilege';
  end if;
  v := cierre_bloquear(p_cierre_id, array['borrador','propuesto']);

  -- Contexto "cierre": mesas sin cerrar no tienen responsable final para el cálculo.
  if exists (select 1 from visitas where rol_id = v.rol_id and estado = 'sentada') then
    raise exception 'Hay mesas ocupadas en este turno: libéralas antes de calcular el cierre'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_n from cierre_participantes where cierre_id = v.id;
  if v_n = 0 then
    raise exception 'El cierre no tiene participantes' using errcode = 'check_violation';
  end if;

  v_ppc := coalesce((v.parametros->>'puntos_por_comensal')::numeric, 1);
  v_pct := coalesce((v.parametros->>'porcentaje_equitativo')::numeric, 0);

  -- Comensales de visitas cerradas; cuentan para quien cerró la mesa
  -- (configuracion.reasignacion_conteo = quien_cierra).
  update cierre_participantes p
     set comensales = coalesce((select sum(vi.comensales) from visitas vi
                                 where vi.rol_id = v.rol_id and vi.estado = 'cerrada'
                                   and vi.mesero_id = p.empleado_id), 0),
         ajuste = 0,
         motivo_ajuste = null
   where p.cierre_id = v.id;

  update cierre_participantes p
     set puntos = case
           when v.metodo = 'proporcional' then p.comensales
           when p.funcion = 'mesero' then p.comensales * v_ppc
           else coalesce((v.parametros->'puntos'->>p.funcion)::numeric, 0)
         end
   where p.cierre_id = v.id;

  select sum(puntos) into v_total from cierre_participantes where cierre_id = v.id;
  v_equit := case when v.metodo = 'mixto' then round(v.fondo * v_pct / 100, 2) else 0 end;
  v_resto := v.fondo - v_equit;
  if v_resto > 0 and coalesce(v_total, 0) = 0 then
    raise exception 'No hay % para repartir', case when v.metodo = 'proporcional' then 'comensales' else 'puntos' end
      using errcode = 'check_violation';
  end if;

  -- Monto exacto, redondeado hacia abajo a pesos.
  update cierre_participantes p
     set monto_calculado = floor(v_equit / v_n + case when v_total > 0 then v_resto * p.puntos / v_total else 0 end)
   where p.cierre_id = v.id;

  -- Los pesos que sobran, uno por uno a quien tiene más carga; los centavos, al primero.
  select v.fondo - sum(monto_calculado) into v_sobra from cierre_participantes where cierre_id = v.id;
  with orden as (
    select p.id, row_number() over (order by p.puntos desc, p.comensales desc, e.nombre, e.apellidos) as n
    from cierre_participantes p join empleados e on e.id = p.empleado_id
    where p.cierre_id = v.id
  )
  update cierre_participantes p
     set monto_calculado = p.monto_calculado
           + floor(v_sobra / v_n)
           + case when o.n <= (floor(v_sobra) - floor(v_sobra / v_n) * v_n) then 1 else 0 end
           + case when o.n = 1 then v_sobra - floor(v_sobra) else 0 end
    from orden o
   where o.id = p.id;

  update cierres set estado = 'propuesto', calculado_at = now() where id = v.id returning * into v;
  insert into cierre_eventos (cierre_id, accion, detalle)
  values (v.id, 'calcular', jsonb_build_object('metodo', v.metodo, 'fondo', v.fondo, 'parametros', v.parametros,
                                               'total_puntos', v_total));
  return v;
end;
$$;

/* ─── Ajustes, regreso a borrador y autorización ──────────── */

-- Un ajuste mueve dinero entre personas: para autorizar, la suma de ajustes debe ser 0.
create function public.cierre_ajustar(p_participante_id uuid, p_ajuste numeric, p_motivo text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  p cierre_participantes%rowtype;
begin
  if not cierre_puede_preparar() then
    raise exception 'No tienes permiso para ajustar el cierre' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indica el motivo del ajuste' using errcode = 'check_violation';
  end if;
  select * into p from cierre_participantes where id = p_participante_id;
  if not found then
    raise exception 'Participante no encontrado' using errcode = 'no_data_found';
  end if;
  perform cierre_bloquear(p.cierre_id, array['propuesto']);
  if p.monto_calculado + p_ajuste < 0 then
    raise exception 'El monto final no puede quedar negativo' using errcode = 'check_violation';
  end if;
  update cierre_participantes set ajuste = p_ajuste, motivo_ajuste = trim(p_motivo) where id = p.id;
  insert into cierre_eventos (cierre_id, accion, detalle, motivo)
  values (p.cierre_id, 'ajustar',
          jsonb_build_object('empleado_id', p.empleado_id, 'antes', p.ajuste, 'despues', p_ajuste), trim(p_motivo));
end;
$$;

create function public.cierre_regresar(p_cierre_id uuid)
returns public.cierres
language plpgsql security definer set search_path = public
as $$
declare
  v cierres%rowtype;
begin
  if not cierre_puede_preparar() then
    raise exception 'No tienes permiso para cambiar el cierre' using errcode = 'insufficient_privilege';
  end if;
  perform cierre_bloquear(p_cierre_id, array['propuesto']);
  update cierres set estado = 'borrador' where id = p_cierre_id returning * into v;
  insert into cierre_eventos (cierre_id, accion) values (p_cierre_id, 'regresar');
  return v;
end;
$$;

create function public.cierre_autorizar(p_cierre_id uuid)
returns public.cierres
language plpgsql security definer set search_path = public
as $$
declare
  v       cierres%rowtype;
  v_suma  numeric;
begin
  if auth.uid() is not null and not tiene_rol('admin', 'gerente') then
    raise exception 'Solo gerencia puede autorizar el cierre' using errcode = 'insufficient_privilege';
  end if;
  v := cierre_bloquear(p_cierre_id, array['propuesto']);
  select sum(monto_final) into v_suma from cierre_participantes where cierre_id = v.id;
  if v_suma is distinct from v.fondo then
    raise exception 'La suma de los montos (%) no coincide con el fondo (%): revisa los ajustes', v_suma, v.fondo
      using errcode = 'check_violation';
  end if;
  update cierres set estado = 'autorizado', autorizado_por = auth.uid(), autorizado_at = now()
   where id = v.id returning * into v;
  insert into cierre_eventos (cierre_id, accion, detalle)
  values (v.id, 'autorizar', jsonb_build_object('fondo', v.fondo));
  return v;
end;
$$;

/* ─── Seguridad ───────────────────────────────────────────── */

-- Solo lectura por la API: todo cambio pasa por las funciones de arriba.
alter table public.cierres enable row level security;
alter table public.cierre_participantes enable row level security;
alter table public.cierre_eventos enable row level security;

-- security definer: las dos políticas se consultan entre sí y sin esto
-- Postgres detectaría recursión infinita.
create function public.participo_en_cierre_autorizado(p_cierre_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from cierre_participantes p join cierres c on c.id = p.cierre_id
                  where p.cierre_id = p_cierre_id and c.estado = 'autorizado'
                    and p.empleado_id = mi_empleado_id())
$$;

create policy cierres_leer on public.cierres for select to authenticated
  using (public.tiene_rol('admin','gerente','capitan','supervisor')
         or public.participo_en_cierre_autorizado(id));

-- Cada quien ve solo su propio monto, y solo ya autorizado.
create policy cierre_participantes_leer on public.cierre_participantes for select to authenticated
  using (public.tiene_rol('admin','gerente','capitan','supervisor')
         or (empleado_id = public.mi_empleado_id() and public.participo_en_cierre_autorizado(cierre_id)));

create policy cierre_eventos_leer on public.cierre_eventos for select to authenticated
  using (public.tiene_rol('admin','gerente','capitan','supervisor'));

create trigger cierres_auditoria after insert or update or delete on public.cierres
  for each row execute function public.registrar_auditoria();
create trigger cierre_participantes_auditoria after insert or update or delete on public.cierre_participantes
  for each row execute function public.registrar_auditoria();

revoke execute on function
  public.cierre_bloquear(uuid, text[]),
  public.cierre_puede_preparar(),
  public.cierre_preparar(uuid, numeric, text, jsonb),
  public.cierre_agregar_participante(uuid, uuid, text),
  public.cierre_quitar_participante(uuid),
  public.cierre_calcular(uuid),
  public.cierre_ajustar(uuid, numeric, text),
  public.cierre_regresar(uuid),
  public.cierre_autorizar(uuid),
  public.participo_en_cierre_autorizado(uuid)
from public, anon;

revoke execute on function public.cierre_bloquear(uuid, text[]), public.cierre_puede_preparar() from authenticated;

grant execute on function
  public.cierre_preparar(uuid, numeric, text, jsonb),
  public.cierre_agregar_participante(uuid, uuid, text),
  public.cierre_quitar_participante(uuid),
  public.cierre_calcular(uuid),
  public.cierre_ajustar(uuid, numeric, text),
  public.cierre_regresar(uuid),
  public.cierre_autorizar(uuid),
  public.participo_en_cierre_autorizado(uuid)
to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all functions in schema public to service_role;
  end if;
end;
$$;
