# OmniRest — Gestión Operativa para Restaurantes

> Nombre del producto: **OmniRest** (logo en `public/omnirest-logo.jpg`, ícono en `public/omnirest-icon.png`). El repositorio conserva el nombre técnico `restaurant-metrics-platform`.

Plataforma web para organizar y controlar la operación diaria de un restaurante ("Sistemas de Roles"). Conecta al personal y su disponibilidad, la operación física (áreas, estaciones, mesas, runners) y la atención al comensal (llegada, asignación, cierre, encuestas, indicadores y alertas), con trazabilidad de cada decisión.

La referencia funcional es el documento **"Contextualización ampliada del proyecto Sistemas de Roles"**. De la versión anterior (métricas de ventas a partir de reportes de SoftRestaurant) se conservan algunas pantallas; ver "Estado actual".

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework UI | React 18 + JSX |
| Build tool | Vite 5 |
| Routing | React Router DOM v6 |
| Estado global | Zustand 4 (con persistencia en localStorage) |
| Backend / Auth / DB | Supabase (PostgreSQL + Auth) |
| Gráficas | Recharts |
| Parseo de archivos | PapaParse (CSV) + SheetJS/xlsx (Excel) |
| Estilos | CSS puro con variables (sin Tailwind ni UI library) |
| Deploy | Cloudflare Pages |

---

## Estructura del proyecto

```
restaurant-metrics-platform/
├── index.html
├── vite.config.js
├── .env.example            # Variables de entorno requeridas
└── src/
    ├── main.jsx            # Entry point — monta React y carga estilos globales
    ├── App.jsx             # Envuelve la app con BrowserRouter
    ├── router/
    │   └── AppRouter.jsx   # Rutas, guards de autenticación y permisos
    ├── constants/
    │   ├── routes.js       # Todas las rutas de la app como constantes
    │   ├── roles.js        # Perfiles: admin, gerente, supervisor, capitán, RR. HH., hostess, mesero, runner, analista
    │   └── permissions.js  # Permisos por rol (ROLE_PERMISSIONS)
    ├── store/
    │   └── auth.store.js   # Store de Zustand — sesión del usuario
    ├── hooks/
    │   └── useAuth.js      # Hook que conecta el store con los servicios de auth
    ├── services/
    │   ├── supabase.js         # Cliente de Supabase (lazy init)
    │   ├── db.js               # run(): consultas con mensajes de error claros
    │   ├── auth.service.js     # Login, logout, recuperar y restablecer contraseña
    │   ├── staff / availability / floor / absences / schedules .service.js  # Personal y disponibilidad
    │   ├── roster.service.js, rosterSuggest.js   # Rol diario y sugerencia de asignación
    │   ├── hostess.service.js  # Llegadas, mesas y comensales
    │   ├── closing.service.js  # Cierre del turno
    │   ├── surveys.service.js  # Encuestas
    │   ├── metrics.service.js  # Indicadores y resumen del día
    │   ├── alerts.service.js   # Alertas
    │   ├── accounts.service.js # Usuarios e invitaciones
    │   ├── export.service.js   # Exportaciones registradas y auditoría
    │   └── fileParser.service.js # (versión anterior) Parseo de CSV/Excel y cálculo de KPIs
    ├── utils/
    │   └── formatters.js   # Formateadores: moneda, fecha, porcentaje, etc.
    ├── components/
    │   ├── layout/         # AppLayout, Sidebar, Topbar
    │   └── ui/             # Alert, Avatar, Badge, Button, DataTable, FileUpload, KPICard, Modal
    ├── pages/              # Una carpeta por módulo. Nueva versión: staff, floor, absences,
    │                       # schedules, roster, hostess, closing, surveys, alerts, accounts,
    │                       # metrics, audit, dashboard. Versión anterior: rankings, incentives,
    │                       # notices, history, reports, restaurants, users, config
    └── styles/
        ├── variables.css   # Tokens de diseño (colores, espaciados, tipografía)
        ├── reset.css
        ├── global.css
        ├── components.css
        ├── animations.css
        ├── sidebar.css
        └── auth.css
```

---

## Páginas de la aplicación

El router carga todas las páginas de forma **lazy** (code splitting automático con Vite).

| Ruta | Página | Permiso requerido |
|---|---|---|
| `/login` | Login | Solo invitados |
| `/recover-password` | RecoverPassword | Solo invitados |
| `/reset-password` | ResetPassword (destino del correo de recuperación) | Público |
| `/dashboard` | Dashboard | Autenticado |
| `/profile` | Profile | Autenticado |
| `/metrics` | MetricsDashboard (indicadores operativos reales) — requiere Supabase | Autenticado (`VIEW_METRICS`) |
| `/rankings` | RankingGeneral — **oculta** (redirige al Dashboard) | Autenticado |
| `/incentives` | IncentiveList — **oculta** (redirige al Dashboard) | Autenticado |
| `/incentives/new`, `/incentives/:id/edit` | IncentiveForm — **oculta** (redirige al Dashboard) | Autenticado |
| `/notices` | NoticeList — **oculta** (redirige al Dashboard) | Autenticado |
| `/notices/new` | NoticeCreate — **oculta** (redirige al Dashboard) | Autenticado |
| `/history` | History | Autenticado |
| `/reports` | ReportHistory | `UPLOAD_REPORTS` |
| `/reports/upload` | ReportUpload | `UPLOAD_REPORTS` |
| `/restaurants` | RestaurantList | `VIEW_RESTAURANTS` |
| `/restaurants/new`, `/restaurants/:id/edit` | RestaurantForm | `VIEW_RESTAURANTS` |
| `/users` | UserList | `VIEW_USERS` |
| `/users/new`, `/users/:id/edit` | UserForm | `VIEW_USERS` |
| `/config` | Config | `VIEW_CONFIG` |
| `/audit` | Audit (cambios reales y exportaciones) — requiere Supabase | `VIEW_AUDIT` |
| `/accounts` | AccountsPage (usuarios, invitaciones, matriz de permisos) — requiere Supabase | `MANAGE_USERS` |
| `/devices` | DevicesPage (tablets de recepción y encuestas: alta, enlace y revocación) — requiere Supabase | `MANAGE_DEVICES` |
| `/vincular/:token` | LinkDevice (la tablet canjea su enlace; ruta pública) | — |
| `/staff` | StaffList (personal) — requiere Supabase | `VIEW_STAFF` |
| `/floor` | FloorConfig (áreas, estaciones, mesas) — requiere Supabase | `VIEW_FLOOR` |
| `/schedules` | WeeklySchedule (horario semanal) — requiere Supabase | `VIEW_SCHEDULES` (editar: `MANAGE_SCHEDULES`) |
| `/absences` | AbsenceList (vacaciones, incapacidades, permisos) — requiere Supabase | `MANAGE_SCHEDULES` |
| `/roster` | DailyRoster (rol diario: capitanes, meseros, cierre, runners, hostess) — requiere Supabase | `VIEW_ROSTER` (editar: `MANAGE_ROSTER`) |

