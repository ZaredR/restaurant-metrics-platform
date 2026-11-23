/* ─── Pruebas de reglas de negocio ──────────────────────────
   Requieren las migraciones y seed.sql aplicados. Todo corre
   en una transacción que se revierte al final.
   Ejecutar:  psql "$DATABASE_URL" -f supabase/tests/reglas_operativas.sql
   Cada prueba imprime "OK ..." o aborta con el error.
   ──────────────────────────────────────────────────────────── */

begin;

create function pg_temp.empleado(p_num text) returns uuid
language sql as $$ select id from public.empleados where numero_empleado = p_num $$;

create function pg_temp.mesa(p_num int) returns uuid
language sql as $$ select id from public.mesas where numero = p_num $$;

create function pg_temp.rol_hoy() returns uuid
language sql as $$
  select r.id from public.roles_diarios r
  join public.turnos t on t.id = r.turno_id
  where r.fecha = current_date and t.nombre = 'Vespertino'
$$;

-- Las funciones nuevas ya no se pueden ejecutar por defecto (ver seguridad_rls.sql);
-- las pruebas 11 y 12 las llaman como usuarios con sesión.
grant execute on function pg_temp.empleado(text), pg_temp.mesa(int), pg_temp.rol_hoy() to authenticated;

-- Sin las restricciones de ejemplo del seed: la prueba 14 crea las suyas.
delete from public.empleado_autorizaciones;
delete from public.empleado_restricciones;

-- El seed usa current_date; las reglas usan el "hoy" del restaurante (hoy_local).
-- Para que las pruebas pasen a cualquier hora, ambos usan la zona de esta sesión.
update public.configuracion set valor = to_jsonb(current_setting('TimeZone')) where clave = 'zona_horaria';

/* 1. No se programa a alguien con ausencia aprobada */
do $$
begin
  begin
    insert into public.horarios (empleado_id, fecha, turno_id)
    select pg_temp.empleado('E010'), current_date, id from public.turnos where nombre = 'Vespertino';
    raise exception 'FALLO 1: se programó a un empleado de vacaciones';
  exception when check_violation then
    raise notice 'OK 1: horario bloqueado por vacaciones';
  end;
end $$;

/* 2. Tampoco se le asigna al rol del día */
do $$
begin
  begin
    insert into public.rol_asignaciones (rol_id, empleado_id, funcion, area_id)
    select pg_temp.rol_hoy(), pg_temp.empleado('E010'), 'runner', id from public.areas where nombre = 'Bar';
    raise exception 'FALLO 2: se asignó al rol a un empleado de vacaciones';
  exception when check_violation then
    raise notice 'OK 2: asignación al rol bloqueada por vacaciones';
  end;
end $$;

/* 3. Con ausencias_bloquean = false solo se advierte (se permite) */
do $$
begin
  update public.configuracion set valor = 'false' where clave = 'ausencias_bloquean';
  -- El rol de hoy está publicado: el cambio necesita motivo.
  perform set_config('app.motivo_ajuste', 'Prueba 3', true);
  insert into public.rol_asignaciones (rol_id, empleado_id, funcion, area_id)
  select pg_temp.rol_hoy(), pg_temp.empleado('E010'), 'runner', id from public.areas where nombre = 'Bar';
  delete from public.rol_asignaciones where rol_id = pg_temp.rol_hoy() and empleado_id = pg_temp.empleado('E010');
  update public.configuracion set valor = 'true' where clave = 'ausencias_bloquean';
  perform set_config('app.motivo_ajuste', '', true);
  raise notice 'OK 3: con la configuración en false la asignación se permite';
end $$;

/* 4. La mesa identifica estación, área, mesero y capitán; comensales = adultos + niños * 0.5 */
do $$
declare
  v public.visitas%rowtype;
begin
  insert into public.visitas (rol_id, nombre_referencia, adultos, ninos, mesa_id)
  values (pg_temp.rol_hoy(), 'Prueba 4', 2, 1, pg_temp.mesa(7))
  returning * into v;

  if v.comensales <> 2.5 then
    raise exception 'FALLO 4: comensales = %, se esperaba 2.5', v.comensales;
  end if;
  if v.mesero_id <> pg_temp.empleado('E007') or v.capitan_id <> pg_temp.empleado('E003') then
    raise exception 'FALLO 4: mesero o capitán incorrectos';
  end if;
  if v.estado <> 'sentada' or v.hora_sentada is null then
    raise exception 'FALLO 4: la visita no quedó sentada';
  end if;
  raise notice 'OK 4: mesa 7 → Salón B → María González / Carlos López, 2.5 comensales';
end $$;

/* 5. Una mesa no puede tener dos visitas sentadas */
do $$
begin
  begin
    insert into public.visitas (rol_id, nombre_referencia, adultos, mesa_id)
    values (pg_temp.rol_hoy(), 'Prueba 5', 2, pg_temp.mesa(7));
    raise exception 'FALLO 5: se sentó a dos visitas en la misma mesa';
  exception when unique_violation then
    raise notice 'OK 5: mesa ocupada rechazada';
  end;
end $$;

/* 6. Al cerrar la visita se registra la salida y la mesa se libera */
do $$
declare
  v_salida timestamptz;
begin
  update public.visitas set estado = 'cerrada' where nombre_referencia = 'Prueba 4'
  returning hora_salida into v_salida;
  if v_salida is null then
    raise exception 'FALLO 6: no se registró la hora de salida';
  end if;
  insert into public.visitas (rol_id, nombre_referencia, adultos, mesa_id)
  values (pg_temp.rol_hoy(), 'Prueba 6', 2, pg_temp.mesa(7));
  raise notice 'OK 6: visita cerrada con hora de salida y mesa reutilizada';
end $$;

/* 7. No se asignan mesas en un rol que no está publicado */
do $$
declare
  v_rol uuid;
begin
  insert into public.roles_diarios (fecha, turno_id)
  select current_date, id from public.turnos where nombre = 'Matutino'
  returning id into v_rol;
  begin
    insert into public.visitas (rol_id, nombre_referencia, adultos, mesa_id)
    values (v_rol, 'Prueba 7', 2, pg_temp.mesa(1));
    raise exception 'FALLO 7: se asignó mesa en un rol en borrador';
  exception when check_violation then
    raise notice 'OK 7: rol en borrador rechazado';
  end;
end $$;

/* 8. publicar_rol exige meseros y cambia el estado */
do $$
declare
  v_rol uuid := (select r.id from public.roles_diarios r join public.turnos t on t.id = r.turno_id
                  where r.fecha = current_date and t.nombre = 'Matutino');
begin
  begin
    perform public.publicar_rol(v_rol);
    raise exception 'FALLO 8: se publicó un rol sin meseros';
  exception when check_violation then null;
  end;
  insert into public.rol_asignaciones (rol_id, empleado_id, funcion, estacion_id)
  select v_rol, pg_temp.empleado('E011'), 'mesero', id from public.estaciones where nombre = 'Salón A';
  if (public.publicar_rol(v_rol)).estado <> 'publicado' then
    raise exception 'FALLO 8: el rol no quedó publicado';
  end if;
  raise notice 'OK 8: publicar_rol valida meseros y publica';
