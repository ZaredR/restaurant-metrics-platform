# Restaurant Metrics Platform

Plataforma web para el seguimiento de métricas de desempeño en cadenas de restaurantes. Permite cargar reportes de ventas, visualizar KPIs por mesero y sucursal, gestionar incentivos y publicar avisos internos.

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
| Deploy | Firebase Hosting |

---

## Estructura del proyecto

```
restaurant-metrics-platform/
├── index.html
├── vite.config.js
├── firebase.json           # Configuración de deploy en Firebase Hosting
├── .env.example            # Variables de entorno requeridas
└── src/
    ├── main.jsx            # Entry point — monta React y carga estilos globales
    ├── App.jsx             # Envuelve la app con BrowserRouter
    ├── router/
    │   └── AppRouter.jsx   # Rutas, guards de autenticación y permisos
    ├── constants/
    │   ├── routes.js       # Todas las rutas de la app como constantes
    │   ├── roles.js        # Definición de roles (admin, gerente, supervisor, mesero)
    │   └── permissions.js  # Permisos por rol (ROLE_PERMISSIONS)
    ├── store/
    │   └── auth.store.js   # Store de Zustand — sesión del usuario
    ├── hooks/
    │   └── useAuth.js      # Hook que conecta el store con los servicios de auth
    ├── services/
    │   ├── supabase.js         # Cliente de Supabase (lazy init)
    │   ├── auth.service.js     # Login, logout, recuperar contraseña
    │   └── fileParser.service.js # Parseo de CSV/Excel y cálculo de KPIs
    ├── utils/
    │   └── formatters.js   # Formateadores: moneda, fecha, porcentaje, etc.
    ├── components/
    │   ├── layout/         # AppLayout, Sidebar, Topbar
    │   └── ui/             # Alert, Avatar, Badge, Button, DataTable, FileUpload, KPICard, Modal
    ├── pages/              # Una carpeta por módulo (auth, dashboard, metrics, rankings,
    │                       # incentives, notices, history, reports, restaurants, users,
    │                       # config, profile, audit)
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
| `/dashboard` | Dashboard | Autenticado |
| `/profile` | Profile | Autenticado |
| `/metrics` | MetricsDashboard | Autenticado |
| `/rankings` | RankingGeneral | Autenticado |
| `/incentives` | IncentiveList | Autenticado |
| `/incentives/new`, `/incentives/:id/edit` | IncentiveForm | Autenticado |
| `/notices` | NoticeList | Autenticado |
| `/notices/new` | NoticeCreate | Autenticado |
| `/history` | History | Autenticado |
| `/reports` | ReportHistory | `UPLOAD_REPORTS` |
| `/reports/upload` | ReportUpload | `UPLOAD_REPORTS` |
| `/restaurants` | RestaurantList | `VIEW_RESTAURANTS` |
| `/restaurants/new`, `/restaurants/:id/edit` | RestaurantForm | `VIEW_RESTAURANTS` |
| `/users` | UserList | `VIEW_USERS` |
| `/users/new`, `/users/:id/edit` | UserForm | `VIEW_USERS` |
| `/config` | Config | `VIEW_CONFIG` |
| `/audit` | Audit | `VIEW_AUDIT` |
| `/staff` | StaffList (personal) — requiere Supabase | `VIEW_STAFF` |
| `/floor` | FloorConfig (áreas, estaciones, mesas) — requiere Supabase | `VIEW_FLOOR` |
| `/schedules` | WeeklySchedule (horario semanal) — requiere Supabase | `VIEW_SCHEDULES` (editar: `MANAGE_SCHEDULES`) |
| `/absences` | AbsenceList (vacaciones, incapacidades, permisos) — requiere Supabase | `MANAGE_SCHEDULES` |
| `/roster` | DailyRoster (rol diario: capitanes, meseros, cierre, runners, hostess) — requiere Supabase | `VIEW_ROSTER` (editar: `MANAGE_ROSTER`) |

| `/hostess` | HostessDesk (llegadas, lista de espera, mapa de mesas, comensales por mesero) — requiere Supabase | `HOSTESS_DESK` |

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

Cualquier ruta desconocida redirige a `/dashboard`.

`/dashboard` muestra una vista distinta según el rol: `DashboardAdmin` (admin y gerente), `DashboardSupervisor` o `DashboardMesero`.

> **Estado actual:** solo el login usa Supabase. Las páginas de listados (usuarios, restaurantes, reportes, incentivos, avisos, historial, auditoría) muestran **datos de ejemplo** definidos dentro de cada componente; todavía no leen ni escriben en la base de datos.

---

## Sistema de roles y permisos

Los roles están definidos en [src/constants/roles.js](src/constants/roles.js) y los permisos en [src/constants/permissions.js](src/constants/permissions.js).

### Roles

| Rol | Label |
|---|---|
| `admin` | Administrador Global |
| `gerente` | Gerente |
| `supervisor` | Supervisor |
| `mesero` | Mesero |

### Permisos por rol

| Permiso | Admin | Gerente | Supervisor | Mesero |
|---|:---:|:---:|:---:|:---:|
| VIEW_RESTAURANTS | ✓ | ✓ | | |
| MANAGE_RESTAURANTS | ✓ | | | |
| VIEW_USERS | ✓ | ✓ | | |
| MANAGE_USERS | ✓ | ✓ | | |
| UPLOAD_REPORTS | ✓ | ✓ | | |
| VIEW_REPORTS | ✓ | ✓ | | |
| VIEW_METRICS | ✓ | ✓ | ✓ | ✓ |
| VIEW_GLOBAL_METRICS | ✓ | ✓ | | |
| VIEW_RANKINGS | ✓ | ✓ | ✓ | ✓ |
| MANAGE_INCENTIVES | ✓ | ✓ | | |
| VIEW_INCENTIVES | ✓ | ✓ | ✓ | ✓ |
| PUBLISH_NOTICES | ✓ | ✓ | ✓ | |
| VIEW_NOTICES | ✓ | ✓ | ✓ | ✓ |
| VIEW_CONFIG | ✓ | | | |
| MANAGE_CONFIG | ✓ | | | |
| VIEW_AUDIT | ✓ | | | |

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

## Base de datos (Supabase)

Tablas referenciadas en el código:

| Tabla | Uso |
|---|---|
| `usuarios` | Perfiles de usuarios vinculados a Supabase Auth |
| `restaurantes` | Sucursales; relacionada con `usuarios.restaurante_id` |

---

## Base de datos en Supabase (nueva versión: gestión operativa)

La carpeta `supabase/` contiene la base de la nueva versión. No cambia nada de `src/`: la versión actual sigue funcionando igual, y `usuarios` y `restaurantes` conservan las columnas que usa `auth.service.js`.

```
supabase/
├── migrations/
│   ├── 20261103120000_esquema_operativo.sql  # Tablas y restricciones
│   ├── 20261103120100_reglas_y_vistas.sql    # Triggers, funciones, vistas y auditoría
│   ├── 20261103120200_seguridad_rls.sql      # Permisos por rol (RLS)
│   ├── 20261104120000_tiempo_real_hostess.sql # Realtime para visitas y rol
│   └── 20261121120000_ajustes_y_reasignaciones.sql # Estados del rol, ajustes y reasignaciones con motivo
├── seed.sql                                  # Datos de ejemplo (fechas relativas a hoy)
└── tests/
    └── reglas_operativas.sql                 # Pruebas de reglas (se revierten al terminar)