| `/hostess` | HostessDesk (llegadas, lista de espera, mapa de mesas, comensales por mesero) — requiere Supabase | `HOSTESS_DESK` |
| `/alerts` | AlertsPage (pendientes, atendidas y reglas) — requiere Supabase | `VIEW_ALERTS` (reglas: `MANAGE_ALERT_RULES`) |
| `/surveys` | SurveysPage (capturar, resultados y configurar encuestas) — requiere Supabase | `CAPTURE_SURVEYS` (resultados: `VIEW_SURVEY_RESULTS`; configurar: `MANAGE_SURVEYS`) |
| `/closing` | ShiftClosing (cierre del turno: propuesta de distribución del fondo, orden de salida) — requiere Supabase | `VIEW_CLOSING` (autorizar: `AUTHORIZE_CLOSING`) |

**Hostess:** trabaja con el rol **publicado** del turno actual. La hostess registra la llegada (nombre, adultos, niños) y la sienta en una mesa libre o la manda a la lista de espera; al asignar la mesa, la base de datos obtiene mesero, área y capitán. Mesas en verde = libres, ámbar = ocupadas, punteadas = estación sin mesero en el rol. Varias tablets se sincronizan con Supabase Realtime (migración `20261104120000_tiempo_real_hostess.sql`).

**Rol diario:** se crea por fecha y turno como *borrador*. "Sugerir asignación" ([rosterSuggest.js](src/services/rosterSuggest.js)) llena solo los lugares vacíos con personal que tiene horario en ese turno y no está ausente; rota a los meseros para que no repitan la estación del último rol del mismo turno. Los meseros de cierre se marcan a mano.

Estados (contextualización 3.2 y 4.2: proponer no es publicar):

```
borrador ──(capitán/supervisor: Enviar a revisión)──► en revisión
en revisión ──(gerente/admin: Aprobar y publicar)──► publicado
en revisión ──(gerente/admin: Regresar a borrador)──► borrador
borrador ──(gerente/admin: Publicar)──► publicado
publicado ──(cualquier ajuste, con motivo)──► modificado
publicado / modificado ──(Cerrar rol)──► cerrado
```

- En revisión no se edita; borrador y en revisión solo los ven quienes arman el rol.
- Con el rol publicado o modificado, cada cambio pide **motivo** y queda en `rol_ajustes` (antes, después, motivo, quién y cuándo). La pantalla muestra el **historial de ajustes**.
- La hostess trabaja con roles publicados o modificados; al cerrar, ya no se modifica.

**Reasignar una mesa:** en la Hostess, al abrir una mesa ocupada, supervisor, capitán y gerente tienen **"Reasignar mesero"**: la mesa no se mueve, cambia el responsable y queda en `visita_reasignaciones` con el motivo. Mover a un cliente a una mesa de otro mesero también se registra ("Cambio de mesa"). SUPUESTO: los comensales cuentan para quien cierra la mesa (`configuracion.reasignacion_conteo`); el historial permite recalcular si el cliente elige otra regla.

**Disponibilidad y restricciones** (contextualización 3.1, 4.1 y 5):

- **Personal** muestra el estado de cada empleado: activo, inactivo, suspendido o pendiente de alta. Solo el personal activo entra al rol.
- El botón **"Disponibilidad"** de cada empleado indica en qué áreas o estaciones puede trabajar (sin nada marcado, en cualquiera) y sus restricciones: solo un turno, no un turno, no cubre cierre, no cierta área, día de descanso fijo, en capacitación u otra. Cada restricción puede ser permanente o tener fechas.
- En el **Rol diario**, las opciones muestran las advertencias de cada persona. Si alguien se asigna a pesar de una restricción, se pide un **motivo** y queda en "Asignaciones con excepción" (`rol_excepciones`). "Sugerir asignación" no propone a nadie con advertencias.
- El panel **"Conflictos por revisar"** (`conflictos_rol`) avisa de:
  - personal no activo o ausente;
  - personas sin horario o con horario en otro turno;
  - restricciones;
  - estaciones sin mesero;
  - un turno sin runner (`configuracion.exigir_runner`);
  - exceso de mesas por mesero (`configuracion.max_mesas_por_mesero`).
