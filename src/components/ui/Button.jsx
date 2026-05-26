import { forwardRef } from 'react'

const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    icon: Icon,
    iconRight: IconRight,
    loading = false,
    className = '',
    type = 'button',
    ...props
  },
  ref
) {
  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : ''
  const variantClass = `btn-${variant}`

  return (
    <button
      ref={ref}
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <span className="spinner" style={{ width: 16, height: 16 }} />
      ) : Icon ? (
        <Icon size={16} />
      ) : null}
      {children}
      {!loading && IconRight && <IconRight size={16} />}
    </button>
  )
})

export default Button