end $$;

/* 8b. Un rol cerrado no admite cambios ni bajas */
do $$
declare
  v_rol uuid := (select r.id from public.roles_diarios r join public.turnos t on t.id = r.turno_id
                  where r.fecha = current_date and t.nombre = 'Matutino');
begin
  perform public.cerrar_rol(v_rol);
  begin
    delete from public.rol_asignaciones where rol_id = v_rol;
    raise exception 'FALLO 8b: se borró una asignación de un rol cerrado';
  exception when check_violation then null;
  end;
  begin
    update public.rol_asignaciones set es_cierre = true where rol_id = v_rol;
    raise exception 'FALLO 8b: se modificó una asignación de un rol cerrado';
  exception when check_violation then null;
  end;
  raise notice 'OK 8b: rol cerrado protegido';
end $$;

/* 9. Orden de salida: meseros de cierre por área, de menos a más comensales */
do $$
declare
  v_mal int;
begin
  select count(*) into v_mal
  from (
    select comensales,
           lag(comensales) over (partition by rol_id, area_id order by orden) as anterior
    from public.v_orden_salida
    where rol_id = pg_temp.rol_hoy()
  ) x
  where anterior > comensales;
  if v_mal > 0 then
    raise exception 'FALLO 9: el orden de salida no va de menos a más comensales';
  end if;
  if exists (select 1 from public.v_orden_salida o
             where o.rol_id = pg_temp.rol_hoy() and o.empleado_id = pg_temp.empleado('E012')) then
    raise exception 'FALLO 9: aparece un mesero que no es de cierre';
  end if;
  raise notice 'OK 9: orden de salida correcto';
end $$;

/* 10. Auditoría: los cambios quedan registrados */
do $$
begin
  if not exists (select 1 from public.auditoria where tabla = 'visitas' and accion = 'UPDATE') then
    raise exception 'FALLO 10: no hay registro de auditoría del cambio de visita';
  end if;
  raise notice 'OK 10: auditoría registra cambios';
end $$;

/* 11. Permisos (RLS): hostess registra visitas pero no edita el catálogo */
do $$
declare
  v_hostess uuid := gen_random_uuid();
  v_mesero  uuid := gen_random_uuid();
  v_filas   int;
begin
  insert into auth.users (id, email) values
    (v_hostess, 'hostess.prueba@demo.com'), (v_mesero, 'mesero.prueba@demo.com');
  insert into public.usuarios (id, nombre, email, rol, empleado_id) values
    (v_hostess, 'Fernanda Cruz', 'hostess.prueba@demo.com', 'hostess', pg_temp.empleado('E015')),
    (v_mesero,  'Diego Ruiz',    'mesero.prueba@demo.com',  'mesero',  pg_temp.empleado('E006'));

  perform set_config('request.jwt.claim.sub', v_hostess::text, true);
  set local role authenticated;

  insert into public.visitas (rol_id, nombre_referencia, adultos, mesa_id)
  values (pg_temp.rol_hoy(), 'Prueba 11', 2, pg_temp.mesa(1));

  begin
    insert into public.areas (nombre) values ('Área no autorizada');
    raise exception 'FALLO 11: la hostess pudo crear un área';
  exception when insufficient_privilege then null;
  end;

  select count(*) into v_filas from public.ausencias;
  if v_filas <> 0 then
    raise exception 'FALLO 11: la hostess ve ausencias ajenas';
  end if;

  reset role;
  perform set_config('request.jwt.claim.sub', v_mesero::text, true);
  set local role authenticated;

  begin
    insert into public.visitas (rol_id, nombre_referencia, adultos)
    values (pg_temp.rol_hoy(), 'Prueba 11b', 2);
    raise exception 'FALLO 11: un mesero pudo registrar visitas';
  exception when insufficient_privilege then null;
  end;

  select count(*) into v_filas from public.auditoria;
  if v_filas <> 0 then
    raise exception 'FALLO 11: un mesero ve la auditoría';
  end if;

  reset role;
  raise notice 'OK 11: permisos por rol aplicados';
end $$;

/* 12. Privacidad: sin sesión no hay acceso; cada rol ve solo lo que necesita */
do $$
declare
  v_hostess uuid := (select id from auth.users where email = 'hostess.prueba@demo.com');
  v_mesero  uuid := (select id from auth.users where email = 'mesero.prueba@demo.com');
  v_capitan uuid := gen_random_uuid();
  v_n       int;
  v_txt     text;
begin
  -- Sin sesión (anon): ni funciones con datos del personal ni el directorio.
  if has_function_privilege('anon', 'public.empleados_disponibles(date, uuid)', 'execute')
     or has_function_privilege('anon', 'public.ausencia_en(uuid, date)', 'execute')
     or has_table_privilege('anon', 'public.empleados_directorio', 'select') then
    raise exception 'FALLO 12: anon puede consultar datos del personal';
  end if;
  -- Las funciones internas tampoco se llaman directo con sesión.
  if has_function_privilege('authenticated', 'public.ausencia_en(uuid, date)', 'execute') then
    raise exception 'FALLO 12: un usuario puede consultar ausencias con ausencia_en()';
  end if;

  -- Un rol en borrador para mañana: solo lo deben ver quienes lo arman.
  insert into public.roles_diarios (fecha, turno_id)
  select current_date + 1, id from public.turnos where nombre = 'Vespertino';

  insert into auth.users (id, email) values (v_capitan, 'capitan.prueba@demo.com');
  insert into public.usuarios (id, nombre, email, rol, empleado_id)
  values (v_capitan, 'Carlos López', 'capitan.prueba@demo.com', 'capitan', pg_temp.empleado('E003'));

  /* Mesero */
  perform set_config('request.jwt.claim.sub', v_mesero::text, true);
  set local role authenticated;

  select count(*) into v_n from public.empleados;
  if v_n <> 1 then raise exception 'FALLO 12: el mesero ve datos de % empleados (solo debe ver los suyos)', v_n; end if;

  select count(*) into v_n from public.empleados_directorio;
  if v_n = 0 then raise exception 'FALLO 12: el mesero no ve los nombres de sus compañeros'; end if;

  select count(distinct empleado_id) into v_n from public.horarios;
  if v_n <> 1 then raise exception 'FALLO 12: el mesero ve horarios de otros'; end if;

  select count(*) into v_n from public.roles_diarios where estado = 'borrador';
  if v_n <> 0 then raise exception 'FALLO 12: el mesero ve roles en borrador'; end if;

  select count(*) into v_n from public.rol_asignaciones;
  if v_n = 0 then raise exception 'FALLO 12: el mesero no ve el rol publicado'; end if;

  select count(*) into v_n from public.visitas where mesero_id is distinct from pg_temp.empleado('E006');
  if v_n <> 0 then raise exception 'FALLO 12: el mesero ve visitas de otros meseros'; end if;

  begin
    perform * from public.empleados_disponibles(current_date);
    raise exception 'FALLO 12: el mesero consultó la disponibilidad (revela ausencias)';
  exception when insufficient_privilege then null;
  end;
  reset role;

  /* Hostess: ve al mesero de cada mesa por el directorio */
  perform set_config('request.jwt.claim.sub', v_hostess::text, true);
  set local role authenticated;
  select count(*) into v_n from public.v_mesas_asignadas where rol_id = pg_temp.rol_hoy() and mesero is null;
  if v_n <> 0 then raise exception 'FALLO 12: la hostess no ve el nombre del mesero de % mesas', v_n; end if;
  select count(*) into v_n from public.empleados;
  if v_n > 1 then raise exception 'FALLO 12: la hostess ve los datos de contacto de todos'; end if;
  reset role;

  /* Capitán: arma el rol con la disponibilidad y las reglas siguen aplicando */
  perform set_config('request.jwt.claim.sub', v_capitan::text, true);
  set local role authenticated;
  select ausencia into v_txt from public.empleados_disponibles(current_date)
   where empleado_id = pg_temp.empleado('E010');
  if v_txt is distinct from 'vacaciones' then
    raise exception 'FALLO 12: el capitán no ve la disponibilidad';
  end if;
  begin
    insert into public.rol_asignaciones (rol_id, empleado_id, funcion, area_id)
    select pg_temp.rol_hoy(), pg_temp.empleado('E010'), 'runner', id from public.areas where nombre = 'Bar';
    raise exception 'FALLO 12: el capitán asignó a alguien de vacaciones';
  exception when check_violation then null;
  end;
  select count(*) into v_n from public.roles_diarios where estado = 'borrador';
  if v_n = 0 then raise exception 'FALLO 12: el capitán no ve los roles en borrador'; end if;
  reset role;

  raise notice 'OK 12: privacidad por rol aplicada';