- **Estado de mesa:** puede ser disponible, reservada, en limpieza, fuera de servicio o cerrada; "ocupada" sale de la visita sentada.
  - La hostess, el capitán, el supervisor y la gerencia lo cambian en la Hostess o en Local.
  - Solo se sienta a alguien en una mesa disponible o reservada; al sentar a una reserva, la mesa vuelve a disponible.
  - Con `configuracion.limpieza_al_cerrar = true`, al liberar una mesa pasa a "en limpieza".

**Cierre del turno** (contextualización, sección 7). El sistema no asume una fórmula:

1. Sobre un rol publicado, gerencia, el capitán o el supervisor capturan el **fondo** y eligen el **método**, que no tiene valor por defecto:
   - **A · Proporcional:** fondo × comensales de cada quien ÷ total de comensales.
   - **B · Por puntos:** cada mesero suma puntos por comensal; capitán, runner y hostess, puntos fijos por turno.
   - **C · Mixto:** un % del fondo en partes iguales y el resto por puntos.
2. Por defecto participa todo el personal del rol; se puede quitar o agregar personas.
3. "Calcular propuesta" (`cierre_calcular`):
   - no corre si hay mesas ocupadas;
   - toma los comensales de las visitas cerradas, que cuentan para quien cerró la mesa;
   - redondea a pesos y da los pesos que sobran a quien tiene más carga, así la suma es exactamente el fondo.
4. Los **ajustes** llevan motivo. Para autorizar, la suma debe volver a ser el fondo: lo que se le suma a uno se le quita a otro.
5. Solo **gerente y admin autorizan**; ya autorizado no se modifica. Cada paso queda en el historial del cierre (`cierre_eventos`).
6. Cada mesero puede leer (RLS) solo su propio monto y solo cuando el cierre ya está autorizado. La pantalla también muestra la **orden de salida** de los meseros de cierre.

**Encuestas** (contextualización, sección 8; decisiones del 2026-11-22):

- Las captura el **personal en tablet** (sin QR por ahora).
  - Al liberar una mesa en la Hostess aparece el formulario; se puede omitir.
  - En **Encuestas → Capturar** están las visitas atendidas del día que aún no tienen encuesta (`visitas_sin_encuesta`).
- Cada encuesta queda **ligada a la visita**: de ahí salen mesa, mesero, capitán, área y turno. El cliente no se identifica.
- `registrar_encuesta` guarda todo en una sola llamada y valida que las escalas vayan de 1 a 5, que sí/no sean "si" o "no" y que no se capture dos veces.
- **Resultados** (gerencia, capitán y supervisor; los meseros no ven nada):
  - promedio general y calificaciones bajas;
  - resultado por pregunta (promedio, % de sí, número de comentarios);
  - promedio por mesero, por área y por turno;
  - comentarios.
- **Configurar** (gerente y admin): encuestas y preguntas. Una pregunta con respuestas no cambia de texto ni de tipo: se desactiva y se crea otra.

**Métricas e indicadores** (contextualización, sección 8; decisiones del 2026-11-22):

- **Métricas** ahora muestra indicadores reales en lugar de las ventas de ejemplo de la versión anterior (el código anterior queda en el historial de git).
- Periodo: hoy, 7, 30 o 90 días, o fechas libres, hasta un año.
- Lo calcula la función `indicadores(desde, hasta)`, que decide qué ve cada perfil:
  - **Gerencia, capitán y supervisor:**
    - comensales, mesas y espera promedio;
    - satisfacción;
    - comensales por día, por turno, por área (con satisfacción) y por estación;
    - carga por mesero: turnos, comensales por turno, satisfacción y mesas recibidas por reasignación;
    - rol publicado vs. ejecutado: roles con cambios, ajustes, excepciones, reasignaciones y cambios de mesa;
    - incidencias de disponibilidad: días-persona de ausencia por tipo.
  - **Mesero:** solo sus números (comensales, mesas, comensales por turno, estancia y tendencia), sin encuestas ni compañeros.
- **Dashboard:** un bloque **"Hoy"** arriba del contenido de siempre, solo para gerencia, capitán y supervisor (`resumen_del_dia`):
  - comensales, mesas ocupadas y lista de espera;
  - satisfacción del día;
  - estado del rol de cada turno con sus conflictos.

**Alertas** (contextualización, sección 9; decisiones del 2026-11-22). Solo dentro del sistema, sin correo ni mensajería.

| Grupo | Alertas | Cuándo se generan |
|---|---|---|
| Operación del turno | Estación sin mesero; mesero con más de N comensales; área con carga alta | Al abrir la app (`evaluar_alertas`) |
| Rol y disponibilidad | Asignación con excepción; mesa reasignada | Al momento (trigger) |
| Satisfacción | Respuesta crítica (al momento); promedio bajo por mesero o por turno (al abrir, con al menos 3 encuestas) | Ambos |
| Cierre y configuración | Mesas abiertas en un turno cerrado o de días anteriores; estación activa sin mesas | Al abrir la app |

- Cada alerta tiene una clave (regla + entidad + fecha) y no se repite.
- Cada regla tiene umbral, perfiles destinatarios, nivel y estado; gerente y admin las editan en **Alertas → Reglas**. Los valores iniciales salen de la tabla de ejemplos del documento.
- Cada quien ve y **atiende** solo las alertas de su perfil; gerente y admin ven todas. Al atender queda registrado quién, cuándo y una nota.
- La **campana** de la barra superior muestra las pendientes y se actualiza en vivo. El punto rojo fijo que tenía antes era decorativo.

**Usuarios y perfiles** (contextualización 3.2):

