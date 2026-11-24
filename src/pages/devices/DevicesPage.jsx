import { useCallback, useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Modal from '../../components/ui/Modal'
import { useLoader } from '../../hooks/useLoader'
import {
  FUNCIONES_DISPOSITIVO, ESTADOS_DISPOSITIVO, linkUrl,
  listDevices, createDevice, newDeviceLink, revokeDevice,
} from '../../services/devices.service'
import { datetime } from '../../utils/formatters'

const EMPTY = { nombre: '', funcion: 'hostess' }

/* Tablets of the restaurant: registered by management, linked with a one-time
   link (no personal password on the tablet) and revoked when lost or replaced. */
export default function DevicesPage() {
  const { data, loading, error, reload } = useLoader(useCallback(() => listDevices(), []))
  const devices = Array.isArray(data) ? data : []

  const [form, setForm] = useState(null)
  const [link, setLink] = useState(null)       // { nombre, url }
  const [confirm, setConfirm] = useState(null) // device to revoke
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const act = async (fn) => {
    setBusy(true)
    setNotice(null)
    try {
      return await fn()
    } catch (err) {
      setNotice({ type: 'danger', text: err.message })
      return null
    } finally {
      setBusy(false)
      reload()
    }
  }

  const showLink = (nombre, token) => { setCopied(false); setLink({ nombre, url: linkUrl(token) }) }

  const create = async (e) => {
    e.preventDefault()
    const result = await act(() => createDevice(form.nombre, form.funcion))
    if (result) {
      setForm(null)
      showLink(form.nombre.trim(), result.token)
    }
  }

  const regenerate = async (d) => {
    const token = await act(() => newDeviceLink(d.id))
    if (token) showLink(d.nombre, token)
  }

  const revoke = async () => {
    const d = confirm
    setConfirm(null)
    const done = await act(async () => { await revokeDevice(d.id); return true })
    if (done) setNotice({ type: 'success', text: `${d.nombre} quedó revocado: ya no puede usar el sistema.` })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const expired = (d) => d.estado === 'pendiente' && d.token_expira && new Date(d.token_expira) < new Date()

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dispositivos</h1>
          <p className="page-subtitle">Tablets de recepción y de encuestas. Entran con un enlace de un solo uso, sin contraseña personal.</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" onClick={() => setForm(EMPTY)}>Nuevo dispositivo</Button>
        </div>
      </div>

      {error && <div style={{ marginBottom: 'var(--space-4)' }}><Alert type="danger" title="No se pudieron cargar los dispositivos">{error}</Alert></div>}
      {notice && <div style={{ marginBottom: 'var(--space-4)' }}><Alert type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert></div>}

      <div className="card">
        {loading && !devices.length ? <div className="loading-screen"><div className="spinner" /></div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Dispositivo</th><th>Función</th><th>Estado</th><th>Vinculado</th><th>Último uso</th><th /></tr></thead>
              <tbody>
                {devices.length === 0 && (
                  <tr><td colSpan={6} className="text-sm text-muted">Todavía no hay dispositivos. Da de alta la tablet de recepción o la de encuestas.</td></tr>
                )}
                {devices.map((d) => {
                  const estado = ESTADOS_DISPOSITIVO[d.estado]
                  return (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 600 }}>{d.nombre}</td>
                      <td>{FUNCIONES_DISPOSITIVO[d.funcion] ?? d.funcion}</td>
                      <td>
                        <Badge variant={expired(d) ? 'danger' : estado?.variant}>{expired(d) ? 'Enlace vencido' : estado?.label}</Badge>
                      </td>
                      <td className="text-sm">{d.vinculado_at ? datetime(d.vinculado_at) : '—'}</td>
                      <td className="text-sm">{d.ultimo_uso ? datetime(d.ultimo_uso) : '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {d.estado === 'pendiente' && (
                          <Button variant="secondary" size="sm" disabled={busy} onClick={() => regenerate(d)}>Nuevo enlace</Button>
                        )}
                        {d.estado !== 'revocado' && (
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm(d)}>Revocar</Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 'var(--space-4)' }}>
        <h3 className="section-title">Cómo se vincula una tablet</h3>
        <ol className="text-sm" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Da de alta el dispositivo y elige su función: <strong>Hostess</strong> (recepción y encuestas al liberar mesa) o <strong>Encuestas</strong> (solo captura).</li>
          <li>Abre el enlace en el navegador de la tablet (vence en 24 horas y sirve una sola vez).</li>
          <li>La tablet queda dentro con su función; en la auditoría aparece como «Dispositivo: nombre».</li>
          <li>Si se pierde o se cambia, <strong>revócala</strong> y da de alta una nueva.</li>
        </ol>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title="Nuevo dispositivo" size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="device-form" loading={busy} disabled={!form?.nombre.trim()}>Crear y generar enlace</Button>
          </>
        )}>
        {form && (
          <form id="device-form" onSubmit={create}>
            <div className="form-group">
              <label className="form-label" htmlFor="device-name">Nombre <span className="required">*</span></label>
              <input id="device-name" className="form-input" value={form.nombre} autoFocus placeholder="Ej: Tablet recepción"
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="device-function">Función</label>
              <select id="device-function" className="form-select" value={form.funcion}
                onChange={(e) => setForm((f) => ({ ...f, funcion: e.target.value }))}>
                {Object.entries(FUNCIONES_DISPOSITIVO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!link} onClose={() => setLink(null)} title={link ? `Enlace para ${link.nombre}` : ''} size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setLink(null)}>Listo</Button>
            <Button variant="primary" onClick={copy}>{copied ? 'Copiado ✓' : 'Copiar enlace'}</Button>
          </>
        )}>
        {link && (
          <>
            <p className="text-sm" style={{ marginBottom: 'var(--space-3)' }}>
              Ábrelo en la tablet. Vence en <strong>24 horas</strong> y solo funciona una vez; no se vuelve a mostrar.
            </p>
            <input className="form-input" readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Enlace de vinculación" />
          </>
        )}
      </Modal>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Revocar dispositivo" size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>Cancelar</Button>
            <Button variant="danger" onClick={revoke}>Revocar</Button>
          </>
        )}>
        {confirm && <p>{confirm.nombre} dejará de tener acceso en cuanto se refresque. No se puede deshacer: para volver a usar la tablet, da de alta un dispositivo nuevo.</p>}
      </Modal>
    </div>
  )
}
