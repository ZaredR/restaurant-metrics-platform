/* ════════════════════════════════════════════════════════════
   Dispositivos vinculados (tablets de Hostess y de Encuestas)

   Una tablet del local no necesita la cuenta de una persona:
   gerencia da de alta el dispositivo, genera un enlace de un solo
   uso (vence en 24 h) y lo abre en la tablet. La tablet entra con
   una sesión anónima de Supabase, canjea el enlace y queda
   vinculada con la función del dispositivo:
     - hostess   → recepción (mismos permisos de base que la hostess)
     - encuestas → solo captura de encuestas
   Revocar el dispositivo le quita el acceso al instante.

   Requisito en Supabase: Authentication → Sign In / Providers →
   "Allow anonymous sign-ins" activado.

   Como una sesión anónima también es "authenticated", las lecturas
   que antes estaban abiertas a cualquier sesión ahora piden un
   perfil activo o un dispositivo vinculado.
   ════════════════════════════════════════════════════════════ */

create table public.dispositivos (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (length(trim(nombre)) > 0),
  funcion       text not null check (funcion in ('hostess', 'encuestas')),
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'vinculado', 'revocado')),
  token_hash    text,
  token_expira  timestamptz,
  auth_uid      uuid unique,
  vinculado_at  timestamptz,
  ultimo_uso    timestamptz,
  revocado_at   timestamptz,
  creado_por    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  constraint dispositivos_vinculado_con_sesion check (estado <> 'vinculado' or auth_uid is not null)
);

create index dispositivos_token on public.dispositivos (token_hash) where token_hash is not null;

/* ─── Quién es el usuario actual ─────────────────────────── */

-- Perfil activo de una persona o, si no tiene, la función del dispositivo vinculado.
create or replace function public.rol_actual()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select rol from usuarios where id = auth.uid() and activo),
    (select funcion from dispositivos where auth_uid = auth.uid() and estado = 'vinculado')
  )
$$;

create or replace function public.nombre_usuario_actual()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select nombre from usuarios where id = auth.uid()),
    (select 'Dispositivo: ' || nombre from dispositivos where auth_uid = auth.uid())
  )
$$;

create function public.hash_token_dispositivo(p_token text)
returns text
language sql immutable set search_path = public
as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

/* ─── Alta, enlace, vinculación y revocación ─────────────── */

