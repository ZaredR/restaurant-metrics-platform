export default function KPICard({
  label,
  value,
  trend,
  trendLabel,
  icon: Icon,
  accentColor = 'var(--color-brand)',
  iconBg = 'var(--color-amber-100)',
  iconColor = 'var(--color-amber-600)',
  formatter = (v) => v,
}) {
  const trendClass =
    trend > 0 ? 'kpi-trend-up' :
    trend < 0 ? 'kpi-trend-down' :
    'kpi-trend-neutral'

  const trendIcon =
    trend > 0 ? '↑' :
    trend < 0 ? '↓' :
    '→'

  return (
    <div className="kpi-card" style={{ '--kpi-accent': accentColor, '--kpi-icon-bg': iconBg, '--kpi-icon-color': iconColor }}>
      <div className="kpi-card-header">
        <div>
          <p className="kpi-card-label">{label}</p>
        </div>
        {Icon && (
          <div className="kpi-card-icon">
            <Icon size={20} />
          </div>
        )}
      </div>
      <p className="kpi-card-value">{formatter(value)}</p>
      {trend !== undefined && (
        <p className={`kpi-card-trend ${trendClass}`}>
          <span>{trendIcon}</span>
          <span>{Math.abs(trend)}%</span>
          {trendLabel && <span className="text-muted text-xs"> {trendLabel}</span>}
        </p>
      )}
    </div>
  )
}
