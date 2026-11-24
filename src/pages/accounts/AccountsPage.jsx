import { useCallback, useMemo, useState } from 'react'
import Badge, { RoleBadge, StatusBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../store/auth.store'
import { ROLES, ROLE_LABELS } from '../../constants/roles'
import { ROLE_PERMISSIONS } from '../../constants/permissions'
import { useLoader } from '../../hooks/useLoader'
import {
  listUsers, updateUser, listInvitations, inviteUser, cancelInvitation, listEmployeesForLink,
} from '../../services/accounts.service'
import { date } from '../../utils/formatters'

/* Profiles that the new version uses (the old ones stay valid for existing users). */
const PROFILE_ORDER = ['admin', 'gerente', 'supervisor', 'capitan', 'rrhh', 'hostess', 'mesero', 'runner', 'analista']

/* What each permission allows, grouped by module, for the read-only matrix. */
const ACTIONS = [
  ['Personal', [['VIEW_STAFF', 'Ver personal'], ['MANAGE_STAFF', 'Altas, bajas, disponibilidad y restricciones']]],
  ['Local', [['VIEW_FLOOR', 'Ver áreas, estaciones y mesas'], ['MANAGE_FLOOR', 'Modificar el catálogo del local']]],
  ['Horarios y ausencias', [['VIEW_SCHEDULES', 'Ver horarios'], ['MANAGE_SCHEDULES', 'Editar horarios y registrar ausencias']]],
  ['Rol diario', [['VIEW_ROSTER', 'Consultar el rol'], ['MANAGE_ROSTER', 'Proponer y ajustar el rol'], ['PUBLISH_ROSTER', 'Aprobar y publicar el rol']]],
  ['Servicio', [['HOSTESS_DESK', 'Registrar llegadas y asignar mesas'], ['REASSIGN_TABLES', 'Reasignar mesas durante el turno']]],
  ['Cierre', [['VIEW_CLOSING', 'Preparar la propuesta de cierre'], ['AUTHORIZE_CLOSING', 'Autorizar el cierre']]],
  ['Encuestas', [['CAPTURE_SURVEYS', 'Capturar encuestas'], ['VIEW_SURVEY_RESULTS', 'Ver resultados por mesero'], ['MANAGE_SURVEYS', 'Configurar encuestas']]],
  ['Indicadores y alertas', [['VIEW_METRICS', 'Ver indicadores'], ['VIEW_ALERTS', 'Ver y atender alertas de su perfil'], ['MANAGE_ALERT_RULES', 'Configurar alertas']]],
  ['Sistema', [['MANAGE_USERS', 'Usuarios y perfiles'], ['EXPORT_DATA', 'Exportar datos (queda registrado)'], ['VIEW_AUDIT', 'Consultar la auditoría'], ['MANAGE_DEVICES', 'Vincular y revocar tablets']]],
]

const EMPTY = { email: '', nombre: '', rol: 'mesero', empleado_id: '' }

export default function AccountsPage() {
  const { user: me } = useAuthStore()
  const isAdmin = me?.rol === ROLES.ADMIN
  const [tab, setTab] = useState('usuarios')

  const load = useCallback(async () => {
    const [users, invitations, employees] = await Promise.all([listUsers(), listInvitations(), listEmployeesForLink()])
    return { users, invitations, employees }
  }, [])
  const { data, loading, error, reload } = useLoader(load)
  const { users = [], invitations = [], employees = [] } = Array.isArray(data) ? {} : data

  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [confirm, setConfirm] = useState(null) // { user, fields, text }

  const employeeName = useMemo(() => new Map(employees.map((e) => [e.id, [e.nombre, e.apellidos].filter(Boolean).join(' ')])), [employees])
  const linked = new Set([...users, ...invitations].map((u) => u.empleado_id).filter(Boolean))
  const assignable = PROFILE_ORDER.filter((r) => isAdmin || r !== 'admin')

  const act = async (fn, success) => {
    setBusy(true)
    setNotice(null)
    try {
      const result = await fn()
      setNotice({ type: 'success', text: typeof success === 'function' ? success(result) : success })
      await reload()
      return true
    } catch (err) {
      setNotice({ type: 'danger', text: err.message })
      return false
    } finally {
      setBusy(false)
    }
  }

  const invite = async (e) => {
    e.preventDefault()
    const ok = await act(() => inviteUser(form), (r) => (r === 'perfil_creado'
      ? `${form.nombre} ya tenía cuenta: su perfil quedó listo y ya puede entrar.`
      : `Invitación registrada. Crea la cuenta de ${form.email} en Supabase → Authentication → Add user; el perfil se liga solo.`))
    if (ok) setForm(null)
  }

  const editable = (u) => u.id !== me?.id && (isAdmin || u.rol !== 'admin')

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Usuarios y perfiles</h1>
          <p className="page-subtitle">Quién entra al sistema y qué puede hacer. Los usuarios no se borran: se desactivan.</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" onClick={() => setForm(EMPTY)}>Nuevo usuario</Button>
        </div>
      </div>

      {error && <div style={{ marginBottom: 'var(--space-4)' }}><Alert type="danger" title="No se pudieron cargar los usuarios">{error}</Alert></div>}
      {notice && <div style={{ marginBottom: 'var(--space-4)' }}><Alert type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert></div>}

      <div className="tabs">
        {[['usuarios', `Usuarios (${users.length})`], ['invitaciones', `Invitaciones pendientes (${invitations.length})`], ['permisos', 'Perfiles y permisos']].map(([k, l]) => (
          <button key={k} className={`tab-btn ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'usuarios' && (
        <div className="card">
          {loading && !users.length ? <div className="loading-screen"><div className="spinner" /></div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Nombre</th><th>Correo</th><th>Perfil</th><th>Empleado</th><th>Estado</th><th /></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.nombre}{u.id === me?.id && <span className="text-sm text-muted"> (tú)</span>}</td>
                      <td className="text-sm">{u.email}</td>
                      <td>
                        {editable(u) ? (
                          <select className="form-select" style={{ padding: '2px 6px', fontSize: 13 }} value={u.rol} disabled={busy}
                            aria-label={`Perfil de ${u.nombre}`}
                            onChange={(e) => setConfirm({ user: u, fields: { rol: e.target.value },
                              text: `Cambiar el perfil de ${u.nombre} de ${ROLE_LABELS[u.rol] ?? u.rol} a ${ROLE_LABELS[e.target.value]}.` })}>
                            {[...new Set([u.rol, ...assignable])].map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
                          </select>
                        ) : <RoleBadge role={u.rol} />}
                      </td>
                      <td className="text-sm">{u.empleado_id ? employeeName.get(u.empleado_id) ?? '—' : '—'}</td>
                      <td><StatusBadge active={u.activo} /></td>
                      <td style={{ textAlign: 'right' }}>
                        {editable(u) && (
                          <Button variant="ghost" size="sm" disabled={busy}
                            onClick={() => setConfirm({ user: u, fields: { activo: !u.activo },
                              text: u.activo
                                ? `Desactivar a ${u.nombre}: ya no podrá entrar; su historial se conserva.`
                                : `Reactivar a ${u.nombre}: podrá volver a entrar con su perfil de ${ROLE_LABELS[u.rol] ?? u.rol}.` })}>
                            {u.activo ? 'Desactivar' : 'Reactivar'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm text-muted" style={{ marginTop: 'var(--space-3)' }}>
            Nadie puede cambiar su propio perfil ni desactivarse; solo un administrador modifica administradores. Cada cambio queda en la auditoría.
          </p>
        </div>
      )}

      {tab === 'invitaciones' && (
        <div className="card">
          {invitations.length === 0 ? <p className="text-sm text-muted">No hay invitaciones pendientes.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Correo</th><th>Nombre</th><th>Perfil</th><th>Empleado</th><th>Desde</th><th /></tr></thead>
                <tbody>
                  {invitations.map((i) => (
                    <tr key={i.email}>
                      <td className="text-sm">{i.email}</td>
                      <td>{i.nombre}</td>
                      <td><RoleBadge role={i.rol} /></td>
                      <td className="text-sm">{i.empleado_id ? employeeName.get(i.empleado_id) ?? '—' : '—'}</td>
                      <td className="text-sm">{date(i.created_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Button variant="ghost" size="sm" disabled={busy}
                          onClick={() => act(() => cancelInvitation(i.email), 'Invitación cancelada.')}>Cancelar</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Alert type="info" title="Cómo se completa el alta">
            En Supabase → Authentication → Users → Add user, crea la cuenta con el mismo correo y una contraseña (o pide que la persona se registre). En cuanto exista la cuenta, su perfil se liga solo y la invitación desaparece de esta lista. La app nunca ve ni guarda contraseñas.
          </Alert>
        </div>
      )}

      {tab === 'permisos' && (
        <div className="card">
          <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
            Permisos por acción de cada perfil. La base de datos aplica las mismas reglas aunque alguien intente saltarse la pantalla. Cambiar esta matriz requiere aprobación del cliente.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Acción</th>
                  {PROFILE_ORDER.map((r) => <th key={r} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{ROLE_LABELS[r] ?? r}</th>)}
                </tr>
              </thead>
              <tbody>
                {ACTIONS.map(([group, actions]) => [
                  <tr key={group}><td colSpan={PROFILE_ORDER.length + 1} style={{ fontWeight: 700, background: 'var(--color-navy-50)' }}>{group}</td></tr>,
                  ...actions.map(([perm, label]) => (
                    <tr key={perm}>
                      <td style={{ minWidth: 220 }}>{label}</td>
                      {PROFILE_ORDER.map((r) => (
                        <td key={r} style={{ textAlign: 'center' }}>
                          {(ROLE_PERMISSIONS[r] ?? []).includes(perm)
                            ? <span aria-label="Sí" title="Sí">✓</span>
                            : <span className="text-muted" aria-label="No" title="No">·</span>}
                        </td>
                      ))}
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted" style={{ marginTop: 'var(--space-3)' }}>
            Además: cada mesero ve solo su información (rol publicado, sus mesas, sus indicadores y su monto de cierre autorizado); el analista ve indicadores generales sin datos personales ni desempeño individual.
          </p>
        </div>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title="Nuevo usuario"
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="invite-form" loading={busy}
              disabled={!form?.email.trim() || !form?.nombre.trim()}>Registrar</Button>
          </>
        }
      >
        {form && (
          <form id="invite-form" onSubmit={invite}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="inv-name">Nombre <span className="required">*</span></label>
                <input id="inv-name" className="form-input" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="inv-email">Correo <span className="required">*</span></label>
                <input id="inv-email" type="email" className="form-input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="inv-role">Perfil</label>
                <select id="inv-role" className="form-select" value={form.rol} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}>
                  {assignable.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="inv-emp">Empleado (opcional)</label>
                <select id="inv-emp" className="form-select" value={form.empleado_id} onChange={(e) => {
                  const emp = employees.find((x) => x.id === e.target.value)
                  setForm((f) => ({ ...f, empleado_id: e.target.value, nombre: f.nombre || (emp ? employeeName.get(emp.id) : '') }))
                }}>
                  <option value="">Sin ligar</option>
                  {employees.filter((x) => x.activo && !linked.has(x.id)).map((x) => (
                    <option key={x.id} value={x.id}>{employeeName.get(x.id)} · {x.puesto}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-sm text-muted">
              Liga al empleado para que vea su información (su rol, sus mesas, sus indicadores). La contraseña no se captura aquí: la cuenta se crea en Supabase Authentication con este mismo correo.
            </p>
          </form>
        )}
      </Modal>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Confirmar cambio"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>Cancelar</Button>
            <Button variant="primary" onClick={() => {
              const { user, fields } = confirm
              setConfirm(null)
              act(() => updateUser(user.id, fields), 'Usuario actualizado.')
            }}>Confirmar</Button>
          </>
        }
      >
        {confirm && <p>{confirm.text}</p>}
      </Modal>
      {!isAdmin && <p className="text-sm text-muted" style={{ marginTop: 'var(--space-3)' }}><Badge>Nota</Badge> Como gerente no puedes crear ni modificar administradores.</p>}
    </div>
  )
}
