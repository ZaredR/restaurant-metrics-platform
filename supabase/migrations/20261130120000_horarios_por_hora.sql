/* ─── Horarios por hora y publicación de la semana ──────────
   Tomado de la versión piloto del equipo y de la contextualización
   (3.1, "disponibilidad por fecha y turno"; ejemplo: "de 16:00 a cierre"):
   - Un horario puede llevar hora de inicio y de fin (10:00–18:00).
     El turno se deduce de las horas (el que más se traslapa), así el
     rol diario y los conflictos siguen funcionando igual.
   - La semana se publica: el personal solo ve su horario de semanas
     publicadas; quien programa ve también los borradores.
   ──────────────────────────────────────────────────────────── */

alter table public.horarios
  add column hora_inicio time,
  add column hora_fin    time,
  add constraint horarios_horas_completas check ((hora_inicio is null) = (hora_fin is null)),
  add constraint horarios_horas_distintas check (hora_inicio is null or hora_inicio <> hora_fin),
  add constraint horarios_descanso_sin_horas check (not es_descanso or hora_inicio is null);

/* Minutos que se traslapan dos horarios del mismo día; un fin menor que el
   inicio cruza la medianoche (por ejemplo 18:00–01:00). Interna. */
create function public.minutos_traslape(a_ini time, a_fin time, b_ini time, b_fin time)
returns int
language sql immutable set search_path = public
as $$
  with r as (
    select extract(epoch from a_ini) / 60 as a1,
           extract(epoch from a_fin) / 60 + case when a_fin <= a_ini then 1440 else 0 end as a2,
           extract(epoch from b_ini) / 60 as b1,
           extract(epoch from b_fin) / 60 + case when b_fin <= b_ini then 1440 else 0 end as b2
  )
  select greatest(0, least(a2, b2) - greatest(a1, b1))::int from r
$$;

-- Con horas y sin turno: el turno es el que más se traslapa.
create function public.derivar_turno_horario()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.hora_inicio is not null and new.turno_id is null then
    select t.id into new.turno_id
    from turnos t
    where t.activo and minutos_traslape(new.hora_inicio, new.hora_fin, t.hora_inicio, t.hora_fin) > 0
    order by minutos_traslape(new.hora_inicio, new.hora_fin, t.hora_inicio, t.hora_fin) desc, t.hora_inicio
    limit 1;
    if new.turno_id is null then
      raise exception 'El horario % a % no coincide con ningún turno', to_char(new.hora_inicio, 'HH24:MI'), to_char(new.hora_fin, 'HH24:MI')
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger horarios_derivar_turno
  before insert or update on public.horarios
  for each row execute function public.derivar_turno_horario();

/* ─── Semanas publicadas ──────────────────────────────────── */

create table public.horarios_semanas (
  semana         date primary key check (extract(isodow from semana) = 1),  -- el lunes
  estado         text not null default 'borrador' check (estado in ('borrador','publicada')),
  publicado_por  uuid references auth.users(id) on delete set null,
  publicado_at   timestamptz
);

alter table public.horarios_semanas enable row level security;
create policy horarios_semanas_leer on public.horarios_semanas for select to authenticated using (true);

create function public.semana_publicada(p_fecha date)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from horarios_semanas
                  where semana = p_fecha - (extract(isodow from p_fecha)::int - 1) and estado = 'publicada')
$$;

-- Publicar (o regresar a borrador) la semana que empieza en p_lunes.
create function public.publicar_semana(p_lunes date, p_publicar boolean default true)
returns public.horarios_semanas
language plpgsql security definer set search_path = public
as $$
declare
  v horarios_semanas%rowtype;
begin
  if auth.uid() is not null and not tiene_rol('admin', 'gerente', 'rrhh') then
    raise exception 'Solo gerencia y RR. HH. publican los horarios' using errcode = 'insufficient_privilege';
  end if;
  if extract(isodow from p_lunes) <> 1 then
    raise exception 'La semana se indica con su lunes' using errcode = 'invalid_parameter_value';
  end if;
  insert into horarios_semanas (semana, estado, publicado_por, publicado_at)
  values (p_lunes, case when p_publicar then 'publicada' else 'borrador' end,
          case when p_publicar then auth.uid() end, case when p_publicar then now() end)
  on conflict (semana) do update
    set estado = excluded.estado, publicado_por = excluded.publicado_por, publicado_at = excluded.publicado_at
  returning * into v;
  return v;
end;
$$;

-- El personal ve su horario solo en semanas publicadas; quien programa ve todo.
drop policy horarios_leer on public.horarios;
create policy horarios_leer on public.horarios for select to authenticated
  using (public.tiene_rol('admin','gerente','rrhh','capitan','supervisor')
         or (empleado_id = public.mi_empleado_id() and public.semana_publicada(fecha)));

create trigger horarios_semanas_auditoria after insert or update or delete on public.horarios_semanas
  for each row execute function public.registrar_auditoria();

revoke execute on function
  public.minutos_traslape(time, time, time, time),
  public.derivar_turno_horario(),
  public.semana_publicada(date),
  public.publicar_semana(date, boolean)
from public, anon;
grant execute on function public.semana_publicada(date), public.publicar_semana(date, boolean) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all functions in schema public to service_role;
  end if;
end;
$$;