- **Usuarios** (`/accounts`, gerente y admin): lista, cambio de perfil, desactivar o reactivar (no se borran), invitaciones pendientes y matriz de **permisos por acción** (solo lectura).
- **Alta:** se registra una invitación (correo, nombre, perfil, empleado). Al crear la cuenta con ese correo en Supabase → Authentication, el perfil se liga solo (trigger en `auth.users`); si la cuenta ya existía, se liga al invitar. La app nunca ve contraseñas.
- **Protecciones** (trigger `proteger_usuarios`):
  - nadie cambia su propio perfil ni se desactiva a sí mismo;
  - un gerente no crea ni modifica administradores;
  - un usuario desactivado no puede iniciar sesión.
- **Perfil nuevo `analista`:** ve indicadores generales (sin carga por mesero ni datos personales) y no modifica nada.

**Exportaciones y auditoría** (contextualización 10 y 11):

- Solo gerente y admin ven los botones **"Exportar CSV"**, que están en Métricas, Encuestas → Resultados, Cierre y Auditoría.
- Antes de generar el archivo, `registrar_exportacion` revisa el permiso y deja registro (qué, filtros, filas, quién y cuándo). Si falla, no se descarga nada.
- **Auditoría** (admin) muestra los cambios reales: quién, módulo, acción y campos que cambiaron. También muestra el registro de exportaciones. Reemplaza los logs de ejemplo de la versión anterior.

**Diseño** (2026-11-23, tomado de la versión piloto del equipo):
- Todo el aspecto visual está en [src/styles/theme.css](src/styles/theme.css), que se carga al final: colores azul marino y naranja, títulos en *Barlow Semi Condensed*, botones y pestañas redondeados. Si se quita ese archivo, se recupera el aspecto anterior.
- **Barra superior** blanca: botón de menú, logo, campana de alertas, usuario y *Cerrar sesión*.
- **Barra lateral**: tarjeta azul flotante con el bloque "Tu perfil"; en el celular se abre como cajón.
- **Inicio** ([HomePage.jsx](src/pages/dashboard/HomePage.jsx)):
  - banner "Panel de operación" con la jornada de hoy;
  - accesos rápidos según el perfil;
  - el panel "Hoy" para gerencia, supervisión y capitanes.
- Los dashboards de ventas de la versión anterior (`DashboardAdmin`, `DashboardSupervisor`, `DashboardMesero`) siguen en el código, pero ya no se muestran.

**Funciones tomadas de la versión piloto** (2026-11-23):

- **Horarios por hora:** cada día se elige un turno, *Personalizado…* (hora de entrada y salida) o *Descanso*. La base deriva el turno con el que más se traslapa (`derivar_turno_horario`), así el rol diario sigue funcionando por turno. La semana se **publica** (`publicar_semana`): mientras está en borrador, el personal no ve sus horarios. *Imprimir semana* usa la impresión del navegador.
- **Mesas por área y sin estación:** cada mesa pertenece a un área; la estación es opcional. En **Local → Mesas** se ven los rangos por área ("Salón · 1–12") y se agregan rangos eligiendo área y, si aplica, estación.
- **Modo de trabajo por área en el Rol diario:**
  - *Estaciones* (como antes): cada estación con su mesero.
  - *TIROS*: varios meseros sin estación; al sentar, la Hostess propone al que lleva **menos comensales** (`mesero_siguiente_tiro`) y puede elegir otro del área.
  - *Sin servicio*: sus mesas no se asignan ese turno.
  - Conflictos y alertas avisan de estaciones sin mesero solo en áreas por estaciones, de mesas sin estación en esas áreas y de áreas en TIROS sin meseros.
- **Runners por función:** catálogo en **Local → Funciones de runner** (Fría, Caliente, Descamoche, Stand boy) y tarjeta *Runners por función* en el Rol diario.
- **Dispositivos vinculados** (`/devices`, gerente y admin):
  1. Se da de alta la tablet con su función: *Hostess* (recepción y encuestas) o *Encuestas* (solo captura).
  2. Se genera un **enlace de un solo uso** que vence en 24 h; en la base solo queda su hash.
  3. La tablet abre el enlace, entra con una **sesión anónima** de Supabase y queda vinculada, sin contraseña personal.
  4. **Revocar** le quita el acceso al instante; al abrir la app, la tablet revocada regresa al login.
  - En la auditoría aparece como «Dispositivo: nombre». Las cuentas personales de hostess siguen funcionando igual.
  - Requisito: en Supabase, *Authentication → Sign In / Providers → Allow anonymous sign-ins* activado.

Cualquier ruta desconocida redirige a `/dashboard`.

`/dashboard` muestra una vista distinta según el rol: `DashboardAdmin` (admin y gerente), `DashboardSupervisor` o `DashboardMesero`.

> **Estado actual:**
> - Las pantallas de la nueva versión trabajan con Supabase: Personal, Local, Hostess, Rol diario, Cierre, Encuestas, Alertas, Horarios, Ausencias, Métricas, Usuarios, Auditoría y el bloque "Hoy" del Dashboard.
> - **Sigue con datos de ejemplo** de la versión anterior: el resto del Dashboard (ventas, debajo del bloque "Hoy"); sus enlaces a pantallas ocultas ya no se muestran.
> - Están ocultas, y su URL redirige al Dashboard (`HIDDEN_ROUTES`): Restaurantes, Usuarios (versión anterior), Reportes, Historial, Configuración, Rankings, Incentivos y Avisos.

---

## Sistema de roles y permisos

Los roles están definidos en [src/constants/roles.js](src/constants/roles.js) y los permisos en [src/constants/permissions.js](src/constants/permissions.js).

### Roles