```

### Tablas

| Módulo | Tablas |
|---|---|
| Personal | `empleados`, `usuarios` (login, ligado a `empleado_id`), `configuracion` |
| Disponibilidad | `ausencias`, `turnos`, `horarios` |
| Catálogo del local | `areas`, `estaciones`, `mesas` |
| Rol diario | `roles_diarios` (borrador → en revisión → publicado → modificado → cerrado), `rol_asignaciones`, `rol_ajustes` |
| Reasignaciones | `visita_reasignaciones` (cambios de mesero responsable con motivo) |
| Hostess | `visitas` (comensales = adultos + niños × 0.5, columna calculada) |
| Encuestas | `encuestas`, `preguntas`, `respuestas_encuesta`, `respuestas_detalle` |
| Alertas | `reglas_alerta`, `alertas` |
| Trazabilidad | `auditoria` (la llena un trigger en las tablas principales) |

### Reglas que aplica la base de datos

- No se programa ni se asigna al rol a un empleado con **ausencia aprobada** ese día (configurable con `configuracion.ausencias_bloquean`).
- Cada mesa pertenece a una sola estación; un mesero por estación y un capitán por área en cada rol.
- Al asignar mesa a una visita, el trigger obtiene **estación → área → mesero → capitán** del rol publicado y guarda una copia, para que el historial no cambie si después se edita el rol.
- Una mesa solo puede tener una visita sentada a la vez; solo se asignan mesas en roles publicados.
- `enviar_rol_a_revision(id)`, `publicar_rol(id)` (solo gerencia), `regresar_rol_a_borrador(id)` y `cerrar_rol(id)` controlan el ciclo del rol; un trigger impide saltarse el flujo cambiando el estado directo.
- `rol_ajustar(operación, asignación, datos, motivo)` es la única forma de cambiar un rol publicado.
- `reasignar_visita(visita, mesero, motivo)` transfiere una mesa ocupada a otro mesero del rol.

### Vistas y funciones para el frontend

| Objeto | Para qué |
|---|---|
| `v_mesas_asignadas` | Mesa → estación → área → mesero → capitán de cada rol |
| `v_comensales_mesero` | Comensales y mesas atendidas por mesero en cada rol |
| `v_orden_salida` | Meseros de cierre por área, de menos a más comensales |
| `v_encuestas_contexto` | Cada respuesta con mesa, mesero, capitán, área, turno y promedio |
| `empleados_disponibles(fecha, turno)` | Quién está disponible, de descanso o ausente |

### Permisos (RLS)

| Quién | Puede modificar |
|---|---|
| admin, gerente | Todo lo anterior, configuración, encuestas y reglas de alerta |
| rrhh | Empleados, ausencias y horarios |
| capitan, supervisor | Rol diario y visitas |
| hostess | Visitas y captura de encuestas |
| mesero, runner | Nada; solo consultan |

| Quién | Puede leer |
|---|---|
| admin, gerente, rrhh, capitan, supervisor | Datos completos de empleados y horarios; disponibilidad (`empleados_disponibles`), que revela ausencias |
| hostess | Rol publicado, mesas y todas las visitas del turno; de empleados, solo nombre y puesto |
| mesero, runner | Su ficha, sus horarios, sus ausencias, las visitas que atendieron y el rol **publicado**; de los demás, solo nombre y puesto |

- Los nombres de los compañeros salen de la vista `empleados_directorio` (id, nombre, puesto, activo), que no expone teléfono, correo ni fechas.
- Un rol en **borrador** solo lo ven quienes lo arman.
- La auditoría solo la lee `admin`.
- **Sin sesión (`anon`) no se puede leer nada ni ejecutar ninguna función.** A las funciones nuevas se les quita el permiso por defecto; hay que dar `grant execute` explícito a `authenticated` cuando la app las use.
- `ausencia_en` y `config_bool` son internas: solo las usan los triggers, que corren como dueño de la base (`security definer`).

> Al capturar encuestas con rol `hostess`, inserta sin pedir la fila de vuelta (`return=minimal`): la hostess puede registrar respuestas pero no leerlas.

### Cómo aplicarla

Con el CLI de Supabase (requiere Docker para la base local):

```bash
npx supabase init          # solo la primera vez; crea supabase/config.toml
npx supabase start         # base local
npx supabase db reset      # aplica migraciones + seed.sql
```

Para el proyecto en la nube: `npx supabase link --project-ref <ref>` y `npx supabase db push`, o pega los tres archivos de `migrations/` (en orden) y luego `seed.sql` en el editor SQL del dashboard.

> Si el proyecto ya tiene tablas `usuarios` o `restaurantes`, la primera migración falla: hay que revisarlas antes de aplicarla.

Pruebas de reglas (con la base ya cargada):

```bash
psql "$DATABASE_URL" -f supabase/tests/reglas_operativas.sql
```

Usuarios de login: créalos en **Authentication → Users** del dashboard y luego liga su perfil:

```sql
insert into usuarios (id, nombre, email, rol, empleado_id)
values ('<uuid de auth.users>', 'Fernanda Cruz', 'hostess@demo.com', 'hostess',
        (select id from empleados where numero_empleado = 'E015'));
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
| Encuestas de 1 a 5, capturadas por personal | `preguntas.tipo`, políticas de `respuestas_*` |
| Umbrales de alerta de ejemplo | `reglas_alerta` (seed) |

