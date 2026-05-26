const colors = [
  ['#FEF3C7','#D97706'], ['#DBEAFE','#2563EB'], ['#EDE9FE','#7C3AED'],
  ['#DCFCE7','#16A34A'], ['#FEE2E2','#DC2626'], ['#E0F2FE','#0284C7'],
]

function getColor(name = '') {
  const idx = name.charCodeAt(0) % colors.length
  return colors[idx]
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

export default function Avatar({ name, src, size = 'md', className = '' }) {
  const [bg, fg] = getColor(name)
  const sizeClass = `avatar-${size}`

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`avatar ${sizeClass} ${className}`}
        style={{ objectFit: 'cover' }}
      />
    )
  }

  return (
    <span
      className={`avatar ${sizeClass} ${className}`}
      style={{ background: bg, color: fg }}
      title={name}
    >
      {initials(name)}
    </span>
  )
}
