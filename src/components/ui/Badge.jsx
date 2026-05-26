const variants = {
  success: 'badge-success',
  danger:  'badge-danger',
  warning: 'badge-warning',
  info:    'badge-info',
  neutral: 'badge-neutral',
  brand:   'badge-brand',
  purple:  'badge-purple',
}

export default function Badge({ children, variant = 'neutral', className = '' }) {
  return (
    <span className={`badge ${variants[variant] ?? 'badge-neutral'} ${className}`}>
      {children}
    </span>
  )
}

export function RoleBadge({ role }) {
  const map = {
    admin:      { label: 'Admin Global', variant: 'purple' },
    gerente:    { label: 'Gerente',      variant: 'brand' },
    supervisor: { label: 'Supervisor',   variant: 'info' },
    mesero:     { label: 'Mesero',       variant: 'neutral' },
  }
  const cfg = map[role] ?? { label: role, variant: 'neutral' }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

export function StatusBadge({ active }) {
  return (
    <Badge variant={active ? 'success' : 'neutral'}>
      {active ? 'Activo' : 'Inactivo'}
    </Badge>
  )
}