| Perfil | Label | Para qué (contextualización 3.2) |
|---|---|---|
| `admin` | Administrador Global | Configura y controla el sistema; único que consulta la auditoría |
| `gerente` | Gerente | Coordina la operación: aprueba y publica el rol, autoriza el cierre, usuarios, exporta |
| `supervisor` | Supervisor | Supervisión del turno: arma el rol, reasigna mesas, atiende alertas |
| `capitan` | Capitán | Supervisor de turno por área (en el documento: "Supervisor de turno") |
| `rrhh` | Recursos Humanos | Responsable de personal: empleados, horarios, ausencias, restricciones |
| `hostess` | Hostess | Recepción: llegadas, mesas, estado de mesas, encuestas |
| `mesero` | Mesero | Consulta su rol, sus mesas y sus propios indicadores |
| `runner` | Runner | Consulta el rol |
| `analista` | Analista | Consulta indicadores generales sin modificar nada ni ver datos personales |

### Permisos por acción

Los permisos están en [src/constants/permissions.js](src/constants/permissions.js) (`ROLE_PERMISSIONS`). La pantalla **Usuarios → Perfiles y permisos** muestra la matriz completa por acción.

La base de datos aplica las mismas reglas con RLS y funciones, así que la pantalla no es la única barrera. Ver "Permisos (RLS)" en la sección de la base de datos.

---

## Flujo de autenticación

```
Login (email + password)
    │
    ▼
useAuth.login()
    │
    ├─► loginWithEmail()  ──► Supabase Auth → perfil en tabla "usuarios"
    │       (si Supabase no está configurado)
    └─► demoLogin()       ──► usuarios de prueba en memoria
    │
    ▼
auth.store (Zustand + persist)
    │   user, token → guardados en localStorage bajo "metricas-auth"
    ▼
Navigate → /dashboard
```

El guard `RequireAuth` en el router verifica `store.user`. Si no existe, redirige a `/login`.

- Si la cuenta no tiene perfil en `usuarios`, o el perfil está desactivado, el login se rechaza con un mensaje claro y se cierra la sesión de Supabase.
- **Recuperar contraseña:** `/recover-password` envía el correo y el enlace abre `/reset-password`, donde se elige la nueva contraseña. Para que funcione, las URLs de la app deben estar en Supabase → Authentication → URL Configuration (ver "Deploy").
El guard `RequirePermission` verifica `ROLE_PERMISSIONS[user.rol]` antes de renderizar rutas protegidas.

---

## Parseo de archivos y cálculo de KPIs

El servicio [src/services/fileParser.service.js](src/services/fileParser.service.js) acepta exportaciones de **SoftRestaurant** en formato CSV o Excel.

**Columnas requeridas:** `mesero`, `fecha`, `total`, `ordenes`

El proceso es:
1. Usuario sube el archivo en `/reports/upload`
2. Se detecta la extensión (`.csv` → PapaParse, `.xlsx/.xls` → SheetJS)
3. Se normalizan los headers a minúsculas
4. Se validan las columnas requeridas
5. `calculateKPIs()` agrupa por mesero y calcula:
   - Ventas totales
   - Número de órdenes
   - Ticket promedio (`ventas / órdenes`)
   - Upsell acumulado
   - Días trabajados

---

## Base de datos en Supabase (nueva versión: gestión operativa)

La carpeta `supabase/` contiene la base de la nueva versión: tablas, reglas de negocio, seguridad (RLS) y funciones que usan las pantallas. `usuarios` y `restaurantes` conservan las columnas que usa `auth.service.js`.

```
supabase/
├── migrations/
│   ├── 20261103120000_esquema_operativo.sql  # Tablas y restricciones
│   ├── 20261103120100_reglas_y_vistas.sql    # Triggers, funciones, vistas y auditoría
│   ├── 20261103120200_seguridad_rls.sql      # Permisos por rol (RLS)
│   ├── 20261104120000_tiempo_real_hostess.sql # Realtime para visitas y rol
│   ├── 20261121120000_ajustes_y_reasignaciones.sql # Estados del rol, ajustes y reasignaciones con motivo
│   ├── 20261122120000_disponibilidad_y_estados.sql # Estado del empleado, restricciones, conflictos y estado de mesas
│   ├── 20261123120000_cierre.sql             # Cierre: propuesta A/B/C, ajustes con motivo y autorización
│   ├── 20261124120000_encuestas.sql          # Captura de encuestas, visitas pendientes y vista de resultados
│   ├── 20261125120000_indicadores.sql        # Indicadores operativos y resumen del día
│   ├── 20261126120000_alertas.sql            # Alertas por evento y por umbral, destinatarios y atención
│   ├── 20261127120000_usuarios_y_perfiles.sql # Perfil analista, invitaciones y protección de usuarios
│   ├── 20261128120000_exportaciones_y_auditoria.sql # Registro de exportaciones y vista de auditoría
│   ├── 20261129120000_zona_horaria.sql       # "Hoy" en la zona del restaurante (Supabase usa UTC)
│   ├── 20261130120000_horarios_por_hora.sql  # Horario con hora de entrada/salida y publicación de la semana
│   ├── 20261201120000_mesas_por_area_y_tiros.sql # Mesas por área, modo TIROS / sin servicio y runners por función
│   └── 20261202120000_dispositivos_vinculados.sql # Tablets con enlace de un solo uso; lecturas solo con perfil o dispositivo
├── seed.sql                                  # Datos de ejemplo (fechas relativas a hoy)
└── tests/
    └── reglas_operativas.sql                 # Pruebas de reglas (se revierten al terminar)
```

### Tablas