end $$;

/* 13. Ajustes al rol y reasignaciones con motivo */
do $$
declare
  v_capitan uuid := (select id from auth.users where email = 'capitan.prueba@demo.com');
  v_hostess uuid := (select id from auth.users where email = 'hostess.prueba@demo.com');
  v_gerente uuid := gen_random_uuid();
  v_rol     uuid;
  v_asig    uuid;
  v_visita  uuid;
  v_n       int;
  v_txt     text;
begin
  insert into auth.users (id, email) values (v_gerente, 'gerente.prueba@demo.com');
  insert into public.usuarios (id, nombre, email, rol, empleado_id)
  values (v_gerente, 'Ana García', 'gerente.prueba@demo.com', 'gerente', pg_temp.empleado('E001'));

  /* Rol publicado: sin motivo no se cambia; con motivo queda registrado y pasa a "modificado" */
  v_asig := (select id from public.rol_asignaciones
              where rol_id = pg_temp.rol_hoy() and empleado_id = pg_temp.empleado('E006'));

  perform set_config('request.jwt.claim.sub', v_capitan::text, true);
  set local role authenticated;

  begin
    update public.rol_asignaciones set es_cierre = false where id = v_asig;
    raise exception 'FALLO 13: se cambió un rol publicado sin motivo';
  exception when check_violation then null;
  end;

  perform public.rol_ajustar('cambio', v_asig, '{"es_cierre": false}', 'Diego sale temprano');
  select estado into v_txt from public.roles_diarios where id = pg_temp.rol_hoy();
  if v_txt <> 'modificado' then raise exception 'FALLO 13: el rol no pasó a modificado (%)', v_txt; end if;
  select count(*) into v_n from public.rol_ajustes
   where rol_id = pg_temp.rol_hoy() and accion = 'cambio' and motivo = 'Diego sale temprano'
     and usuario_nombre = 'Carlos López';
  if v_n <> 1 then raise exception 'FALLO 13: el ajuste no quedó registrado'; end if;

  begin
    perform public.rol_ajustar('baja', v_asig, null, '   ');
    raise exception 'FALLO 13: se aceptó un motivo vacío';
  exception when check_violation then null;
  end;

  /* Flujo: el capitán propone (envía a revisión) pero no publica */
  insert into public.roles_diarios (fecha, turno_id)
  select current_date + 2, id from public.turnos where nombre = 'Vespertino'
  returning id into v_rol;
  insert into public.rol_asignaciones (rol_id, empleado_id, funcion, estacion_id)
  select v_rol, pg_temp.empleado('E007'), 'mesero', id from public.estaciones where nombre = 'Salón A';

  begin
    perform public.publicar_rol(v_rol);
    raise exception 'FALLO 13: el capitán publicó el rol';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.roles_diarios set estado = 'publicado' where id = v_rol;
    raise exception 'FALLO 13: el capitán publicó el rol cambiando el estado directo';
  exception when insufficient_privilege then null;
  end;

  perform public.enviar_rol_a_revision(v_rol);
  begin
    insert into public.rol_asignaciones (rol_id, empleado_id, funcion, estacion_id)
    select v_rol, pg_temp.empleado('E009'), 'mesero', id from public.estaciones where nombre = 'Salón B';
    raise exception 'FALLO 13: se cambió un rol en revisión';
  exception when check_violation then null;
  end;
  reset role;

  /* Un rol en revisión no lo ve la hostess */
  perform set_config('request.jwt.claim.sub', v_hostess::text, true);
  set local role authenticated;
  select count(*) into v_n from public.roles_diarios where id = v_rol;
  if v_n <> 0 then raise exception 'FALLO 13: la hostess ve un rol en revisión'; end if;

  /* La hostess no reasigna mesas */
  v_visita := (select id from public.visitas where nombre_referencia = 'Familia Rojas');
  begin
    perform public.reasignar_visita(v_visita, pg_temp.empleado('E007'), 'Prueba');
    raise exception 'FALLO 13: la hostess reasignó una mesa';
  exception when insufficient_privilege then null;
  end;
  -- Tampoco cambiando al mesero directamente
  begin
    update public.visitas set mesero_id = pg_temp.empleado('E007') where id = v_visita;
    raise exception 'FALLO 13: se cambió al responsable sin dejar registro';
  exception when check_violation then null;
  end;
  reset role;

  /* El gerente aprueba y publica */
  perform set_config('request.jwt.claim.sub', v_gerente::text, true);
  set local role authenticated;
  if (public.publicar_rol(v_rol)).estado <> 'publicado' then
    raise exception 'FALLO 13: el gerente no pudo publicar';
  end if;
  reset role;

  /* El capitán transfiere la mesa 4 de Diego a María, sin moverla */
  perform set_config('request.jwt.claim.sub', v_capitan::text, true);
  set local role authenticated;
  perform public.reasignar_visita(v_visita, pg_temp.empleado('E007'), 'Diego salió de turno');
  reset role;

  if (select mesero_id from public.visitas where id = v_visita) <> pg_temp.empleado('E007')
     or (select mesa_id from public.visitas where id = v_visita) <> pg_temp.mesa(4) then
    raise exception 'FALLO 13: la reasignación no cambió al responsable o movió la mesa';
  end if;
  select count(*) into v_n from public.visita_reasignaciones
   where visita_id = v_visita and tipo = 'reasignacion'
     and mesero_anterior = pg_temp.empleado('E006') and motivo = 'Diego salió de turno';
  if v_n <> 1 then raise exception 'FALLO 13: la reasignación no quedó registrada'; end if;

  -- Los comensales cuentan para quien cierra (María), ya no para Diego.
  if not exists (select 1 from public.visitas v
                  join public.v_comensales_mesero c on c.empleado_id = v.mesero_id and c.rol_id = v.rol_id
                 where v.id = v_visita and c.empleado_id = pg_temp.empleado('E007')) then
    raise exception 'FALLO 13: los comensales no se cuentan al nuevo responsable';
  end if;

  /* Cambiar de mesa a otra estación también registra el cambio de responsable */
  update public.visitas set mesa_id = pg_temp.mesa(24) where id = v_visita;
  select count(*) into v_n from public.visita_reasignaciones
   where visita_id = v_visita and tipo = 'cambio_mesa' and mesero_nuevo = pg_temp.empleado('E008');
  if v_n <> 1 then raise exception 'FALLO 13: el cambio de mesa no registró al nuevo responsable'; end if;

  raise notice 'OK 13: ajustes y reasignaciones con motivo';
