export const ROUTES = {
  LOGIN:            '/login',
  RECOVER:          '/recover-password',
  DASHBOARD:        '/dashboard',
  RESTAURANTS:      '/restaurants',
  RESTAURANT_NEW:   '/restaurants/new',
  RESTAURANT_EDIT:  '/restaurants/:id/edit',
  USERS:            '/users',
  USER_NEW:         '/users/new',
  USER_EDIT:        '/users/:id/edit',
  USER_PROFILE:     '/users/:id',
  REPORTS:          '/reports',
  REPORT_UPLOAD:    '/reports/upload',
  REPORT_DETAIL:    '/reports/:id',
  METRICS:          '/metrics',
  METRICS_WAITER:   '/metrics/waiter/:id',
  METRICS_REST:     '/metrics/restaurant/:id',
  METRICS_HISTORY:  '/metrics/history',
  RANKINGS:         '/rankings',
  RANKING_DETAIL:   '/rankings/:id',
  RANKING_HISTORY:  '/rankings/history',
  INCENTIVES:       '/incentives',
  INCENTIVE_NEW:    '/incentives/new',
  INCENTIVE_EDIT:   '/incentives/:id/edit',
  INCENTIVE_DETAIL: '/incentives/:id',
  NOTICES:          '/notices',
  NOTICE_NEW:       '/notices/new',
  NOTICE_DETAIL:    '/notices/:id',
  HISTORY:          '/history',
  CONFIG:           '/config',
  PROFILE:          '/profile',
  AUDIT:            '/audit',
  /* Gestión operativa */
  STAFF:            '/staff',
  FLOOR:            '/floor',
  ABSENCES:         '/absences',
  SCHEDULES:        '/schedules',
  ROSTER:           '/roster',
  HOSTESS:          '/hostess',
}

/* Old-version screens hidden in the operational version: they don't
   show in the menu and their URLs redirect to the dashboard. The code
   stays; remove a path from here to show it again. */
export const HIDDEN_ROUTES = [
  ROUTES.RESTAURANTS,
  ROUTES.USERS,
  ROUTES.REPORTS,
  ROUTES.HISTORY,
  ROUTES.CONFIG,
]

export const isHiddenRoute = (path) =>
  HIDDEN_ROUTES.some((hidden) => path === hidden || path.startsWith(`${hidden}/`))
