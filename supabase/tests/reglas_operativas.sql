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

rollback;