end $$;

/* 14. Disponibilidad: estado del empleado, autorizaciones, restricciones y estado de mesas */
do $$
declare
  v_capitan uuid := (select id from auth.users where email = 'capitan.prueba@demo.com');
  v_hostess uuid := (select id from auth.users where email = 'hostess.prueba@demo.com');
  v_mesero  uuid := (select id from auth.users where email = 'mesero.prueba@demo.com');
  v_rol     uuid;
  v_asig    uuid;
  v_n       int;
  v_txt     text;
  v_salon_a uuid := (select id from public.estaciones where nombre = 'Salón A');
  v_terr_a  uuid := (select id from public.estaciones where nombre = 'Terraza A');
begin
  /* El estado manda sobre "activo" y un suspendido no entra al rol */
  update public.empleados set estado = 'suspendido' where numero_empleado = 'E011';
  if (select activo from public.empleados where numero_empleado = 'E011') then
    raise exception 'FALLO 14: suspendido sigue activo';
  end if;

  insert into public.roles_diarios (fecha, turno_id)
  select current_date + 3, id from public.turnos where nombre = 'Vespertino'
  returning id into v_rol;

  begin
    insert into public.rol_asignaciones (rol_id, empleado_id, funcion, estacion_id)
    values (v_rol, pg_temp.empleado('E011'), 'mesero', v_salon_a);
    raise exception 'FALLO 14: se asignó a un empleado suspendido';
  exception when check_violation then null;
  end;

  update public.empleados set activo = true where numero_empleado = 'E011';
  if (select estado from public.empleados where numero_empleado = 'E011') <> 'activo' then
    raise exception 'FALLO 14: activar no regresó el estado a activo';
  end if;

  /* Autorizaciones: Ana Martínez solo puede trabajar en Salón A */
  insert into public.empleado_autorizaciones (empleado_id, estacion_id)
  values (pg_temp.empleado('E009'), v_salon_a);

  begin
    insert into public.rol_asignaciones (rol_id, empleado_id, funcion, estacion_id)
    values (v_rol, pg_temp.empleado('E009'), 'mesero', v_terr_a);
    raise exception 'FALLO 14: se asignó fuera de su estación sin motivo';
  exception when sqlstate 'RA001' then
    get stacked diagnostics v_txt = message_text;
    if v_txt not like '%no está autorizado para la estación Terraza A%' then
      raise exception 'FALLO 14: mensaje inesperado: %', v_txt;
    end if;
  end;

  -- Con motivo se permite y queda registrado.
  perform public.rol_ajustar('alta', null,
    jsonb_build_object('rol_id', v_rol, 'empleado_id', pg_temp.empleado('E009'),
                       'funcion', 'mesero', 'estacion_id', v_terr_a),
    'Falta personal en terraza');
  select count(*) into v_n from public.rol_excepciones
   where rol_id = v_rol and empleado_id = pg_temp.empleado('E009') and motivo = 'Falta personal en terraza';
  if v_n <> 1 then raise exception 'FALLO 14: la excepción no quedó registrada'; end if;

  -- En su estación autorizada no hay advertencia.
  insert into public.rol_asignaciones (rol_id, empleado_id, funcion, estacion_id)
  values (v_rol, pg_temp.empleado('E011'), 'mesero', v_salon_a)
  returning id into v_asig;

  /* Restricciones: Paola no cubre cierre; una restricción vencida no aplica */
  insert into public.empleado_restricciones (empleado_id, tipo) values (pg_temp.empleado('E011'), 'no_cierre');
  insert into public.empleado_restricciones (empleado_id, tipo, fecha_inicio, fecha_fin, descripcion)
  values (pg_temp.empleado('E011'), 'otra', current_date - 10, current_date - 5, 'Restricción vencida');

  begin
    update public.rol_asignaciones set es_cierre = true where id = v_asig;
    raise exception 'FALLO 14: se marcó de cierre a quien no puede';
  exception when sqlstate 'RA001' then null;
  end;
  -- Cambios que no agregan advertencias no piden motivo.
  update public.rol_asignaciones set es_cierre = false where id = v_asig;

  /* Conflictos: el capitán los consulta; el mesero no */
  perform set_config('request.jwt.claim.sub', v_capitan::text, true);
  set local role authenticated;
  select count(*) into v_n from public.conflictos_rol(v_rol)
   where tipo = 'restriccion' and descripcion like 'Ana Martínez no está autorizado%';
  if v_n <> 1 then raise exception 'FALLO 14: falta el conflicto de autorización'; end if;
  select count(*) into v_n from public.conflictos_rol(v_rol)
   where tipo = 'cobertura' and descripcion = 'La estación Bar A no tiene mesero responsable';
  if v_n <> 1 then raise exception 'FALLO 14: falta la estación sin mesero'; end if;
  select count(*) into v_n from public.conflictos_rol(v_rol) where descripcion = 'El turno no tiene runner asignado';
  if v_n <> 1 then raise exception 'FALLO 14: falta el aviso de runner'; end if;
  -- El capitán puede leer restricciones, pero no registrarlas.
  begin
    insert into public.empleado_restricciones (empleado_id, tipo) values (pg_temp.empleado('E006'), 'no_cierre');
    raise exception 'FALLO 14: el capitán registró una restricción';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', v_mesero::text, true);
  set local role authenticated;
  begin
    perform * from public.conflictos_rol(v_rol);
    raise exception 'FALLO 14: un mesero consultó conflictos';
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_n from public.empleado_restricciones;
  if v_n <> 0 then raise exception 'FALLO 14: un mesero ve restricciones'; end if;
  begin
    perform public.cambiar_estado_mesa(pg_temp.mesa(42), 'fuera_servicio');
    raise exception 'FALLO 14: un mesero cambió el estado de una mesa';
  exception when insufficient_privilege then null;
  end;
  reset role;

  /* Mesas: la hostess cambia el estado; no se sienta a nadie en una mesa no disponible */
  perform set_config('request.jwt.claim.sub', v_hostess::text, true);
  set local role authenticated;
  perform public.cambiar_estado_mesa(pg_temp.mesa(42), 'fuera_servicio');
  begin
    insert into public.visitas (rol_id, nombre_referencia, adultos, mesa_id)
    values (pg_temp.rol_hoy(), 'Prueba 14', 2, pg_temp.mesa(42));
    raise exception 'FALLO 14: se sentó a alguien en una mesa fuera de servicio';
  exception when check_violation then null;
  end;

  -- Una mesa reservada se puede sentar y la reserva se consume.
  perform public.cambiar_estado_mesa(pg_temp.mesa(42), 'reservada');
  insert into public.visitas (rol_id, nombre_referencia, adultos, mesa_id)
  values (pg_temp.rol_hoy(), 'Prueba 14', 2, pg_temp.mesa(42));
  if (select estado from public.mesas where numero = 42) <> 'disponible' then
    raise exception 'FALLO 14: la reserva no se consumió';
  end if;

  -- Ocupada no cambia de estado.
  begin
    perform public.cambiar_estado_mesa(pg_temp.mesa(42), 'en_limpieza');
    raise exception 'FALLO 14: se cambió el estado de una mesa ocupada';
  exception when check_violation then null;
  end;
  reset role;

  /* Con limpieza_al_cerrar, al cerrar la visita la mesa pasa a limpieza */
  update public.configuracion set valor = 'true' where clave = 'limpieza_al_cerrar';
  update public.visitas set estado = 'cerrada' where nombre_referencia = 'Prueba 14';
  if (select estado from public.mesas where numero = 42) <> 'en_limpieza' then
    raise exception 'FALLO 14: la mesa no pasó a limpieza';
  end if;
  update public.configuracion set valor = 'false' where clave = 'limpieza_al_cerrar';

  raise notice 'OK 14: disponibilidad, restricciones y estado de mesas';
