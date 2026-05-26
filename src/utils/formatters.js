export const currency = (v, locale = 'es-MX', currency = 'MXN') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v ?? 0)

export const number = (v, decimals = 0) =>
  new Intl.NumberFormat('es-MX', { maximumFractionDigits: decimals }).format(v ?? 0)

export const percent = (v, decimals = 1) =>
  `${Number(v ?? 0).toFixed(decimals)}%`

export const date = (v) =>
  v ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(v)) : '—'

export const datetime = (v) =>
  v ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)) : '—'

export const relative = (v) => {
  if (!v) return '—'
  const diff = Date.now() - new Date(v).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'Ahora mismo'
  if (mins < 60)  return `Hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `Hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `Hace ${days}d`
  return date(v)
}

export const fileSize = (bytes) => {
  if (bytes < 1024)         return `${bytes} B`
  if (bytes < 1024 ** 2)    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

export const initials = (name = '') =>
  name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