| Módulo | Tablas |
|---|---|
| Personal | `empleados`, `usuarios` (login, ligado a `empleado_id`), `configuracion` |
| Disponibilidad | `ausencias`, `turnos`, `horarios`, `empleado_autorizaciones` (áreas/estaciones permitidas), `empleado_restricciones`, `rol_excepciones` |
| Catálogo del local | `areas`, `estaciones`, `mesas` (área obligatoria, estación opcional), `funciones_runner` |
| Rol diario | `roles_diarios` (borrador → en revisión → publicado → modificado → cerrado), `rol_asignaciones`, `rol_ajustes`, `rol_areas` (modo de cada área) |
| Horarios | `horarios_semanas` (borrador / publicada) |
| Dispositivos | `dispositivos` (pendiente → vinculado → revocado) |
| Reasignaciones | `visita_reasignaciones` (cambios de mesero responsable con motivo) |
| Hostess | `visitas` (comensales = adultos + niños × 0.5, columna calculada) |
| Cierre | `cierres` (borrador → propuesto → autorizado), `cierre_participantes`, `cierre_eventos` |
| Encuestas | `encuestas`, `preguntas`, `respuestas_encuesta`, `respuestas_detalle` |
| Alertas | `reglas_alerta`, `alertas` |
| Trazabilidad | `auditoria` (la llena un trigger en las tablas principales) |

### Reglas que aplica la base de datos

- No se programa ni se asigna al rol a un empleado con **ausencia aprobada** ese día (configurable con `configuracion.ausencias_bloquean`).
- Cada mesa pertenece a un área y, opcionalmente, a una estación; un mesero por estación y un capitán por área en cada rol.
- El modo del área en el rol (`rol_areas`) decide quién atiende: el mesero de la estación, el siguiente en TIROS o nadie (sin servicio).
- Al asignar mesa a una visita, el trigger obtiene **estación → área → mesero → capitán** del rol publicado y guarda una copia, para que el historial no cambie si después se edita el rol.
- Una mesa solo puede tener una visita sentada a la vez; solo se asignan mesas en roles publicados.
- `enviar_rol_a_revision(id)`, `publicar_rol(id)` (solo gerencia), `regresar_rol_a_borrador(id)` y `cerrar_rol(id)` controlan el ciclo del rol; un trigger impide saltarse el flujo cambiando el estado directo.
- `rol_ajustar(operación, asignación, datos, motivo)` es la única forma de cambiar un rol publicado.
- `reasignar_visita(visita, mesero, motivo)` transfiere una mesa ocupada a otro mesero del rol.
- `empleados.estado` manda sobre `empleados.activo` (un trigger los mantiene iguales); solo un empleado *activo* entra al rol.
- Una asignación con advertencias de restricción o de autorización da el error `RA001`. Con motivo (vía `rol_ajustar`) se permite y queda en `rol_excepciones`.
- `cambiar_estado_mesa(mesa, estado)` no cambia una mesa ocupada; no se sienta a nadie en una mesa en limpieza, fuera de servicio o cerrada.

### Vistas y funciones para el frontend

| Objeto | Para qué |
|---|---|
| `v_mesas_asignadas` | Mesa → estación → área → mesero → capitán de cada rol |
| `v_mesas_rol` | Por rol y mesa: modo del área, mesero (por estaciones) y si se puede sentar |
| `mesero_siguiente_tiro(rol, área)` | Mesero en TIROS con menos comensales (luego menos mesas) |
| `publicar_semana(lunes, publicar)` | Publica o regresa a borrador los horarios de una semana |
| `crear_dispositivo`, `generar_enlace_dispositivo`, `vincular_dispositivo`, `mi_dispositivo`, `revocar_dispositivo` | Alta, enlace de un solo uso, vinculación de la tablet y revocación |
| `v_comensales_mesero` | Comensales y mesas atendidas por mesero en cada rol |
| `v_orden_salida` | Meseros de cierre por área, de menos a más comensales |
| `v_encuestas_contexto` | Cada respuesta con mesa, mesero, capitán, área, turno y promedio |
| `v_encuestas_detalle` | Cada respuesta a cada pregunta con su contexto (para resultados por pregunta) |
| `registrar_encuesta(visita, encuesta, respuestas, comentario)` | Guarda una encuesta completa y valida cada respuesta |
| `visitas_sin_encuesta(fecha, encuesta)` | Visitas atendidas del día que faltan por encuestar |
| `indicadores(desde, hasta)` | Indicadores del periodo (todo para gerencia, capitán y supervisor; lo propio para un mesero) |
| `resumen_del_dia(fecha)` | Operación del día para el Dashboard |
| `evaluar_alertas()` | Revisa las reglas de umbral del día sin duplicar alertas |
| `atender_alerta(alerta, nota)` | Marca una alerta como atendida (solo su perfil destinatario, gerente o admin) |
| `invitar_usuario(correo, nombre, perfil, empleado)` / `cancelar_invitacion(correo)` | Alta de usuarios sin manejar contraseñas |
| `registrar_exportacion(tipo, filtros, filas)` | Revisa el permiso y registra la exportación antes de descargar |
| `v_auditoria` | Auditoría con el nombre de quien hizo cada cambio (solo admin) |
| `empleados_disponibles(fecha, turno)` | Quién está disponible, de descanso o ausente, con su estado |
| `conflictos_rol(rol)` | Lo que hay que revisar del rol: estado, ausencias, horario, restricciones, cobertura y carga |
| `cambiar_estado_mesa(mesa, estado)` | Disponible, reservada, en limpieza, fuera de servicio o cerrada |
| `cierre_preparar`, `cierre_agregar_participante`, `cierre_quitar_participante`, `cierre_calcular`, `cierre_ajustar`, `cierre_regresar`, `cierre_autorizar` | Todo el flujo del cierre; las tablas del cierre son de solo lectura por la API |

