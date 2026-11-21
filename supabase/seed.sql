/* ─── Datos de ejemplo ──────────────────────────────────────
   Un restaurante con 3 áreas, 5 estaciones y 28 mesas, su
   personal, horarios de la semana, el rol de hoy publicado,
   visitas, una encuesta y reglas de alerta.

   Las fechas son relativas a current_date para que el demo
   funcione cualquier día. No crea usuarios de login (ver
   PROYECTO.md → "Base de datos en Supabase").
   ──────────────────────────────────────────────────────────── */

insert into public.restaurantes (nombre) values ('Restaurante Demo');

insert into public.turnos (nombre, hora_inicio, hora_fin) values
  ('Matutino',   '07:00', '15:00'),
  ('Vespertino', '15:00', '23:00');

/* ─── Catálogo del local ──────────────────────────────────── */

insert into public.areas (nombre, orden) values
  ('Salón', 1), ('Terraza', 2), ('Bar', 3);

insert into public.estaciones (area_id, nombre)
select a.id, x.estacion
from (values ('Salón','Salón A'), ('Salón','Salón B'),
             ('Terraza','Terraza A'), ('Terraza','Terraza B'),
             ('Bar','Bar A')) as x(area, estacion)
join public.areas a on a.nombre = x.area;

insert into public.mesas (numero, estacion_id, capacidad)
select n, e.id, case when x.estacion = 'Bar A' then 2 else 4 end
from (values ('Salón A', 1, 6), ('Salón B', 7, 12),
             ('Terraza A', 20, 25), ('Terraza B', 26, 30),
             ('Bar A', 40, 44)) as x(estacion, desde, hasta)
join public.estaciones e on e.nombre = x.estacion
cross join lateral generate_series(x.desde, x.hasta) as n;

/* ─── Personal ────────────────────────────────────────────── */

insert into public.empleados (numero_empleado, nombre, apellidos, puesto, fecha_ingreso, restaurante_id)
select x.num, x.nombre, x.apellidos, x.puesto, current_date - 365, r.id
from (values
  ('E001', 'Ana',      'García',    'gerente'),
  ('E002', 'Laura',    'Torres',    'rrhh'),
  ('E003', 'Carlos',   'López',     'capitan'),
  ('E004', 'Sofía',    'Ramos',     'capitan'),
  ('E005', 'Miguel',   'Vargas',    'capitan'),
  ('E006', 'Diego',    'Ruiz',      'mesero'),
  ('E007', 'María',    'González',  'mesero'),
  ('E008', 'Carlos',   'Herrera',   'mesero'),
  ('E009', 'Ana',      'Martínez',  'mesero'),
  ('E010', 'Roberto',  'Lima',      'mesero'),
  ('E011', 'Paola',    'Núñez',     'mesero'),
  ('E012', 'Jorge',    'Castillo',  'mesero'),
  ('E013', 'Luis',     'Mora',      'runner'),
  ('E014', 'Iván',     'Soto',      'runner'),
  ('E015', 'Fernanda', 'Cruz',      'hostess'),
  ('E016', 'Daniela',  'Ríos',      'hostess')
) as x(num, nombre, apellidos, puesto)
cross join (select id from public.restaurantes limit 1) r;

insert into public.ausencias (empleado_id, tipo, fecha_inicio, fecha_fin, estado, motivo)
select e.id, x.tipo, current_date + x.desde, current_date + x.hasta, x.estado, x.motivo
from (values
  ('E010', 'vacaciones', -2, 5, 'aprobada',  'Vacaciones de temporada'),
  ('E011', 'permiso',     1, 1, 'pendiente', 'Trámite personal')
) as x(num, tipo, desde, hasta, estado, motivo)
join public.empleados e on e.numero_empleado = x.num;

-- Semana vespertina para el personal operativo, con un descanso por persona
-- (nunca hoy) y sin programar a quien está de vacaciones.
insert into public.horarios (empleado_id, fecha, turno_id, es_descanso)
select e.id,
       d::date,
       t.id,
       d::date = current_date + 1 + (e.rn % 6)
from (select id, (row_number() over (order by numero_empleado))::int as rn
        from public.empleados
       where puesto in ('capitan','mesero','runner','hostess')) e
cross join generate_series(current_date, current_date + 6, interval '1 day') as d
cross join (select id from public.turnos where nombre = 'Vespertino') t
where public.ausencia_en(e.id, d::date) is null;

/* ─── Rol de hoy (vespertino), publicado ──────────────────── */

-- Se arma en borrador y se publica al final: con el rol publicado, cada cambio pide motivo.
insert into public.roles_diarios (fecha, turno_id)
select current_date, id
from public.turnos where nombre = 'Vespertino';

insert into public.rol_asignaciones (rol_id, empleado_id, funcion, area_id, estacion_id, es_cierre)
select r.id, e.id, x.funcion, a.id, es.id, x.es_cierre
from (values
  ('E006', 'mesero',  null,      'Salón A',   true),
  ('E007', 'mesero',  null,      'Salón B',   true),
  ('E008', 'mesero',  null,      'Terraza A', true),
  ('E009', 'mesero',  null,      'Terraza B', true),
  ('E012', 'mesero',  null,      'Bar A',     false),
  ('E003', 'capitan', 'Salón',   null,        false),
  ('E004', 'capitan', 'Terraza', null,        false),
  ('E005', 'capitan', 'Bar',     null,        false),
  ('E013', 'runner',  'Salón',   null,        false),
  ('E014', 'runner',  'Terraza', null,        false),
  ('E015', 'hostess', null,      null,        false)
) as x(num, funcion, area, estacion, es_cierre)
join public.empleados e on e.numero_empleado = x.num
cross join (select r.id from public.roles_diarios r
              join public.turnos t on t.id = r.turno_id
             where r.fecha = current_date and t.nombre = 'Vespertino') r
