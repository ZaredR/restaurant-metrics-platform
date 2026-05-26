import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FileUpload from '../../components/ui/FileUpload'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import { parseFile, calculateKPIs } from '../../services/fileParser.service'
import { currency, number } from '../../utils/formatters'
import { ROUTES } from '../../constants/routes'

const STEPS = ['Seleccionar archivo', 'Validar columnas', 'Preview', 'Procesar']

export default function ReportUpload() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [kpis, setKpis] = useState([])
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleFile = (f) => {
    setFile(f)
    setError('')
    setParsed(null)
    if (f) setStep(0)
  }

  const handleValidate = async () => {
    if (!file) return
    setProcessing(true)
    setError('')
    try {
      const result = await parseFile(file)
      setParsed(result)
      if (!result.validation.valid) {
        setError(`Columnas requeridas faltantes: ${result.validation.missing.join(', ')}`)
        setStep(1)
      } else {
        const calculatedKPIs = calculateKPIs(result.rows)
        setKpis(calculatedKPIs)
        setStep(2)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setProcessing(false)
    }
  }

  const handleProcess = async () => {
    setProcessing(true)
    setError('')
    try {
      /* TODO: call reports.service.js → save to Supabase */
      await new Promise((r) => setTimeout(r, 1200))
      setStep(3)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setProcessing(false)
    }
  }

  if (done) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Reporte procesado</h1>
        </div>
        <div className="card" style={{ maxWidth: 560, textAlign: 'center', padding: 'var(--space-12)' }}>
          <div style={{ fontSize: 56, marginBottom: 'var(--space-4)' }}>✅</div>
          <h2 style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>¡Procesado exitosamente!</h2>
          <p className="text-muted text-sm" style={{ marginBottom: 'var(--space-6)' }}>
            Se importaron <strong>{parsed?.rows?.length ?? 0}</strong> filas y se calcularon KPIs para{' '}
            <strong>{kpis.length}</strong> meseros.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
            <Button variant="secondary" onClick={() => navigate(ROUTES.REPORTS)}>Ver historial</Button>
            <Button variant="primary" onClick={() => navigate(ROUTES.METRICS)}>Ver métricas</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Subir reporte</h1>
          <p className="page-subtitle">Importa un archivo CSV o XLSX de SoftRestaurant</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="steps" style={{ marginBottom: 'var(--space-8)', maxWidth: 600 }}>
        {STEPS.map((s, i) => (
          <div key={s} className={`step ${i < step ? 'done' : i === step ? 'active' : ''}`}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div className="step-circle">
                {i < step ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                ) : i + 1}
              </div>
              <span className="step-label">{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className="step-line" />}
          </div>
        ))}
      </div>

      <div className="card" style={{ maxWidth: 700 }}>
        {error && <Alert type="danger" onClose={() => setError('')} style={{ marginBottom: 'var(--space-4)' }}>{error}</Alert>}

        {/* Step 0: Select file */}
        {step === 0 && (
          <>
            <h3 className="section-title">Selecciona el archivo</h3>
            <FileUpload onFile={handleFile} />
            {file && (
              <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" onClick={handleValidate} loading={processing}>Validar archivo →</Button>
              </div>
            )}
          </>
        )}

        {/* Step 1: Validation error */}
        {step === 1 && parsed && (
          <>
            <h3 className="section-title">Resultado de validación</h3>
            <Alert type="danger">
              Columnas requeridas faltantes: <strong>{parsed.validation.missing.join(', ')}</strong>
            </Alert>
            <div className="card card-sm" style={{ marginTop: 'var(--space-4)', background: 'var(--color-navy-50)' }}>
              <p className="text-sm text-muted">Columnas encontradas en el archivo:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {parsed.validation.found.map((c) => <span key={c} className="badge badge-neutral">{c}</span>)}
              </div>
            </div>
            <Button variant="secondary" onClick={() => { setStep(0); setFile(null) }} style={{ marginTop: 'var(--space-4)' }}>
              Seleccionar otro archivo
            </Button>
          </>
        )}

        {/* Step 2: Preview */}
        {step === 2 && (
          <>
            <h3 className="section-title">Vista previa · {parsed?.rows?.length} filas</h3>
            <div className="table-wrapper" style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 'var(--space-4)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mesero</th><th>Ventas</th><th>Órdenes</th><th>Ticket prom.</th><th>Días</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.map((k) => (
                    <tr key={k.nombre}>
                      <td style={{ fontWeight: 500 }}>{k.nombre}</td>
                      <td>{currency(k.ventas)}</td>
                      <td>{number(k.ordenes)}</td>
                      <td>{currency(k.ticket_promedio)}</td>
                      <td>{k.dias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed?.errors?.length > 0 && (
              <Alert type="warning" style={{ marginBottom: 'var(--space-4)' }}>
                {parsed.errors.length} fila(s) con errores fueron omitidas.
              </Alert>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button variant="secondary" onClick={() => { setStep(0); setFile(null) }}>Cancelar</Button>
              <Button variant="primary" onClick={handleProcess} loading={processing}>
                Procesar y guardar →
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