end $$;

/* 15. Cierre: propuesta A/B/C, redondeo exacto, ajustes con motivo y autorización de gerencia */
do $$
declare
  v_capitan uuid := (select id from auth.users where email = 'capitan.prueba@demo.com');
  v_gerente uuid := (select id from auth.users where email = 'gerente.prueba@demo.com');
  v_mesero  uuid := (select id from auth.users where email = 'mesero.prueba@demo.com');
  v_cierre  uuid;
  v_p1      uuid;
  v_p2      uuid;
  v_n       int;
  v_suma    numeric;
begin
  perform set_config('request.jwt.claim.sub', v_capitan::text, true);
  set local role authenticated;

  /* Sin método no hay cierre: el sistema no asume fórmula */
  begin
    perform public.cierre_preparar(pg_temp.rol_hoy(), 1000, null, '{}');
    raise exception 'FALLO 15: se preparó un cierre sin método';
  exception when check_violation then null;
  end;

  v_cierre := (public.cierre_preparar(pg_temp.rol_hoy(), 1000, 'proporcional', '{}')).id;
  select count(*) into v_n from public.cierre_participantes where cierre_id = v_cierre;
  if v_n <> (select count(distinct empleado_id) from public.rol_asignaciones where rol_id = pg_temp.rol_hoy()) then
    raise exception 'FALLO 15: no entró todo el personal del rol (%)', v_n;
  end if;

  -- Nadie escribe directo en las tablas del cierre.
  begin
    update public.cierres set estado = 'autorizado' where id = v_cierre;
    get diagnostics v_n = row_count;
    if v_n > 0 then raise exception 'FALLO 15: el capitán autorizó cambiando el estado'; end if;
  exception when insufficient_privilege then null;
  end;

  /* Con mesas ocupadas no se calcula */
  begin
    perform public.cierre_calcular(v_cierre);
    raise exception 'FALLO 15: se calculó con mesas ocupadas';
  exception when check_violation then null;
  end;
  reset role;
  update public.visitas set estado = 'cerrada' where rol_id = pg_temp.rol_hoy() and estado = 'sentada';

  /* A: proporcional por comensales; la suma es exactamente el fondo y en pesos enteros */
  perform set_config('request.jwt.claim.sub', v_capitan::text, true);
  set local role authenticated;
  perform public.cierre_calcular(v_cierre);
  select sum(monto_final) into v_suma from public.cierre_participantes where cierre_id = v_cierre;
  if v_suma <> 1000 then raise exception 'FALLO 15: la suma (A) es % y no 1000', v_suma; end if;
  if exists (select 1 from public.cierre_participantes where cierre_id = v_cierre
              and (monto_final <> trunc(monto_final)
                   or (funcion <> 'mesero' and monto_final <> 0))) then
    raise exception 'FALLO 15: montos con centavos o personal sin comensales con monto (A)';
  end if;
  -- Cada monto difiere del exacto en menos de un peso.
  if exists (select 1 from public.cierre_participantes p
              where cierre_id = v_cierre and comensales > 0
                and abs(monto_final - 1000 * comensales
                        / (select sum(comensales) from public.cierre_participantes where cierre_id = v_cierre)) >= 1) then
    raise exception 'FALLO 15: un monto se aleja del proporcional (A)';
  end if;

  /* C: mixto 30 % en partes iguales; runners con puntos fijos; fondo con centavos */
  perform public.cierre_regresar(v_cierre);
  perform public.cierre_preparar(pg_temp.rol_hoy(), 1000.50, 'mixto',
    '{"porcentaje_equitativo": 30, "puntos_por_comensal": 1, "puntos": {"runner": 10}}');
  perform public.cierre_calcular(v_cierre);
  select sum(monto_final), count(*) into v_suma, v_n from public.cierre_participantes where cierre_id = v_cierre;
  if v_suma <> 1000.50 then raise exception 'FALLO 15: la suma (C) es % y no 1000.50', v_suma; end if;
  if exists (select 1 from public.cierre_participantes where cierre_id = v_cierre and monto_final < floor(300.15 / v_n)) then
    raise exception 'FALLO 15: alguien recibió menos que la parte igual (C)';
  end if;
  if (select min(monto_final) from public.cierre_participantes where cierre_id = v_cierre and funcion = 'runner')
     <= (select max(monto_final) from public.cierre_participantes where cierre_id = v_cierre and funcion = 'hostess') then
    raise exception 'FALLO 15: los puntos del runner no cuentan (C)';
  end if;

  /* Ajustes: con motivo, y la suma debe volver al fondo para autorizar */
  select id into v_p1 from public.cierre_participantes where cierre_id = v_cierre and empleado_id = pg_temp.empleado('E006');
  select id into v_p2 from public.cierre_participantes where cierre_id = v_cierre and empleado_id = pg_temp.empleado('E007');
  begin
    perform public.cierre_ajustar(v_p1, 50, '');
    raise exception 'FALLO 15: ajuste sin motivo';
  exception when check_violation then null;
  end;
  perform public.cierre_ajustar(v_p1, 50, 'Cubrió la estación de María');

  begin
    perform public.cierre_autorizar(v_cierre);
    raise exception 'FALLO 15: el capitán autorizó el cierre';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', v_gerente::text, true);
  set local role authenticated;
  begin
    perform public.cierre_autorizar(v_cierre);
    raise exception 'FALLO 15: se autorizó con la suma descuadrada';
  exception when check_violation then null;
  end;
  perform public.cierre_ajustar(v_p2, -50, 'Cubrió Diego parte del turno');
  if (public.cierre_autorizar(v_cierre)).estado <> 'autorizado' then
    raise exception 'FALLO 15: el gerente no pudo autorizar';
  end if;
  begin
    perform public.cierre_ajustar(v_p1, 0, 'Cambio tardío');
    raise exception 'FALLO 15: se cambió un cierre autorizado';
  exception when check_violation then null;
  end;
  select count(*) into v_n from public.cierre_eventos where cierre_id = v_cierre and accion = 'ajustar';
  if v_n <> 2 then raise exception 'FALLO 15: los ajustes no quedaron registrados (%)', v_n; end if;
  reset role;

  /* Privacidad: el mesero ve solo su monto autorizado y no el historial */
  perform set_config('request.jwt.claim.sub', v_mesero::text, true);
  set local role authenticated;
  select count(*) into v_n from public.cierre_participantes;
  if v_n <> 1 or (select empleado_id from public.cierre_participantes) <> pg_temp.empleado('E006') then
    raise exception 'FALLO 15: el mesero ve montos ajenos (%)', v_n;
  end if;
  select count(*) into v_n from public.cierre_eventos;
  if v_n <> 0 then raise exception 'FALLO 15: el mesero ve el historial del cierre'; end if;
  begin
    perform public.cierre_preparar(pg_temp.rol_hoy(), 1, 'puntos', '{}');
    raise exception 'FALLO 15: un mesero preparó un cierre';
  exception when insufficient_privilege then null;
  end;
  reset role;

  raise notice 'OK 15: cierre con propuesta, ajustes con motivo y autorización';
