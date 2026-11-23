/* ─── Encuestas: captura y resultados ───────────────────────
   Contextualización, sección 8. Decisiones del cliente (2026-11-22):
   - La captura la hace el personal en tablet (sin QR por ahora).
   - Cada encuesta queda ligada a la visita: de ahí salen mesa,
     mesero, capitán, área y turno. El cliente no se identifica.
   - Los resultados por mesero los consultan gerencia, capitán y
     supervisor; los meseros no ven resultados.
   ──────────────────────────────────────────────────────────── */

/* ─── Registrar una encuesta completa ─────────────────────── */

-- Una sola llamada guarda la respuesta y su detalle: la hostess puede
-- capturar pero no leer respuestas, así que no podría insertar el detalle
-- por separado. p_respuestas: [{"pregunta_id": "...", "valor": 5 | "si" | "texto"}]
create function public.registrar_encuesta(p_visita_id uuid, p_encuesta_id uuid, p_respuestas jsonb, p_comentario text default null)
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
  if auth.uid() is not null and not tiene_rol('admin', 'gerente', 'capitan', 'supervisor', 'hostess') then
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

/* ─── Visitas sin encuesta (para capturar) ─────────────────── */

-- La hostess no puede leer respuestas; esta función solo dice qué visitas faltan.
create function public.visitas_sin_encuesta(p_fecha date, p_encuesta_id uuid)
returns table (visita_id uuid, nombre_referencia text, comensales numeric, estado text,
               mesa int, mesero text, turno text, hora_salida timestamptz)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not tiene_rol('admin', 'gerente', 'capitan', 'supervisor', 'hostess') then
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

/* ─── Preguntas con respuestas: no cambian de sentido ─────── */

-- Cambiar el texto o el tipo de una pregunta ya contestada alteraría el
-- historial; se desactiva y se crea otra.
create function public.proteger_pregunta_respondida()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if (new.texto is distinct from old.texto or new.tipo is distinct from old.tipo or new.encuesta_id <> old.encuesta_id)
     and exists (select 1 from respuestas_detalle where pregunta_id = old.id) then
    raise exception 'La pregunta ya tiene respuestas: desactívala y crea una nueva'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger preguntas_proteger_respondida
  before update on public.preguntas
  for each row execute function public.proteger_pregunta_respondida();

/* ─── Resultados ──────────────────────────────────────────── */

-- Cada respuesta a cada pregunta con su contexto operativo (para promedios
-- por pregunta, mesero, área y turno). Respeta la RLS de quien consulta.
create view public.v_encuestas_detalle
with (security_invoker = true) as
select d.id,
       c.respuesta_id,
       c.encuesta_id,
       c.fecha,
       c.turno,
       c.mesa,
       c.area_id,
       c.area,
       c.mesero_id,
       c.mesero,
       p.id      as pregunta_id,
       p.texto   as pregunta,
       p.tipo,
       p.orden,
       d.valor_numerico,
       d.valor_texto
from respuestas_detalle d
join preguntas p on p.id = d.pregunta_id
join v_encuestas_contexto c on c.respuesta_id = d.respuesta_id;

revoke all on public.v_encuestas_detalle from public, anon;
grant select on public.v_encuestas_detalle to authenticated;

/* ─── Permisos ────────────────────────────────────────────── */

revoke execute on function
  public.registrar_encuesta(uuid, uuid, jsonb, text),
  public.visitas_sin_encuesta(date, uuid),
  public.proteger_pregunta_respondida()
from public, anon;

grant execute on function
  public.registrar_encuesta(uuid, uuid, jsonb, text),
  public.visitas_sin_encuesta(date, uuid)
to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all functions in schema public to service_role;
  end if;
end;
$$;