### Permisos (RLS)

| Quién | Puede modificar |
|---|---|
| admin, gerente | Todo lo anterior, configuración, encuestas y reglas de alerta |
| rrhh | Empleados, ausencias, horarios, áreas permitidas y restricciones |
| capitan, supervisor | Rol diario y visitas |
| hostess (persona o tablet de recepción) | Visitas, estado de las mesas y captura de encuestas |
| tablet de encuestas | Solo captura de encuestas |
| mesero, runner | Nada; solo consultan |

| Quién | Puede leer |
|---|---|
| admin, gerente, rrhh, capitan, supervisor | Datos completos de empleados y horarios; disponibilidad (`empleados_disponibles`), que revela ausencias |
| hostess | Rol publicado, mesas y todas las visitas del turno; de empleados, solo nombre y puesto |
| mesero, runner | Su ficha, sus horarios, sus ausencias, las visitas que atendieron y el rol **publicado**; de los demás, solo nombre y puesto |

- Los nombres de los compañeros salen de la vista `empleados_directorio` (id, nombre, puesto, activo), que no expone teléfono, correo ni fechas.
- Un rol en **borrador** solo lo ven quienes lo arman.
- La auditoría solo la lee `admin`.
- **Sin sesión (`anon`) no se puede leer nada ni ejecutar ninguna función.** Una sesión anónima de Supabase sin dispositivo vinculado tampoco lee nada: los catálogos, el rol y el directorio piden `rol_actual()` (perfil activo o tablet vinculada). A las funciones nuevas se les quita el permiso por defecto; hay que dar `grant execute` explícito a `authenticated` cuando la app las use.
- `ausencia_en` y `config_bool` son internas: solo las usan los triggers, que corren como dueño de la base (`security definer`).

> Al capturar encuestas con rol `hostess`, inserta sin pedir la fila de vuelta (`return=minimal`): la hostess puede registrar respuestas pero no leerlas.

### Cómo aplicarla

Con el CLI de Supabase (requiere Docker para la base local):

```bash
npx supabase init          # solo la primera vez; crea supabase/config.toml
npx supabase start         # base local
npx supabase db reset      # aplica migraciones + seed.sql
```

Para el proyecto en la nube hay dos caminos:

- Con el CLI: `npx supabase link --project-ref <ref>` y `npx supabase db push`.
- Sin el CLI: en el **SQL Editor** del dashboard, pega y corre **cada archivo de `migrations/` en orden** (por fecha en el nombre) y después `seed.sql`, que solo es para pruebas.

Una migración ya aplicada **nunca se edita**: los cambios van en una migración nueva.

> El seed crea datos ficticios. Antes de usar el sistema con personal real hay que borrar esos datos.

> Si el proyecto ya tiene tablas `usuarios` o `restaurantes`, la primera migración falla: hay que revisarlas antes de aplicarla.

Pruebas de reglas (con las migraciones y el seed cargados): corre `supabase/tests/reglas_operativas.sql` en el SQL Editor (o con `psql`). Deben aparecer los mensajes `OK 1` a `OK 24`. Todo se revierte al terminar, así que no cambia los datos. Las pruebas esperan los datos del seed tal como se crearon.

Usuarios de login:

1. En la app, **Usuarios → Nuevo usuario**: correo, nombre, perfil y empleado.
2. Crea la cuenta con el mismo correo en **Authentication → Users → Add user**. El perfil se liga solo (trigger `usuarios_desde_invitacion`).
3. El primer administrador se crea a mano en el SQL Editor:

```sql
insert into usuarios (id, nombre, email, rol)
values ('<uuid de auth.users>', 'Nombre', 'correo@dominio.com', 'admin');
```

### Supuestos pendientes de validar con el cliente

Están marcados con `SUPUESTO:` en el SQL.

| Supuesto | Dónde cambiarlo |
|---|---|
| Un solo restaurante | `restaurantes` / `empleados.restaurante_id` |
| Las ausencias aprobadas bloquean (no solo advierten) | `configuracion.ausencias_bloquean` |
| Las ausencias pasan por aprobación | `ausencias.estado` |
| No se exige horario para entrar al rol | `configuracion.exigir_horario_en_rol` |
| Turnos fijos (Matutino, Vespertino) como catálogo | `turnos` |
| Un mesero por estación y un capitán por área | Índices `rol_asignaciones_*` |
| Niño = 0.5 comensal | `visitas.comensales` |
| Empate en orden de salida: por nombre | `v_orden_salida` |
| Encuestas de 1 a 5 (o sí/no, texto), capturadas por personal en tablet y ligadas a la visita (decidido el 2026-11-22) | `preguntas.tipo`, `registrar_encuesta` |
| Umbrales y destinatarios iniciales de las alertas (tabla de la sección 9) | `reglas_alerta`, editables en Alertas → Reglas |
| Promedio bajo de encuestas: mínimo 3 encuestas | `evaluar_alertas` |
| Se conservan los nombres de perfil capitán y hostess (el documento propone "Supervisor de turno" y "Recepción") | `usuarios.rol`, `constants/roles.js` |
| Auditoría y registro de exportaciones: solo admin; plazo de conservación pendiente | Políticas `auditoria_leer`, `exportaciones_leer` |
| Exportar: solo gerente y admin | `registrar_exportacion`, `EXPORT_DATA` |
| El restaurante está en la zona centro de México ("hoy" de alertas y resumen del día) | `configuracion.zona_horaria` |
| Las restricciones advierten (con motivo se permite); no bloquean | Trigger `validar_restricciones_rol` |
| Se espera al menos un runner por turno | `configuracion.exigir_runner` |
| Sin límite de mesas por mesero | `configuracion.max_mesas_por_mesero` |
| Al cerrar una visita la mesa queda disponible (no pasa a limpieza) | `configuracion.limpieza_al_cerrar` |
| Cierre: participantes elegidos en cada cierre; autoriza solo gerencia; redondeo a pesos con sobrante a quien tiene más carga (decidido el 2026-11-22) | `20261123120000_cierre.sql` |
| Cierre: fórmula, anulaciones y correcciones de un cierre autorizado siguen pendientes con el cliente | `cierre_calcular`, `cierre_autorizar` |

