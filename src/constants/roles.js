export const ROLES = {
  ADMIN:      'admin',
  GERENTE:    'gerente',
  SUPERVISOR: 'supervisor',
  MESERO:     'mesero',
  /* Gestión operativa */
  CAPITAN:    'capitan',
  HOSTESS:    'hostess',
  RUNNER:     'runner',
  RRHH:       'rrhh',
  /* Consulta indicadores generales sin modificar nada (contextualización 3.2) */
  ANALISTA:   'analista',
}

export const ROLE_LABELS = {
  [ROLES.ADMIN]:      'Administrador Global',
  [ROLES.GERENTE]:    'Gerente',
  [ROLES.SUPERVISOR]: 'Supervisor',
  [ROLES.MESERO]:     'Mesero',
  [ROLES.CAPITAN]:    'Capitán',
  [ROLES.HOSTESS]:    'Hostess',
  [ROLES.RUNNER]:     'Runner',
  [ROLES.RRHH]:       'Recursos Humanos',
  [ROLES.ANALISTA]:   'Analista',
}