end $$;

/* 16. Encuestas: captura completa por la hostess, validaciones y privacidad de resultados */
do $$
declare
  v_capitan  uuid := (select id from auth.users where email = 'capitan.prueba@demo.com');
  v_hostess  uuid := (select id from auth.users where email = 'hostess.prueba@demo.com');
  v_mesero   uuid := (select id from auth.users where email = 'mesero.prueba@demo.com');
  v_encuesta uuid := (select id from public.encuestas where nombre = 'Satisfacción general');
  v_atencion uuid := (select id from public.preguntas where texto = 'Atención del mesero');
  v_espera   uuid := (select id from public.preguntas where texto = 'Tiempo de espera');
  v_coment   uuid := (select id from public.preguntas where texto = 'Comentarios');
  v_visita   uuid;
  v_otra     uuid;
  v_resp     uuid;
  v_n        int;
begin
  insert into public.visitas (rol_id, nombre_referencia, adultos, mesa_id)
  values (pg_temp.rol_hoy(), 'Prueba 16', 3, pg_temp.mesa(2)) returning id into v_visita;
  update public.visitas set estado = 'cerrada' where id = v_visita;
  insert into public.visitas (rol_id, nombre_referencia, adultos)
  values (pg_temp.rol_hoy(), 'Prueba 16 espera', 2) returning id into v_otra;

  perform set_config('request.jwt.claim.sub', v_hostess::text, true);
  set local role authenticated;

  /* La hostess ve qué visitas faltan, sin ver respuestas */
  select count(*) into v_n from public.visitas_sin_encuesta(current_date, v_encuesta) where visita_id = v_visita;
  if v_n <> 1 then raise exception 'FALLO 16: la visita no aparece como pendiente'; end if;
  select count(*) into v_n from public.visitas_sin_encuesta(current_date, v_encuesta) where visita_id = v_otra;
  if v_n <> 0 then raise exception 'FALLO 16: una visita en espera aparece para encuestar'; end if;

  begin
    perform public.registrar_encuesta(v_visita, v_encuesta,
      jsonb_build_array(jsonb_build_object('pregunta_id', v_atencion, 'valor', 7)), null);
    raise exception 'FALLO 16: se aceptó una calificación de 7';
  exception when check_violation then null;
  end;
  begin
    perform public.registrar_encuesta(v_otra, v_encuesta,
      jsonb_build_array(jsonb_build_object('pregunta_id', v_atencion, 'valor', 5)), null);
    raise exception 'FALLO 16: se encuestó una visita en espera';
  exception when check_violation then null;
  end;
  begin
    perform public.registrar_encuesta(v_visita, v_encuesta, '[]', '  ');
    raise exception 'FALLO 16: se guardó una encuesta vacía';
  exception when check_violation then null;
  end;

  v_resp := public.registrar_encuesta(v_visita, v_encuesta, jsonb_build_array(
    jsonb_build_object('pregunta_id', v_atencion, 'valor', 5),
    jsonb_build_object('pregunta_id', v_espera, 'valor', 2),
    jsonb_build_object('pregunta_id', v_coment, 'valor', 'Tardó la cuenta')), null);

  begin
    perform public.registrar_encuesta(v_visita, v_encuesta,
      jsonb_build_array(jsonb_build_object('pregunta_id', v_atencion, 'valor', 4)), null);
    raise exception 'FALLO 16: se capturó dos veces la misma encuesta';
  exception when unique_violation then null;
  end;

  select count(*) into v_n from public.v_encuestas_detalle;
  if v_n <> 0 then raise exception 'FALLO 16: la hostess ve resultados'; end if;
  reset role;

  /* El capitán ve los resultados con su contexto */
  perform set_config('request.jwt.claim.sub', v_capitan::text, true);
  set local role authenticated;
  select count(*) into v_n from public.v_encuestas_detalle
   where respuesta_id = v_resp and mesa = 2 and mesero = 'Diego Ruiz';
  if v_n <> 3 then raise exception 'FALLO 16: el detalle no tiene contexto (%)', v_n; end if;
  if (select promedio from public.v_encuestas_contexto where respuesta_id = v_resp) <> 3.5 then
    raise exception 'FALLO 16: el promedio debe ser 3.5 (el texto no cuenta)';
  end if;
  reset role;

  /* El mesero no captura ni consulta */
  perform set_config('request.jwt.claim.sub', v_mesero::text, true);
  set local role authenticated;
  begin
    perform public.registrar_encuesta(v_visita, v_encuesta, '[]', 'x');
    raise exception 'FALLO 16: un mesero capturó una encuesta';
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_n from public.v_encuestas_detalle;
  if v_n <> 0 then raise exception 'FALLO 16: un mesero ve resultados'; end if;
  reset role;

  /* Una pregunta contestada no cambia de texto; sí se puede desactivar */
  begin
    update public.preguntas set texto = 'Otra cosa' where id = v_atencion;
    raise exception 'FALLO 16: se cambió el texto de una pregunta con respuestas';
  exception when check_violation then null;
  end;
  update public.preguntas set activa = false where id = v_atencion;

  raise notice 'OK 16: encuestas';
end $$;

/* 17. Indicadores: gerencia ve todo; el mesero solo lo suyo; la hostess nada */
do $$
declare
  v_capitan uuid := (select id from auth.users where email = 'capitan.prueba@demo.com');
  v_hostess uuid := (select id from auth.users where email = 'hostess.prueba@demo.com');
  v_mesero  uuid := (select id from auth.users where email = 'mesero.prueba@demo.com');
  v_total   numeric := (select sum(v.comensales) from public.visitas v join public.roles_diarios r on r.id = v.rol_id
                         where r.fecha = current_date and v.estado in ('sentada','cerrada'));
  v_diego   numeric := (select sum(v.comensales) from public.visitas v join public.roles_diarios r on r.id = v.rol_id
                         where r.fecha = current_date and v.estado in ('sentada','cerrada')
                           and v.mesero_id = pg_temp.empleado('E006'));
  j         jsonb;