### Falta en la base

- Envío de alertas por correo o mensajería (fuera de alcance por ahora; requiere Edge Function).
- Revisión periódica de alertas con pg_cron aunque nadie abra la app (opcional).
- Crear la cuenta (contraseña) desde la app: hoy se hace en Supabase → Authentication; hacerlo en la app requiere una Edge Function con la llave de servicio.
- Acceso público a encuestas si las llena el cliente (QR).

---

## Variables de entorno

Crea un archivo `.env` en la raíz basado en [.env.example](.env.example):

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

Sin estas variables la app arranca en **modo demo**: solo sirve para ver las pantallas, porque las de la nueva versión necesitan Supabase. Los correos de prueba ya no aparecen en la pantalla de login, pero siguen funcionando en modo demo:

| Email | Password | Rol |
|---|---|---|
| `admin@demo.com` | `demo1234` | Administrador |
| `gerente@demo.com` | `demo1234` | Gerente |
| `supervisor@demo.com` | `demo1234` | Supervisor |
| `mesero@demo.com` | `demo1234` | Mesero |

---

## Comandos

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo
npm run dev

# Build de producción
npm run build

# Preview del build
npm run preview

# Lint
npm run lint
```

El deploy no tiene comando: se hace solo al hacer push (ver "Deploy").

---

## Deploy

La app está publicada en **Cloudflare Pages**: **https://omnirest.pages.dev** (proyecto `omnirest`, conectado al repo de GitHub).

| Ajuste | Valor |
|---|---|
| Rama de producción | `develop` (pasar a `main` cuando `main` esté al día) |
| Framework preset | React (Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variables de entorno | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `NODE_VERSION=22` |

- **Cada push** a la rama de producción se publica solo en un par de minutos. Un push a otra rama genera una URL de prueba aparte (`<rama>.omnirest.pages.dev`).
- Las variables `VITE_*` se meten al código durante el build. Si se cambian en Cloudflare (Settings → Variables and Secrets), hay que volver a desplegar (Deployments → Retry deployment).
- Las rutas de React funcionan al recargar sin configuración extra: Pages sirve `index.html` cuando el build no trae `404.html`.

**Supabase → Authentication → URL Configuration:**

- **Site URL:** `https://omnirest.pages.dev`
- **Redirect URLs:**
  - `https://omnirest.pages.dev/**`
  - `https://*.omnirest.pages.dev/**` (URLs de prueba)
  - `http://localhost:5173/**` (desarrollo)

Sin esto, el correo de recuperar contraseña manda a `localhost`.

> El plan gratuito de Supabase pausa el proyecto tras unos 7 días sin uso. Si la app deja de cargar datos, revisa primero que el proyecto esté activo en el dashboard de Supabase.

---

## Formatters disponibles

Utilidades en [src/utils/formatters.js](src/utils/formatters.js):

```js
currency(valor)       // "$1,250"  (MXN, locale es-MX)
number(valor)         // "1,250"
percent(valor)        // "85.5%"
date(isoString)       // "27 may. 2026"
datetime(isoString)   // "27 may. 2026, 14:30"
relative(isoString)   // "Hace 3h"
fileSize(bytes)       // "1.4 MB"
initials(nombre)      // "LC" (Luis Cervantes)
```

---

## Pendientes conocidos

**Técnicos**
- **Lint sin configuración:** `npm run lint` falla porque no existe `.eslintrc.*`, aunque las dependencias de ESLint sí están instaladas.
- **Dependencias con vulnerabilidades:**
  - `xlsx`: grave, sin versión corregida. Solo la usa la subida de reportes, que está oculta.
  - `react-router`: moderada. Se resuelve actualizándolo.
- `@supabase/ssr` está instalado pero no se usa.
- **Rutas declaradas pero sin página:** `/reports/:id`, `/metrics/waiter/:id`, `/rankings/:id`, `/notices/:id`, etc.

**Pantallas de la versión anterior con datos de ejemplo**
- Dashboard (ventas, debajo del bloque "Hoy"). Rankings, Incentivos y Avisos quedaron ocultos (2026-11-23).
- Falta decidir con el cliente si se ocultan o se reemplazan.

**Frente al documento de contextualización (cubierto en parte)**
- **3.1:** disponibilidad por hora: el horario ya acepta horas (se deriva el turno), pero la disponibilidad y el rol siguen por turno.
- **4.2:** observaciones e incidencias del rol. El campo `roles_diarios.notas` existe, pero no tiene pantalla.
- **5:** runners por estación o solo en horas de alta demanda; hoy se asignan por área o por función de cocina.
- **6:** campos opcionales de la visita (observaciones, motivo de espera).
- **10:**
  - conservación y eliminación de datos (plazos pendientes del cliente);
  - script para borrar los datos ficticios del seed antes de operar.
- **14 y 15:** decisiones del cliente aún abiertas (ver "Supuestos") y documentos de casos de prueba y criterios de aceptación.
