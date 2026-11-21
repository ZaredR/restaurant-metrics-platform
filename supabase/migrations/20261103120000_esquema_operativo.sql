/* ─── Esquema base: gestión operativa del restaurante ───────────
   Personal, ausencias, horarios, catálogo del local, rol diario,
   hostess (visitas y comensales), encuestas, alertas y auditoría.

   Las decisiones pendientes con el cliente están marcadas con
   "SUPUESTO:" para encontrarlas rápido.

   Compatibilidad: `restaurantes` y `usuarios` conservan las
   columnas que usa la versión actual (auth.service.js).
   ──────────────────────────────────────────────────────────── */

/* ─── Restaurante y personal ───────────────────────────────── */

-- SUPUESTO: un solo restaurante por ahora; la tabla se conserva para
-- la versión actual y para crecer a varias sucursales más adelante.
create table public.restaurantes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Un empleado no necesariamente inicia sesión (meseros, runners).
create table public.empleados (
  id               uuid primary key default gen_random_uuid(),
  numero_empleado  text unique,
  nombre           text not null,
  apellidos        text,
  puesto           text not null
                   check (puesto in ('gerente','rrhh','capitan','mesero','runner','hostess','otro')),
  telefono         text,
  email            text,
  fecha_ingreso    date,
  restaurante_id   uuid references public.restaurantes(id),
  activo           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- Perfil de quien inicia sesión. Incluye los roles de la versión actual
-- (admin, gerente, supervisor, mesero) y los nuevos.
create table public.usuarios (
  id              uuid primary key references auth.users(id) on delete cascade,
  nombre          text not null,
  email           text not null unique,
  rol             text not null
                  check (rol in ('admin','gerente','supervisor','mesero','capitan','hostess','runner','rrhh')),
  restaurante_id  uuid references public.restaurantes(id),
  empleado_id     uuid unique references public.empleados(id) on delete set null,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Parámetros de negocio que el cliente puede cambiar sin tocar código.
create table public.configuracion (
  clave        text primary key,
  valor        jsonb not null,
  descripcion  text,
  updated_at   timestamptz not null default now()
);

insert into public.configuracion (clave, valor, descripcion) values
  -- SUPUESTO: una ausencia aprobada bloquea; con false solo se advierte en pantalla.
  ('ausencias_bloquean',    'true',  'Si es true, no se puede programar ni asignar a un empleado con ausencia aprobada ese día.'),
  -- SUPUESTO: no se exige horario para entrar al rol (permite cubrir faltas).
  ('exigir_horario_en_rol', 'false', 'Si es true, solo se asigna al rol a quien tiene horario (no descanso) en ese turno.');

/* ─── Ausencias y horarios ────────────────────────────────── */

create table public.ausencias (
  id            uuid primary key default gen_random_uuid(),
  empleado_id   uuid not null references public.empleados(id) on delete cascade,
  tipo          text not null check (tipo in ('vacaciones','incapacidad','permiso','otro')),
  fecha_inicio  date not null,
  fecha_fin     date not null,
  -- SUPUESTO: las ausencias pasan por aprobación; solo las aprobadas bloquean.
  estado        text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  motivo        text,
  aprobada_por  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);

create index ausencias_empleado_fechas on public.ausencias (empleado_id, fecha_inicio, fecha_fin);

-- SUPUESTO: turnos fijos por día (matutino, vespertino...); se dan de alta como catálogo.
create table public.turnos (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null unique,
  hora_inicio  time not null,
  hora_fin     time not null,
  activo       boolean not null default true
);

-- Un registro por empleado y día: el turno que trabaja o su descanso.
create table public.horarios (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  fecha        date not null,
  turno_id     uuid references public.turnos(id),
  es_descanso  boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (empleado_id, fecha),
  check (es_descanso or turno_id is not null)
);

/* ─── Catálogo del local ──────────────────────────────────── */

create table public.areas (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null unique,
  descripcion  text,
  orden        int not null default 0,
  activo       boolean not null default true
);

create table public.estaciones (
  id       uuid primary key default gen_random_uuid(),
  area_id  uuid not null references public.areas(id),
  nombre   text not null unique,
  activo   boolean not null default true
);

-- Cada mesa pertenece a una sola estación, así no puede quedar en dos.
create table public.mesas (
  id           uuid primary key default gen_random_uuid(),
  numero       int not null unique check (numero > 0),
  estacion_id  uuid not null references public.estaciones(id),
  capacidad    int not null default 4 check (capacidad > 0),
  activo       boolean not null default true
);

/* ─── Rol diario ──────────────────────────────────────────── */

create table public.roles_diarios (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null,
  turno_id       uuid not null references public.turnos(id),
  estado         text not null default 'borrador' check (estado in ('borrador','publicado','cerrado')),
  notas          text,
  publicado_por  uuid references auth.users(id) on delete set null,
  publicado_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (fecha, turno_id)
);

create table public.rol_asignaciones (
  id           uuid primary key default gen_random_uuid(),
  rol_id       uuid not null references public.roles_diarios(id) on delete cascade,
  empleado_id  uuid not null references public.empleados(id),
  funcion      text not null check (funcion in ('mesero','capitan','runner','hostess')),
  area_id      uuid references public.areas(id),
  estacion_id  uuid references public.estaciones(id),
  es_cierre    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (rol_id, empleado_id),
  check (
       (funcion = 'mesero'  and estacion_id is not null)
    or (funcion = 'capitan' and area_id is not null and estacion_id is null)
    or (funcion in ('runner','hostess') and estacion_id is null)
  ),
  check (not es_cierre or funcion = 'mesero')
);

-- SUPUESTO: un mesero por estación y un capitán por área en cada rol.
create unique index rol_asignaciones_mesero_estacion
  on public.rol_asignaciones (rol_id, estacion_id) where funcion = 'mesero';
create unique index rol_asignaciones_capitan_area
  on public.rol_asignaciones (rol_id, area_id) where funcion = 'capitan';

/* ─── Hostess: visitas y comensales ───────────────────────── */

-- estacion_id, area_id, mesero_id y capitan_id se copian del rol al
-- asignar la mesa, para que el historial no cambie si después se edita el rol.
create table public.visitas (
  id                 uuid primary key default gen_random_uuid(),
  rol_id             uuid not null references public.roles_diarios(id),
  nombre_referencia  text not null,
  adultos            int not null default 1 check (adultos >= 0),
  ninos              int not null default 0 check (ninos >= 0),
  -- SUPUESTO: cada niño cuenta como medio comensal (documento del Canvas).
  comensales         numeric(6,1) generated always as (adultos + ninos * 0.5) stored,
  estado             text not null default 'espera'
                     check (estado in ('espera','sentada','cerrada','cancelada')),
  hora_llegada       timestamptz not null default now(),
  hora_sentada       timestamptz,
  hora_salida        timestamptz,
  mesa_id            uuid references public.mesas(id),
  estacion_id        uuid references public.estaciones(id),
  area_id            uuid references public.areas(id),
  mesero_id          uuid references public.empleados(id),
  capitan_id         uuid references public.empleados(id),
  registrada_por     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  check (adultos + ninos > 0),
  check (estado not in ('sentada','cerrada') or mesa_id is not null)
);

-- Una mesa solo puede tener una visita sentada a la vez.
create unique index visitas_mesa_ocupada on public.visitas (mesa_id) where estado = 'sentada';
create index visitas_rol_mesero on public.visitas (rol_id, mesero_id);

/* ─── Encuestas ───────────────────────────────────────────── */

create table public.encuestas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  activa      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.preguntas (
  id           uuid primary key default gen_random_uuid(),
  encuesta_id  uuid not null references public.encuestas(id) on delete cascade,
  texto        text not null,
  -- SUPUESTO: escala de 1 a 5, sí/no o texto libre.
  tipo         text not null default 'escala' check (tipo in ('escala','si_no','texto')),
  orden        int not null default 0,
  activa       boolean not null default true
);

-- El contexto (mesa, mesero, capitán, área, turno) sale de la visita.
create table public.respuestas_encuesta (
  id           uuid primary key default gen_random_uuid(),
  encuesta_id  uuid not null references public.encuestas(id),
  visita_id    uuid not null references public.visitas(id),
  comentario   text,
  created_at   timestamptz not null default now(),
  unique (encuesta_id, visita_id)
);

create table public.respuestas_detalle (
  id              uuid primary key default gen_random_uuid(),
  respuesta_id    uuid not null references public.respuestas_encuesta(id) on delete cascade,
  pregunta_id     uuid not null references public.preguntas(id),
  valor_numerico  numeric(3,1) check (valor_numerico between 0 and 5),
  valor_texto     text,
  unique (respuesta_id, pregunta_id)
);

/* ─── Alertas ─────────────────────────────────────────────── */

-- SUPUESTO: los umbrales y destinatarios los define el cliente; el
-- evaluador (cron + correo) se agrega en una migración posterior.
create table public.reglas_alerta (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  tipo           text not null check (tipo in ('promedio_encuesta_mesero','respuesta_critica','carga_area')),
  umbral         numeric not null,
  periodo_dias   int not null default 7 check (periodo_dias > 0),
  destinatarios  text[] not null default '{}',
  activa         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table public.alertas (
  id           uuid primary key default gen_random_uuid(),
  regla_id     uuid references public.reglas_alerta(id) on delete set null,
  nivel        text not null default 'warning' check (nivel in ('info','warning','critical')),
  mensaje      text not null,
  empleado_id  uuid references public.empleados(id),
  area_id      uuid references public.areas(id),
  datos        jsonb,
  atendida     boolean not null default false,
  created_at   timestamptz not null default now()
);

/* ─── Auditoría ───────────────────────────────────────────── */

create table public.auditoria (
  id           bigint generated always as identity primary key,
  tabla        text not null,
  registro_id  text,
  accion       text not null check (accion in ('INSERT','UPDATE','DELETE')),
  usuario_id   uuid,
  antes        jsonb,
  despues      jsonb,
  created_at   timestamptz not null default now()
);

create index auditoria_tabla_registro on public.auditoria (tabla, registro_id);