begin
  perform set_config('request.jwt.claim.sub', v_capitan::text, true);
  set local role authenticated;
  j := public.indicadores(current_date, current_date);
  if j->>'alcance' <> 'todo' or (j->'resumen'->>'comensales')::numeric <> v_total then
    raise exception 'FALLO 17: resumen de gerencia incorrecto (% vs %)', j->'resumen'->>'comensales', v_total;
  end if;
  if (select sum((x->>'comensales')::numeric) from jsonb_array_elements(j->'por_area') x) <> v_total then
    raise exception 'FALLO 17: la suma por área no coincide con el total';
  end if;
  if not exists (select 1 from jsonb_array_elements(j->'por_mesero') x where x->>'mesero' = 'Diego Ruiz') then
    raise exception 'FALLO 17: falta Diego en por_mesero';
  end if;
  if j->'rol'->>'publicados' is null or j->'satisfaccion'->>'encuestas' is null then
    raise exception 'FALLO 17: faltan rol o satisfacción';
  end if;
  j := public.resumen_del_dia(current_date);
  if jsonb_array_length(j->'roles') < 1 or (j->'roles'->0->>'conflictos') is null then
    raise exception 'FALLO 17: el resumen del día no trae los roles con conflictos';
  end if;
  begin
    perform public.indicadores(current_date - 400, current_date);
    raise exception 'FALLO 17: se aceptó un periodo de más de un año';
  exception when invalid_parameter_value then null;
  end;
  reset role;

  /* El mesero: solo lo suyo, sin comparativos ni encuestas */
  perform set_config('request.jwt.claim.sub', v_mesero::text, true);
  set local role authenticated;
  j := public.indicadores(current_date, current_date);
  if j->>'alcance' <> 'propio' or (j->'resumen'->>'comensales')::numeric <> coalesce(v_diego, 0) then
    raise exception 'FALLO 17: el mesero no ve solo lo suyo (% vs %)', j->'resumen'->>'comensales', v_diego;
  end if;
  if j ? 'por_mesero' or j ? 'satisfaccion' or j ? 'por_area' then
    raise exception 'FALLO 17: el mesero ve datos de compañeros o encuestas';
  end if;
  begin
    perform public.resumen_del_dia(current_date);
    raise exception 'FALLO 17: el mesero consultó el resumen del día';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', v_hostess::text, true);
  set local role authenticated;
  begin
    perform public.indicadores(current_date, current_date);
    raise exception 'FALLO 17: la hostess consultó indicadores';
  exception when insufficient_privilege then null;
  end;
  reset role;

  raise notice 'OK 17: indicadores';
end $$;

/* 18. Alertas: eventos al momento, umbrales sin duplicar, destinatarios por perfil y atención */
do $$
declare
  v_capitan uuid := (select id from auth.users where email = 'capitan.prueba@demo.com');
  v_gerente uuid := (select id from auth.users where email = 'gerente.prueba@demo.com');
  v_mesero  uuid := (select id from auth.users where email = 'mesero.prueba@demo.com');
  v_n       int;
  v_alerta  uuid;
begin
  /* Las de evento ya existen: reasignación (prueba 13), excepción (14) y respuesta crítica (16) */
  if not exists (select 1 from public.alertas a join public.reglas_alerta r on r.id = a.regla_id where r.tipo = 'reasignacion_mesa')
     or not exists (select 1 from public.alertas a join public.reglas_alerta r on r.id = a.regla_id where r.tipo = 'asignacion_excepcion')
     or not exists (select 1 from public.alertas a join public.reglas_alerta r on r.id = a.regla_id where r.tipo = 'respuesta_critica') then
    raise exception 'FALLO 18: faltan alertas de evento';
  end if;

  /* Umbrales: saturación con límite 1 y una estación sin mesero en el rol de hoy */
  update public.reglas_alerta set umbral = 1 where tipo = 'saturacion_mesero';
  perform set_config('app.motivo_ajuste', 'Prueba 18', true);
  delete from public.rol_asignaciones
   where rol_id = pg_temp.rol_hoy() and estacion_id = (select id from public.estaciones where nombre = 'Bar A');
  perform set_config('app.motivo_ajuste', '', true);

  perform set_config('request.jwt.claim.sub', v_capitan::text, true);
  set local role authenticated;
  v_n := public.evaluar_alertas();
  if v_n < 2 then raise exception 'FALLO 18: la evaluación creó % alertas', v_n; end if;
  if public.evaluar_alertas() <> 0 then raise exception 'FALLO 18: la evaluación duplicó alertas'; end if;

  -- El capitán ve saturación y estación sin mesero, pero no la reasignación (es del supervisor)
  -- ni la excepción (es de gerencia).
  select count(*) into v_n from public.alertas where mensaje like 'La estación Bar A no tiene mesero%';
  if v_n <> 1 then raise exception 'FALLO 18: falta la estación sin mesero (%)', v_n; end if;
  select id into v_alerta from public.alertas where mensaje like '%comensales en el turno%(límite 1)' limit 1;
  if v_alerta is null then raise exception 'FALLO 18: falta la alerta de saturación'; end if;
  select count(*) into v_n from public.alertas where mensaje like 'Mesa % pasó de %' or mensaje like '%con excepción%';
  if v_n <> 0 then raise exception 'FALLO 18: el capitán ve alertas que no son para su perfil'; end if;

  perform public.atender_alerta(v_alerta, 'Se mandó apoyo de terraza');
  if not (select atendida and nota = 'Se mandó apoyo de terraza' and atendida_nombre = 'Carlos López'
            from public.alertas where id = v_alerta) then
    raise exception 'FALLO 18: la atención no quedó registrada';
  end if;
  begin
    perform public.atender_alerta(v_alerta, null);
    raise exception 'FALLO 18: se atendió dos veces';
  exception when check_violation then null;
  end;
  reset role;

  select a.id into v_alerta from public.alertas a join public.reglas_alerta r on r.id = a.regla_id
   where r.tipo = 'reasignacion_mesa' limit 1;
  perform set_config('request.jwt.claim.sub', v_capitan::text, true);
  set local role authenticated;
  begin
    perform public.atender_alerta(v_alerta, null);
    raise exception 'FALLO 18: el capitán atendió una alerta del supervisor';
  exception when insufficient_privilege then null;
  end;
  reset role;

  /* Gerencia ve todas; el mesero ninguna */
  perform set_config('request.jwt.claim.sub', v_gerente::text, true);
  set local role authenticated;
  select count(*) into v_n from public.alertas;
  if v_n < 5 then raise exception 'FALLO 18: gerencia no ve todas las alertas (%)', v_n; end if;
  reset role;

  perform set_config('request.jwt.claim.sub', v_mesero::text, true);
  set local role authenticated;
  select count(*) into v_n from public.alertas;
  if v_n <> 0 then raise exception 'FALLO 18: el mesero ve alertas'; end if;
  begin
    update public.alertas set atendida = true;
    get diagnostics v_n = row_count;
    if v_n > 0 then raise exception 'FALLO 18: el mesero modificó alertas'; end if;
  exception when insufficient_privilege then null;
  end;
  reset role;

  raise notice 'OK 18: alertas';
