import { useState } from 'react'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'

const TABS = ['General', 'KPIs', 'Visual', 'Sistema']

export default function Config() {
  const [tab, setTab] = useState('General')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    await new Promise(r => setTimeout(r, 800))
    setLoading(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuración</h1>
          <p className="page-subtitle">Ajusta el comportamiento del sistema</p>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {saved && <Alert type="success" onClose={() => setSaved(false)} style={{ marginBottom: 'var(--space-4)' }}>Configuración guardada correctamente.</Alert>}

      <div className="card" style={{ maxWidth: 640 }}>
        {tab === 'General' && (
          <>
            <h3 className="section-title">Configuración general</h3>
            <div className="form-group">
              <label className="form-label">Nombre del sistema</label>
              <input className="form-input" defaultValue="Métricas Restaurantes" />
            </div>
            <div className="form-group">
              <label className="form-label">Zona horaria</label>
              <select className="form-select" defaultValue="America/Mexico_City">
                <option value="America/Mexico_City">América/Ciudad de México (UTC-6)</option>
                <option value="America/Monterrey">América/Monterrey (UTC-6)</option>
                <option value="America/Cancun">América/Cancún (UTC-5)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Moneda</label>
              <select className="form-select" defaultValue="MXN">
                <option value="MXN">MXN — Peso Mexicano</option>
                <option value="USD">USD — Dólar</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Período por defecto de reportes</label>
              <select className="form-select" defaultValue="mes">
                <option value="semana">Semana</option>
                <option value="mes">Mes</option>
                <option value="trimestre">Trimestre</option>
              </select>
            </div>
          </>
        )}

        {tab === 'KPIs' && (
          <>
            <h3 className="section-title">Indicadores de desempeño</h3>
            {[
              { label: 'Meta de ventas mensual', placeholder: '$50,000', key: 'meta_ventas' },
              { label: 'Meta de ticket promedio', placeholder: '$160', key: 'meta_ticket' },
              { label: 'Meta de órdenes diarias', placeholder: '40', key: 'meta_ordenes' },
              { label: 'Meta de upsell mensual', placeholder: '$5,000', key: 'meta_upsell' },
            ].map((f) => (
              <div key={f.key} className="form-group">
                <label className="form-label">{f.label}</label>
                <input className="form-input" placeholder={f.placeholder} />
              </div>
            ))}
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="recalcular" style={{ width: 16, height: 16 }} />
              <label htmlFor="recalcular" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                Recalcular automáticamente al subir un reporte
              </label>
            </div>
          </>
        )}

        {tab === 'Visual' && (
          <>
            <h3 className="section-title">Identidad visual</h3>
            <div className="form-group">
              <label className="form-label">Logo del sistema</label>
              <div className="file-upload-zone" style={{ padding: 'var(--space-6)', cursor: 'pointer' }}>
                <p className="text-sm text-muted">Arrastra tu logo o haz clic para seleccionar</p>
                <p className="text-xs text-muted">PNG, SVG · Máx. 2MB</p>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Color primario</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="color" defaultValue="#F59E0B" style={{ width: 44, height: 36, borderRadius: 8, border: '1px solid var(--border-color)', cursor: 'pointer' }} />
                <input className="form-input" defaultValue="#F59E0B" style={{ maxWidth: 120, fontFamily: 'monospace' }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Nombre visible en sidebar</label>
              <input className="form-input" defaultValue="Métricas" />
            </div>
          </>
        )}

        {tab === 'Sistema' && (
          <>
            <h3 className="section-title">Parámetros técnicos</h3>
            <div className="form-group">
              <label className="form-label">Tamaño máximo de archivo CSV/XLSX</label>
              <select className="form-select" defaultValue="10">
                <option value="5">5 MB</option>
                <option value="10">10 MB</option>
                <option value="25">25 MB</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Retención de logs</label>
              <select className="form-select" defaultValue="90">
                <option value="30">30 días</option>
                <option value="90">90 días</option>
                <option value="365">1 año</option>
              </select>
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="backup" defaultChecked style={{ width: 16, height: 16 }} />
              <label htmlFor="backup" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                Backup automático diario (Supabase)
              </label>
            </div>
            <Alert type="info">
              La conexión a Supabase se configura en las variables de entorno. Ver <code>.env.example</code>.
            </Alert>
          </>
        )}

        <hr className="divider" />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={handleSave} loading={loading}>Guardar configuración</Button>
        </div>
      </div>
    </div>
  )
}