left join public.areas a       on a.nombre = x.area
left join public.estaciones es on es.nombre = x.estacion;

update public.roles_diarios r
   set estado = 'publicado', publicado_at = now()
  from public.turnos t
 where t.id = r.turno_id and r.fecha = current_date and t.nombre = 'Vespertino';

/* ─── Visitas (el trigger asigna mesero, área y capitán) ──── */

insert into public.visitas (rol_id, nombre_referencia, adultos, ninos, mesa_id, estado, hora_llegada)
select r.id, x.nombre, x.adultos, x.ninos, m.id, x.estado, now() - make_interval(mins => x.hace_min)
from (values
  ('Familia Pérez',    2, 2,  2, 'cerrada', 180),
  ('Sr. Hernández',    4, 0,  3, 'cerrada', 170),
  ('Mesa cumpleaños',  6, 3,  8, 'cerrada', 160),
  ('Pareja Gómez',     2, 0, 10, 'cerrada', 150),
  ('Familia Díaz',     3, 1, 21, 'cerrada', 140),
  ('Sra. Ortega',      2, 0, 22, 'cerrada', 120),
  ('Grupo oficina',    5, 0, 27, 'cerrada', 110),
  ('Sr. Medina',       1, 0, 41, 'cerrada', 100),
  ('Familia Rojas',    2, 1,  4, 'sentada',  45),
  ('Sra. Castro',      2, 0, 23, 'sentada',  30)
) as x(nombre, adultos, ninos, mesa, estado, hace_min)
join public.mesas m on m.numero = x.mesa
cross join (select r.id from public.roles_diarios r
              join public.turnos t on t.id = r.turno_id
             where r.fecha = current_date and t.nombre = 'Vespertino') r;

insert into public.visitas (rol_id, nombre_referencia, adultos, ninos)
select r.id, 'Sr. Fuentes (en espera)', 3, 0
from public.roles_diarios r
join public.turnos t on t.id = r.turno_id
where r.fecha = current_date and t.nombre = 'Vespertino';

/* ─── Encuesta ────────────────────────────────────────────── */

insert into public.encuestas (nombre) values ('Satisfacción general');

insert into public.preguntas (encuesta_id, texto, tipo, orden)
select e.id, x.texto, x.tipo, x.orden
from (values
  ('Atención del mesero',          'escala', 1),
  ('Tiempo de espera',             'escala', 2),
  ('Calidad de los alimentos',     'escala', 3),
  ('¿Nos recomendaría?',           'escala', 4),
  ('Comentarios',                  'texto',  5)
) as x(texto, tipo, orden)
cross join (select id from public.encuestas where nombre = 'Satisfacción general') e;

insert into public.respuestas_encuesta (encuesta_id, visita_id, comentario)
select e.id, v.id, x.comentario
from (values
  ('Familia Pérez',   'Muy buena atención'),
  ('Mesa cumpleaños', 'Tardaron en traer la cuenta'),
  ('Familia Díaz',    null),
  ('Grupo oficina',   'La comida llegó fría')
) as x(visita, comentario)
join public.visitas v on v.nombre_referencia = x.visita
cross join (select id from public.encuestas where nombre = 'Satisfacción general') e;

insert into public.respuestas_detalle (respuesta_id, pregunta_id, valor_numerico)
select re.id, p.id, x.valor
from (values
  ('Familia Pérez',   'Atención del mesero', 5), ('Familia Pérez',   'Tiempo de espera', 4),
  ('Familia Pérez',   'Calidad de los alimentos', 5), ('Familia Pérez', '¿Nos recomendaría?', 5),
  ('Mesa cumpleaños', 'Atención del mesero', 4), ('Mesa cumpleaños', 'Tiempo de espera', 2),
  ('Mesa cumpleaños', 'Calidad de los alimentos', 4), ('Mesa cumpleaños', '¿Nos recomendaría?', 3),
  ('Familia Díaz',    'Atención del mesero', 5), ('Familia Díaz',    'Tiempo de espera', 5),
  ('Familia Díaz',    'Calidad de los alimentos', 4), ('Familia Díaz',  '¿Nos recomendaría?', 5),
  ('Grupo oficina',   'Atención del mesero', 3), ('Grupo oficina',   'Tiempo de espera', 3),
  ('Grupo oficina',   'Calidad de los alimentos', 1), ('Grupo oficina', '¿Nos recomendaría?', 2)
) as x(visita, pregunta, valor)
join public.visitas v              on v.nombre_referencia = x.visita
join public.respuestas_encuesta re on re.visita_id = v.id
join public.preguntas p            on p.texto = x.pregunta;

/* ─── Reglas de alerta (umbrales de ejemplo) ──────────────── */

insert into public.reglas_alerta (nombre, tipo, umbral, periodo_dias) values
  ('Promedio de encuesta bajo por mesero', 'promedio_encuesta_mesero', 3.5, 7),
  ('Respuesta crítica en encuesta',        'respuesta_critica',        2,   1),
  ('Carga alta de comensales por área',    'carga_area',               60,  1);
