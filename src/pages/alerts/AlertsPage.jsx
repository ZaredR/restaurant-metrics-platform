import { useCallback, useEffect, useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../store/auth.store'
import { PERMISSIONS } from '../../constants/permissions'
import { useLoader } from '../../hooks/useLoader'
import {
  NIVELES, TIPOS_ALERTA, PERFILES_DESTINO, evaluateAlerts, listAlerts, attendAlert, listRules, saveRule,
  subscribeToAlerts,
} from '../../services/alerts.service'
import { datetime } from '../../utils/formatters'

export default function AlertsPage() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission(PERMISSIONS.MANAGE_ALERT_RULES)
  const [tab, setTab] = useState('pendientes')

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Alertas</h1>
          <p className="page-subtitle">Solo dentro del sistema. Cada quien ve las alertas dirigidas a su perfil.</p>
        </div>
      </div>
      <div className="tabs">
        {[['pendientes', 'Pendientes'], ['atendidas', 'Atendidas'], ...(canManage ? [['reglas', 'Reglas']] : [])].map(([k, l]) => (
          <button key={k} className={`tab-btn ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'reglas' ? <RulesTab /> : <AlertList pendientes={tab === 'pendientes'} />}
    </div>
  )
}

function AlertList({ pendientes }) {
  const load = useCallback(async () => {
    if (pendientes) await evaluateAlerts({ force: true }).catch(() => 0)
    return listAlerts(pendientes)
  }, [pendientes])
  const { data: alerts, loading, error, reload } = useLoader(load)
  const [attending, setAttending] = useState(null) // { alerta, nota }
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    try {
      return subscribeToAlerts(() => reload())
    } catch {
      return undefined
    }
  }, [reload])

  const attend = async () => {
    const { alerta, nota } = attending
    setAttending(null)
    setBusy(true)
    setNotice(null)
    try {
      await attendAlert(alerta.id, nota.trim())
      setNotice({ type: 'success', text: 'Alerta atendida.' })
      await reload()
    } catch (err) {
      setNotice({ type: 'danger', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      {notice && <div style={{ marginBottom: 'var(--space-3)' }}><Alert type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert></div>}
      {error && <Alert type="danger" title="No se pudieron cargar las alertas">{error}</Alert>}
      {loading && !alerts.length ? <div className="loading-screen"><div className="spinner" /></div> : alerts.length === 0 ? (
        <p className="text-sm text-muted">{pendientes ? 'No hay alertas pendientes para tu perfil.' : 'Todavía no hay alertas atendidas.'}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {alerts.map((a) => {
            const nivel = NIVELES[a.nivel] ?? NIVELES.info
            return (
              <li key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
                <Badge variant={nivel.variant}>{nivel.label}</Badge>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>{a.mensaje}</div>
                  <div className="text-sm text-muted">
                    {a.regla?.nombre ?? 'Alerta'} · {datetime(a.created_at)}
                    {a.atendida && ` · atendió ${a.atendida_nombre ?? '—'} el ${datetime(a.atendida_at)}`}
                  </div>
                  {a.nota && <div className="text-sm" style={{ marginTop: 4 }}>Nota: {a.nota}</div>}
                </div>
                {pendientes && (
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => setAttending({ alerta: a, nota: '' })}>Atender</Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Modal
        open={!!attending}
        onClose={() => setAttending(null)}
        title="Atender alerta"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAttending(null)}>Cancelar</Button>
            <Button variant="primary" onClick={attend}>Marcar como atendida</Button>
          </>
        }
      >
        {attending && (
          <>
            <p style={{ marginBottom: 'var(--space-3)' }}>{attending.alerta.mensaje}</p>
            <div className="form-group">
              <label className="form-label" htmlFor="alert-note">¿Qué se hizo? (opcional)</label>
              <input id="alert-note" className="form-input" value={attending.nota} autoFocus
                onChange={(e) => setAttending((x) => ({ ...x, nota: e.target.value }))} placeholder="Ej: se mandó apoyo a la terraza" />
            </div>
            <p className="text-sm text-muted">Queda registrado quién la atendió y cuándo.</p>
          </>
        )}
      </Modal>
    </div>
  )
}

function RulesTab() {
  const { data: rules, loading, error, reload } = useLoader(listRules)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const save = async () => {
    setBusy(true)
    setNotice(null)
    try {
      await saveRule(editing)
      setEditing(null)
      setNotice({ type: 'success', text: 'Regla guardada.' })
      await reload()
    } catch (err) {
      setNotice({ type: 'danger', text: err.message })
    } finally {
      setBusy(false)
    }
  }
  const perfil = (v) => PERFILES_DESTINO.find((p) => p.value === v)?.label ?? v
  const tipo = editing && TIPOS_ALERTA[editing.tipo]

  return (
    <div className="card">
      {notice && <div style={{ marginBottom: 'var(--space-3)' }}><Alert type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert></div>}
      {error && <Alert type="danger">{error}</Alert>}
      {loading && !rules.length ? <div className="loading-screen"><div className="spinner" /></div> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Regla</th><th>Grupo</th><th>Umbral</th><th>Para</th><th>Nivel</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {rules.map((r) => {
                const t = TIPOS_ALERTA[r.tipo] ?? {}
                return (
                  <tr key={r.id}>
                    <td>{r.nombre}</td>
                    <td className="text-sm text-muted">{t.grupo}</td>
                    <td>{t.umbral ? `${Number(r.umbral)}${t.periodo ? ` · ${r.periodo_dias} días` : ''}` : '—'}</td>
                    <td className="text-sm">{r.destinatarios.map(perfil).join(', ') || '—'}</td>
                    <td><Badge variant={NIVELES[r.nivel]?.variant}>{NIVELES[r.nivel]?.label}</Badge></td>
                    <td>{r.activa ? <Badge variant="success">Activa</Badge> : <Badge>Inactiva</Badge>}</td>
                    <td><Button variant="ghost" size="sm" onClick={() => setEditing({ ...r })}>Editar</Button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-muted" style={{ marginTop: 'var(--space-3)' }}>
        Las de reasignación, excepción y respuesta crítica salen al momento; las de umbral se revisan cada vez que alguien abre la app.
      </p>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.nombre ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" loading={busy} disabled={!editing?.destinatarios.length} onClick={save}>Guardar</Button>
          </>
        }
      >
        {editing && (
          <>
            {tipo?.umbral && (
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="rule-threshold">{tipo.umbral}</label>
                  <input id="rule-threshold" className="form-input" type="number" step="0.1" value={editing.umbral}
                    onChange={(e) => setEditing((r) => ({ ...r, umbral: e.target.value }))} />
                </div>
                {tipo.periodo && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="rule-period">Últimos días</label>
                    <input id="rule-period" className="form-input" type="number" min="1" value={editing.periodo_dias}
                      onChange={(e) => setEditing((r) => ({ ...r, periodo_dias: e.target.value }))} />
                  </div>
                )}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Para (perfiles que la reciben)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {PERFILES_DESTINO.map((p) => (
                  <label key={p.value} className="text-sm" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={editing.destinatarios.includes(p.value)}
                      onChange={(e) => setEditing((r) => ({
                        ...r,
                        destinatarios: e.target.checked ? [...r.destinatarios, p.value] : r.destinatarios.filter((x) => x !== p.value),
                      }))} />
                    {p.label}
                  </label>
                ))}
              </div>
              <p className="text-sm text-muted" style={{ marginTop: 4 }}>Gerente y admin ven todas las alertas aunque no estén marcados.</p>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="rule-level">Nivel</label>
                <select id="rule-level" className="form-select" value={editing.nivel} onChange={(e) => setEditing((r) => ({ ...r, nivel: e.target.value }))}>
                  {Object.entries(NIVELES).map(([v, n]) => <option key={v} value={v}>{n.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Estado</label>
                <label className="text-sm" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                  <input type="checkbox" checked={editing.activa} onChange={(e) => setEditing((r) => ({ ...r, activa: e.target.checked }))} />
                  Activa
                </label>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
