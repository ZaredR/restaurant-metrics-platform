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