end $$;

/* 19. Usuarios: invitaciones, perfil analista y protecciones */
do $$
declare
  v_gerente  uuid := (select id from auth.users where email = 'gerente.prueba@demo.com');
  v_mesero   uuid := (select id from auth.users where email = 'mesero.prueba@demo.com');
  v_nuevo    uuid := gen_random_uuid();
  v_existe   uuid := gen_random_uuid();
  v_txt      text;
  j          jsonb;
begin
  perform set_config('request.jwt.claim.sub', v_gerente::text, true);
  set local role authenticated;

  /* Invitación: el perfil se crea solo cuando la cuenta existe */
  v_txt := public.invitar_usuario(' Analista@Prueba.com ', 'Paty Analista', 'analista', null);
  if v_txt <> 'invitacion' then raise exception 'FALLO 19: resultado de invitación %', v_txt; end if;
  begin
    perform public.invitar_usuario('jefe@prueba.com', 'Jefe', 'admin', null);
    raise exception 'FALLO 19: un gerente invitó a un administrador';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.invitar_usuario('mesero.prueba@demo.com', 'Otro', 'mesero', null);
    raise exception 'FALLO 19: se invitó un correo que ya tiene usuario';
  exception when unique_violation then null;
  end;
  reset role;

  insert into auth.users (id, email) values (v_nuevo, 'analista@prueba.com');
  if not exists (select 1 from public.usuarios where id = v_nuevo and rol = 'analista' and nombre = 'Paty Analista') then
    raise exception 'FALLO 19: la cuenta nueva no recibió su perfil';
  end if;

  -- Si la cuenta ya existía, el perfil se crea al invitar.
  insert into auth.users (id, email) values (v_existe, 'yaexiste@prueba.com');
  perform set_config('request.jwt.claim.sub', v_gerente::text, true);
  set local role authenticated;
  if public.invitar_usuario('yaexiste@prueba.com', 'Ya Existe', 'runner', null) <> 'perfil_creado' then
    raise exception 'FALLO 19: no se creó el perfil de una cuenta existente';
  end if;

  /* Protecciones */
  begin
    update public.usuarios set rol = 'admin' where id = v_gerente;
    raise exception 'FALLO 19: el gerente se subió a administrador';
  exception when check_violation or insufficient_privilege then null;
  end;
  begin
    update public.usuarios set activo = false where id = v_gerente;
    raise exception 'FALLO 19: el gerente se desactivó a sí mismo';
  exception when check_violation then null;
  end;
  begin
    delete from public.usuarios where id = v_mesero;
    raise exception 'FALLO 19: se borró un usuario';
  exception when check_violation then null;
  end;
  update public.usuarios set activo = false where id = v_mesero;
  reset role;

  -- Desactivado: ya no tiene perfil efectivo.
  perform set_config('request.jwt.claim.sub', v_mesero::text, true);
  set local role authenticated;
  begin
    perform public.indicadores(current_date, current_date);
    raise exception 'FALLO 19: un usuario desactivado consultó indicadores';
  exception when insufficient_privilege then null;
  end;
  reset role;

  /* Analista: indicadores generales, sin desempeño individual ni datos personales */
  perform set_config('request.jwt.claim.sub', v_nuevo::text, true);
  set local role authenticated;
  j := public.indicadores(current_date, current_date);
  if j->>'alcance' <> 'general' or j ? 'por_mesero' or not j ? 'por_area' then
    raise exception 'FALLO 19: el analista no ve los indicadores generales correctos';
  end if;
  if (select count(*) from public.empleados) <> 0 or (select count(*) from public.ausencias) <> 0 then
    raise exception 'FALLO 19: el analista ve datos personales';
  end if;
  begin
    insert into public.areas (nombre) values ('Área del analista');
    raise exception 'FALLO 19: el analista modificó el catálogo';
  exception when insufficient_privilege then null;
  end;
  reset role;

  update public.usuarios set activo = true where id = v_mesero;
  raise notice 'OK 19: usuarios y perfiles';
end $$;

/* 20. Exportaciones: solo gerencia, siempre registradas; auditoría legible solo para admin */
do $$
declare
  v_gerente uuid := (select id from auth.users where email = 'gerente.prueba@demo.com');
  v_capitan uuid := (select id from auth.users where email = 'capitan.prueba@demo.com');
  v_admin   uuid := gen_random_uuid();
  v_n       int;
begin
  perform set_config('request.jwt.claim.sub', '', true);  -- sin sesión, como en el SQL Editor
  insert into auth.users (id, email) values (v_admin, 'admin.prueba@demo.com');
  insert into public.usuarios (id, nombre, email, rol) values (v_admin, 'Admin Prueba', 'admin.prueba@demo.com', 'admin');

  perform set_config('request.jwt.claim.sub', v_gerente::text, true);
  set local role authenticated;
  perform public.registrar_exportacion('indicadores', '{"desde": "2026-11-01"}', 12);
  select count(*) into v_n from public.exportaciones;
  if v_n <> 0 then raise exception 'FALLO 20: el gerente ve el registro de exportaciones'; end if;
  select count(*) into v_n from public.v_auditoria;
  if v_n <> 0 then raise exception 'FALLO 20: el gerente ve la auditoría'; end if;
  reset role;

  perform set_config('request.jwt.claim.sub', v_capitan::text, true);
  set local role authenticated;
  begin
    perform public.registrar_exportacion('encuestas', null, 5);
    raise exception 'FALLO 20: el capitán exportó datos';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  if not exists (select 1 from public.exportaciones
                  where tipo = 'indicadores' and filas = 12 and usuario_nombre = 'Ana García') then
    raise exception 'FALLO 20: la exportación no quedó registrada';
  end if;
  if not exists (select 1 from public.v_auditoria where tabla = 'usuarios' and usuario_nombre is not null) then
    raise exception 'FALLO 20: la auditoría no muestra quién hizo los cambios';
  end if;
  reset role;

  raise notice 'OK 20: exportaciones y auditoría';
end $$;

/* 21. Zona horaria: "hoy" es la fecha local del restaurante, no la de UTC */
do $$
begin
  update public.configuracion set valor = '"America/Mexico_City"' where clave = 'zona_horaria';
  if public.hoy_local() <> (now() at time zone 'America/Mexico_City')::date then
    raise exception 'FALLO 21: hoy_local no usa la zona de México';
  end if;
  update public.configuracion set valor = '"Pacific/Kiritimati"' where clave = 'zona_horaria';
  if public.hoy_local() <> (now() at time zone 'Pacific/Kiritimati')::date then
    raise exception 'FALLO 21: hoy_local no respeta la configuración';
  end if;
  update public.configuracion set valor = to_jsonb(current_setting('TimeZone')) where clave = 'zona_horaria';
  raise notice 'OK 21: zona horaria';
end $$;

rollback;