### Falta en la base

- Evaluador de alertas (cron) y envío de correo (Edge Function).
- Alta de usuarios desde la app (requiere una Edge Function con la llave de servicio).
- Acceso público a encuestas si las llena el cliente (QR).

---

## Variables de entorno

Crea un archivo `.env` en la raíz basado en [.env.example](.env.example):

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

Sin estas variables la app arranca en **modo demo** con usuarios de prueba:

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

# Deploy a Firebase (requiere firebase-tools instalado)
firebase deploy
```

---

## Deploy

El proyecto se despliega en **Firebase Hosting**. El archivo [firebase.json](firebase.json) configura:
- Carpeta pública: `dist/` (salida de Vite)
- Rewrite `**` → `index.html` para que el routing del lado del cliente funcione correctamente
- Cache de 1 año para assets estáticos (`.js`, `.css`)
- Headers de seguridad: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`

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

- **Lint sin configuración:** `npm run lint` falla porque no existe `.eslintrc.*` en el proyecto, aunque las dependencias de ESLint sí están instaladas.
- **Ruta `/reset-password` inexistente:** `recoverPassword()` envía al usuario a `/reset-password` tras el correo de recuperación, pero esa ruta no está definida en el router (cae en el fallback a `/dashboard`). `updatePassword()` ya existe en `auth.service.js` pero ninguna página la usa.
- **Rutas de creación sin guard de permiso:** `/incentives/new`, `/incentives/:id/edit` y `/notices/new` solo exigen sesión; no verifican `MANAGE_INCENTIVES` ni `PUBLISH_NOTICES`, así que un mesero puede abrirlas escribiendo la URL.
- **Rutas declaradas pero sin página:** `routes.js` define rutas de detalle (`/reports/:id`, `/metrics/waiter/:id`, `/rankings/:id`, `/notices/:id`, etc.) que aún no tienen página asociada en el router.
- **Persistencia de datos:** conectar las páginas con las tablas de Supabase en lugar de los datos de ejemplo.
