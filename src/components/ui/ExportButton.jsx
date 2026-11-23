import { useState } from 'react'
import Button from './Button'
import { useAuthStore } from '../../store/auth.store'
import { PERMISSIONS } from '../../constants/permissions'
import { exportCsv } from '../../services/export.service'

/* "Exportar CSV" for users with EXPORT_DATA. getExport() returns
   { tipo, filtros, rows, columns, filename }; the export is logged first. */
export default function ExportButton({ getExport, disabled, label = 'Exportar CSV' }) {
  const { hasPermission } = useAuthStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!hasPermission(PERMISSIONS.EXPORT_DATA)) return null

  const run = async () => {
    setBusy(true)
    setError('')
    try {
      await exportCsv(getExport())
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <Button variant="secondary" size="sm" onClick={run} loading={busy} disabled={disabled}
        title="Queda registrado quién exportó, qué y cuándo">{label}</Button>
      {error && <span className="text-sm" role="alert" style={{ color: 'var(--color-red-600, #dc2626)' }}>{error}</span>}
    </span>
  )
}