-- Genera (o renueva, si el anterior venció) el enlace de un dispositivo pendiente.
-- Devuelve el token en claro una sola vez; en la base solo queda su hash.
create function public.generar_enlace_dispositivo(p_dispositivo_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_estado text;
  v_token  text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not tiene_rol('admin', 'gerente') then
    raise exception 'Solo gerencia vincula dispositivos' using errcode = 'insufficient_privilege';
  end if;
  select estado into v_estado from dispositivos where id = p_dispositivo_id for update;
  if v_estado is null then
    raise exception 'Dispositivo no encontrado' using errcode = 'no_data_found';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Solo se genera enlace para un dispositivo pendiente; para cambiar de tablet, revócalo y da de alta uno nuevo'
      using errcode = 'check_violation';
  end if;
  update dispositivos
     set token_hash = hash_token_dispositivo(v_token), token_expira = now() + interval '24 hours'
   where id = p_dispositivo_id;
  return v_token;
end;
$$;

create function public.crear_dispositivo(p_nombre text, p_funcion text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not tiene_rol('admin', 'gerente') then
    raise exception 'Solo gerencia da de alta dispositivos' using errcode = 'insufficient_privilege';
  end if;
  insert into dispositivos (nombre, funcion) values (trim(p_nombre), p_funcion) returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', generar_enlace_dispositivo(v_id));
end;
$$;

-- La tablet, con su sesión anónima, canjea el enlace.
create function public.vincular_dispositivo(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  d dispositivos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Abre el enlace desde la tablet' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from usuarios where id = auth.uid()) then
    raise exception 'Esta sesión es de una persona; cierra sesión antes de vincular la tablet'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from dispositivos where auth_uid = auth.uid()) then
    raise exception 'Esta tablet ya estuvo vinculada; cierra sesión y abre el enlace de nuevo'
      using errcode = 'check_violation';
  end if;

  select * into d from dispositivos
   where token_hash = hash_token_dispositivo(p_token) and estado = 'pendiente'
   for update;
  if not found or d.token_expira < now() then
    raise exception 'El enlace no es válido o ya venció; pide uno nuevo a gerencia' using errcode = 'check_violation';
  end if;

  update dispositivos
     set estado = 'vinculado', auth_uid = auth.uid(), vinculado_at = now(), ultimo_uso = now(),
         token_hash = null, token_expira = null
   where id = d.id;
  return jsonb_build_object('id', d.id, 'nombre', d.nombre, 'funcion', d.funcion);
end;
$$;

-- La tablet confirma al abrir la app que sigue vinculada (null si la revocaron).
create function public.mi_dispositivo()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  d dispositivos%rowtype;
begin
  update dispositivos set ultimo_uso = now()
   where auth_uid = auth.uid() and estado = 'vinculado'
  returning * into d;
  if not found then
    return null;
  end if;
  return jsonb_build_object('id', d.id, 'nombre', d.nombre, 'funcion', d.funcion);
end;
$$;

create function public.revocar_dispositivo(p_dispositivo_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not tiene_rol('admin', 'gerente') then
    raise exception 'Solo gerencia revoca dispositivos' using errcode = 'insufficient_privilege';
  end if;
  update dispositivos
     set estado = 'revocado', revocado_at = now(), token_hash = null, token_expira = null
   where id = p_dispositivo_id and estado <> 'revocado';
  if not found then
    raise exception 'El dispositivo no existe o ya estaba revocado' using errcode = 'no_data_found';
  end if;
end;
$$;

/* ─── Encuestas: también las captura la tablet de encuestas ─── */

create or replace function public.registrar_encuesta(p_visita_id uuid, p_encuesta_id uuid, p_respuestas jsonb, p_comentario text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_estado    text;
  v_id        uuid;
  r           jsonb;
  p           preguntas%rowtype;
  v_num       numeric;
  v_txt       text;
  v_guardadas int := 0;
begin
  if auth.uid() is not null and not tiene_rol('admin', 'gerente', 'capitan', 'supervisor', 'hostess', 'encuestas') then
    raise exception 'No tienes permiso para capturar encuestas' using errcode = 'insufficient_privilege';
  end if;

  select estado into v_estado from visitas where id = p_visita_id;
  if v_estado is null then
    raise exception 'Visita no encontrada' using errcode = 'no_data_found';
  end if;
  if v_estado not in ('sentada','cerrada') then
    raise exception 'Solo se encuesta a una visita que fue atendida' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from encuestas where id = p_encuesta_id and activa) then
    raise exception 'La encuesta no existe o no está activa' using errcode = 'check_violation';
  end if;
  if exists (select 1 from respuestas_encuesta where encuesta_id = p_encuesta_id and visita_id = p_visita_id) then
    raise exception 'Esta visita ya tiene la encuesta capturada' using errcode = 'unique_violation';
  end if;

  insert into respuestas_encuesta (encuesta_id, visita_id, comentario)
  values (p_encuesta_id, p_visita_id, nullif(trim(coalesce(p_comentario, '')), ''))
  returning id into v_id;

  for r in select * from jsonb_array_elements(coalesce(p_respuestas, '[]')) loop
    select * into p from preguntas
     where id = (r->>'pregunta_id')::uuid and encuesta_id = p_encuesta_id and activa;
    if not found then
      raise exception 'Una pregunta no pertenece a la encuesta' using errcode = 'check_violation';
    end if;
    v_num := null;
    v_txt := null;
    if p.tipo = 'escala' then
      v_num := (r->>'valor')::numeric;
      if v_num is null or v_num not in (1, 2, 3, 4, 5) then
        raise exception '"%": la calificación va de 1 a 5', p.texto using errcode = 'check_violation';
      end if;
    elsif p.tipo = 'si_no' then
      v_txt := r->>'valor';
      if v_txt not in ('si','no') then
        raise exception '"%": la respuesta es sí o no', p.texto using errcode = 'check_violation';
      end if;
    else
      v_txt := nullif(trim(coalesce(r->>'valor', '')), '');
      continue when v_txt is null;
    end if;
    insert into respuestas_detalle (respuesta_id, pregunta_id, valor_numerico, valor_texto)
    values (v_id, p.id, v_num, v_txt);
    v_guardadas := v_guardadas + 1;
  end loop;

  if v_guardadas = 0 and nullif(trim(coalesce(p_comentario, '')), '') is null then
    raise exception 'La encuesta está vacía' using errcode = 'check_violation';
  end if;
  return v_id;
end;
$$;

create or replace function public.visitas_sin_encuesta(p_fecha date, p_encuesta_id uuid)
returns table (visita_id uuid, nombre_referencia text, comensales numeric, estado text,
               mesa int, mesero text, turno text, hora_salida timestamptz)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not tiene_rol('admin', 'gerente', 'capitan', 'supervisor', 'hostess', 'encuestas') then
    raise exception 'No tienes permiso para capturar encuestas' using errcode = 'insufficient_privilege';
  end if;
  return query
  select v.id, v.nombre_referencia, v.comensales, v.estado, m.numero,
         trim(e.nombre || ' ' || coalesce(e.apellidos, '')), t.nombre, v.hora_salida
  from visitas v
  join roles_diarios r on r.id = v.rol_id
  join turnos t on t.id = r.turno_id
  left join mesas m on m.id = v.mesa_id
  left join empleados e on e.id = v.mesero_id
  where r.fecha = p_fecha
    and v.estado in ('sentada','cerrada')
    and not exists (select 1 from respuestas_encuesta re
                     where re.visita_id = v.id and re.encuesta_id = p_encuesta_id)
  order by v.estado = 'sentada', v.hora_salida desc nulls last, v.hora_llegada desc;
end;
$$;

/* ─── Auditoría: nombre de la persona o del dispositivo ──── */

create or replace view public.v_auditoria
with (security_invoker = true) as
select a.id, a.tabla, a.registro_id, a.accion, a.usuario_id,
       coalesce(u.nombre, 'Dispositivo: ' || d.nombre) as usuario_nombre,
       a.antes, a.despues, a.created_at
from auditoria a
left join usuarios u on u.id = a.usuario_id
left join dispositivos d on d.auth_uid = a.usuario_id;

/* ─── Lecturas: ya no basta con tener sesión ─────────────── */

do $$
declare
  t text;
begin
  foreach t in array array[
    'restaurantes','configuracion','turnos','areas','estaciones','mesas','encuestas','preguntas'
  ] loop
    execute format('drop policy %I on public.%I', t || '_leer', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.rol_actual() is not null)',
      t || '_leer', t);
  end loop;
end;
$$;

drop policy roles_diarios_leer on public.roles_diarios;
create policy roles_diarios_leer on public.roles_diarios for select to authenticated
  using (public.rol_actual() is not null
         and (estado not in ('borrador','en_revision') or public.tiene_rol('admin','gerente','capitan','supervisor')));

drop policy horarios_semanas_leer on public.horarios_semanas;
create policy horarios_semanas_leer on public.horarios_semanas for select to authenticated
  using (public.rol_actual() is not null);

drop policy funciones_runner_leer on public.funciones_runner;
create policy funciones_runner_leer on public.funciones_runner for select to authenticated
  using (public.rol_actual() is not null);

-- El directorio (solo nombres y puesto) sigue abierto al personal, no a una sesión sin perfil.
create or replace view public.empleados_directorio as
select id, nombre, apellidos, trim(nombre || ' ' || coalesce(apellidos, '')) as nombre_completo, puesto, activo
from public.empleados
where public.rol_actual() is not null;

/* ─── Seguridad de dispositivos ──────────────────────────── */

alter table public.dispositivos enable row level security;

create policy dispositivos_leer on public.dispositivos for select to authenticated
  using (public.tiene_rol('admin', 'gerente'));
-- Altas, enlaces y revocaciones solo por las funciones de arriba.
create policy dispositivos_editar_nombre on public.dispositivos for update to authenticated
  using (public.tiene_rol('admin', 'gerente'))
  with check (public.tiene_rol('admin', 'gerente'));

revoke all on public.dispositivos from public, anon;
grant select on public.dispositivos to authenticated;
grant update (nombre) on public.dispositivos to authenticated;

create trigger dispositivos_auditoria after insert or update or delete on public.dispositivos
  for each row execute function public.registrar_auditoria();

revoke execute on function
  public.hash_token_dispositivo(text),
  public.crear_dispositivo(text, text),
  public.generar_enlace_dispositivo(uuid),
  public.vincular_dispositivo(text),
  public.mi_dispositivo(),
  public.revocar_dispositivo(uuid)
from public, anon;

grant execute on function
  public.crear_dispositivo(text, text),
  public.generar_enlace_dispositivo(uuid),
  public.vincular_dispositivo(text),
  public.mi_dispositivo(),
  public.revocar_dispositivo(uuid)
to authenticated;
