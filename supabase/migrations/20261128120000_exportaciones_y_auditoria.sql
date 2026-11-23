/* ─── Exportaciones controladas y consulta de auditoría ──────
   Contextualización, secciones 10 y 11:
   - Exportar datos es un permiso sensible: solo gerente y admin, y
     cada exportación queda registrada (qué, con qué filtros, cuántas
     filas, quién y cuándo) antes de descargar el archivo.
   - La auditoría se consulta con el nombre de quien hizo el cambio.
   SUPUESTO: la auditoría y el registro de exportaciones solo los
   consulta admin; el plazo de conservación sigue pendiente.
   ──────────────────────────────────────────────────────────── */

create table public.exportaciones (
  id              bigint generated always as identity primary key,
  tipo            text not null,          -- indicadores, encuestas, cierre, auditoria...
  filtros         jsonb,
  filas           int not null default 0,
  usuario_id      uuid default auth.uid(),
  usuario_nombre  text,
  created_at      timestamptz not null default now()
);

create index exportaciones_fecha on public.exportaciones (created_at desc);

alter table public.exportaciones enable row level security;
create policy exportaciones_leer on public.exportaciones for select to authenticated
  using (public.tiene_rol('admin'));

-- La app la llama antes de generar el archivo; si falla, no hay descarga.
create function public.registrar_exportacion(p_tipo text, p_filtros jsonb, p_filas int)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_id bigint;
begin
  if not tiene_rol('admin', 'gerente') then
    raise exception 'No tienes permiso para exportar datos' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_tipo), '') = '' then
    raise exception 'Indica qué se exporta' using errcode = 'check_violation';
  end if;
  insert into exportaciones (tipo, filtros, filas, usuario_nombre)
  values (p_tipo, p_filtros, greatest(coalesce(p_filas, 0), 0), nombre_usuario_actual())
  returning id into v_id;
  return v_id;
end;
$$;

-- Auditoría con el nombre de quien hizo el cambio (la RLS de auditoria sigue aplicando).
create view public.v_auditoria
with (security_invoker = true) as
select a.id, a.tabla, a.registro_id, a.accion, a.usuario_id, u.nombre as usuario_nombre,
       a.antes, a.despues, a.created_at
from auditoria a
left join usuarios u on u.id = a.usuario_id;

revoke all on public.v_auditoria from public, anon;
grant select on public.v_auditoria to authenticated;

revoke execute on function public.registrar_exportacion(text, jsonb, int) from public, anon;
grant execute on function public.registrar_exportacion(text, jsonb, int) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all functions in schema public to service_role;
  end if;
end;
$$;
