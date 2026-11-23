import { useCallback, useEffect, useMemo, useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../store/auth.store'
import { PERMISSIONS } from '../../constants/permissions'
import { useLoader } from '../../hooks/useLoader'
import {
  TIPOS_PREGUNTA, listSurveys, saveSurvey, saveQuestion, setQuestionActive, listPendingVisits,
  getResults, averageBy, summarizeQuestions,
} from '../../services/surveys.service'
import SurveyForm from './SurveyForm'
import ExportButton from '../../components/ui/ExportButton'
import { today, addDays } from '../../utils/dates'
import { number, percent, datetime, date } from '../../utils/formatters'

const EMPTY_QUESTION = { texto: '', tipo: 'escala', orden: '' }

const scoreVariant = (v) => (v == null ? 'neutral' : v < 3 ? 'danger' : v < 4 ? 'warning' : 'success')

export default function SurveysPage() {
  const { hasPermission } = useAuthStore()
  const canResults = hasPermission(PERMISSIONS.VIEW_SURVEY_RESULTS)
  const canManage = hasPermission(PERMISSIONS.MANAGE_SURVEYS)
  const tabs = [
    { key: 'capturar', label: 'Capturar' },
    ...(canResults ? [{ key: 'resultados', label: 'Resultados' }] : []),
    ...(canManage ? [{ key: 'configurar', label: 'Configurar' }] : []),
  ]
  const [tab, setTab] = useState('capturar')

  const surveysData = useLoader(listSurveys)
  const surveys = surveysData.data
  const activeSurveys = surveys.filter((s) => s.activa)
  const [surveyId, setSurveyId] = useState('')
  useEffect(() => {
    if (!activeSurveys.some((s) => s.id === surveyId) && activeSurveys.length) setSurveyId(activeSurveys[0].id)
  }, [activeSurveys, surveyId])
  const survey = surveys.find((s) => s.id === surveyId)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Encuestas</h1>
          <p className="page-subtitle">Se capturan al terminar el servicio y quedan ligadas a la visita (mesa, mesero, área y turno).</p>
        </div>
        {activeSurveys.length > 1 && tab !== 'configurar' && (
          <div className="page-actions">
            <select className="form-select" value={surveyId} onChange={(e) => setSurveyId(e.target.value)} aria-label="Encuesta">
              {activeSurveys.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        )}
      </div>

      {surveysData.error && <div style={{ marginBottom: 'var(--space-4)' }}><Alert type="danger" title="No se pudieron cargar las encuestas">{surveysData.error}</Alert></div>}

      {tabs.length > 1 && (
        <div className="tabs">
          {tabs.map((t) => (
            <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
      )}

      {tab === 'configurar' ? (
        <ConfigureTab surveys={surveys} reload={surveysData.reload} />
      ) : surveysData.loading && !surveys.length ? (
        <div className="loading-screen"><div className="spinner spinner-lg" /></div>
      ) : !survey ? (
        <Alert type="warning">No hay una encuesta activa.{canManage ? ' Créala o actívala en "Configurar".' : ' Pide a gerencia que active una.'}</Alert>
      ) : tab === 'resultados' ? (
        <ResultsTab survey={survey} />
      ) : (
        <CaptureTab survey={survey} />
      )}
    </div>
  )
}

/* ─── Capturar: visitas atendidas sin encuesta ─────────────── */

function CaptureTab({ survey }) {
  const [fecha, setFecha] = useState(today())
  const load = useCallback(() => listPendingVisits(fecha, survey.id), [fecha, survey.id])
  const { data: visits, loading, error, reload } = useLoader(load)
  const [current, setCurrent] = useState(null)
  const [notice, setNotice] = useState('')

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
        <h3 className="section-title" style={{ margin: 0 }}>Visitas sin encuesta ({visits.length})</h3>
        <input className="form-input" type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} aria-label="Fecha" style={{ maxWidth: 180 }} />
      </div>
      {notice && <div style={{ marginBottom: 'var(--space-3)' }}><Alert type="success" onClose={() => setNotice('')}>{notice}</Alert></div>}
      {error && <Alert type="danger">{error}</Alert>}
      {loading && !visits.length ? <div className="loading-screen"><div className="spinner" /></div> : visits.length === 0 ? (
        <p className="text-sm text-muted">Todas las visitas atendidas de este día ya tienen encuesta.</p>
      ) : (
        <table className="data-table">
          <thead><tr><th>Visita</th><th>Mesa</th><th>Mesero</th><th>Turno</th><th>Salida</th><th /></tr></thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.visita_id}>
                <td>{v.nombre_referencia}<div className="text-sm text-muted">{number(v.comensales, 1)} comensales</div></td>
                <td>{v.mesa ?? '—'}</td>
                <td>{v.mesero ?? '—'}</td>
                <td>{v.turno}</td>
                <td>{v.estado === 'sentada' ? <Badge variant="warning">En mesa</Badge> : v.hora_salida ? datetime(v.hora_salida) : '—'}</td>
                <td style={{ textAlign: 'right' }}><Button variant="primary" size="sm" onClick={() => setCurrent(v)}>Capturar</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <SurveyForm
        visit={current}
        survey={survey}
        onClose={() => setCurrent(null)}
        onSaved={() => { setNotice(`Encuesta de ${current.nombre_referencia} guardada.`); setCurrent(null); reload() }}
      />
    </div>
  )
}

/* ─── Resultados ───────────────────────────────────────────── */

function ResultsTab({ survey }) {
  const [hasta, setHasta] = useState(today())
  const [desde, setDesde] = useState(addDays(today(), -6))
  const load = useCallback(() => getResults(survey.id, desde, hasta), [survey.id, desde, hasta])
  const { data, loading, error } = useLoader(load)
  const { responses = [], details = [] } = Array.isArray(data) ? {} : data

  const scored = responses.filter((r) => r.promedio != null)
  const overall = scored.length ? scored.reduce((s, r) => s + Number(r.promedio), 0) / scored.length : null
  const byQuestion = useMemo(() => summarizeQuestions(details), [details])
  const byWaiter = useMemo(() => averageBy(responses, 'mesero'), [responses])
  const byArea = useMemo(() => averageBy(responses, 'area'), [responses])
  const byShift = useMemo(() => averageBy(responses, 'turno'), [responses])
  const comments = useMemo(() => [
    ...responses.filter((r) => r.comentario).map((r) => ({ id: `c-${r.respuesta_id}`, texto: r.comentario, r })),
    ...details.filter((d) => d.tipo === 'texto' && d.valor_texto).map((d) => ({
      id: `t-${d.respuesta_id}-${d.pregunta_id}`, texto: d.valor_texto, r: responses.find((r) => r.respuesta_id === d.respuesta_id) ?? d,
    })),
  ].sort((a, b) => String(b.r.created_at ?? b.r.fecha).localeCompare(String(a.r.created_at ?? a.r.fecha))), [responses, details])

  const groupTable = (title, rows, label) => (
    <div className="card">
      <h3 className="section-title">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-muted">Sin calificaciones.</p> : (
        <table className="data-table">
          <thead><tr><th>{label}</th><th style={{ textAlign: 'right' }}>Encuestas</th><th style={{ textAlign: 'right' }}>Promedio</th><th style={{ textAlign: 'right' }}>Bajas (&lt;3)</th></tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.nombre}>
                <td>{g.nombre}</td>
                <td style={{ textAlign: 'right' }}>{g.respuestas}</td>
                <td style={{ textAlign: 'right' }}><Badge variant={scoreVariant(g.promedio)}>{number(g.promedio, 2)}</Badge></td>
                <td style={{ textAlign: 'right' }}>{g.bajas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <label className="text-sm">Del</label>
        <input className="form-input" type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} aria-label="Desde" style={{ maxWidth: 180 }} />
        <label className="text-sm">al</label>
        <input className="form-input" type="date" value={hasta} min={desde} onChange={(e) => e.target.value && setHasta(e.target.value)} aria-label="Hasta" style={{ maxWidth: 180 }} />
        <span style={{ marginLeft: 'auto' }}>
          <ExportButton disabled={!responses.length} getExport={() => ({
            tipo: 'encuestas', filtros: { encuesta: survey.nombre, desde, hasta }, rows: responses, filename: `encuestas_${desde}_${hasta}`,
            columns: [
              { header: 'Fecha', value: (r) => r.fecha }, { header: 'Turno', value: (r) => r.turno }, { header: 'Mesa', value: (r) => r.mesa },
              { header: 'Área', value: (r) => r.area }, { header: 'Mesero', value: (r) => r.mesero },
              { header: 'Promedio', value: (r) => r.promedio }, { header: 'Comentario', value: (r) => r.comentario },
            ],
          })} />
        </span>
      </div>
      {error && <Alert type="danger">{error}</Alert>}
      {loading && !responses.length ? <div className="loading-screen"><div className="spinner spinner-lg" /></div> : (
        <>
          <div className="grid-kpi" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="card"><p className="text-sm text-muted">Encuestas</p><h3>{responses.length}</h3></div>
            <div className="card"><p className="text-sm text-muted">Promedio general (1 a 5)</p><h3>{overall == null ? '—' : number(overall, 2)}</h3></div>
            <div className="card"><p className="text-sm text-muted">Calificaciones bajas (&lt;3)</p><h3>{scored.filter((r) => Number(r.promedio) < 3).length}</h3></div>
            <div className="card"><p className="text-sm text-muted">Comentarios</p><h3>{comments.length}</h3></div>
          </div>

          <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <h3 className="section-title">Por pregunta</h3>
            {byQuestion.length === 0 ? <p className="text-sm text-muted">Sin respuestas en este periodo.</p> : (
              <table className="data-table">
                <thead><tr><th>Pregunta</th><th style={{ textAlign: 'right' }}>Respuestas</th><th style={{ textAlign: 'right' }}>Resultado</th></tr></thead>
                <tbody>
                  {byQuestion.map((q) => (
                    <tr key={q.pregunta}>
                      <td>{q.pregunta}</td>
                      <td style={{ textAlign: 'right' }}>{q.n}</td>
                      <td style={{ textAlign: 'right' }}>
                        {q.tipo === 'escala' && <Badge variant={scoreVariant(q.suma / q.n)}>{number(q.suma / q.n, 2)}</Badge>}
                        {q.tipo === 'si_no' && `${percent((q.si / q.n) * 100, 0)} sí`}
                        {q.tipo === 'texto' && `${q.n} ${q.n === 1 ? 'comentario' : 'comentarios'}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid-2" style={{ marginBottom: 'var(--space-4)' }}>
            {groupTable('Por mesero (de menor a mayor)', byWaiter, 'Mesero')}
            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              {groupTable('Por área', byArea, 'Área')}
              {groupTable('Por turno', byShift, 'Turno')}
            </div>
          </div>

          <div className="card">
            <h3 className="section-title">Comentarios</h3>
            {comments.length === 0 ? <p className="text-sm text-muted">Sin comentarios en este periodo.</p> : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                {comments.slice(0, 50).map((c) => (
                  <li key={c.id}>
                    <div>“{c.texto}”</div>
                    <div className="text-sm text-muted">{date(c.r.fecha)} · {c.r.turno} · {c.r.area ?? '—'} · {c.r.mesero ?? '—'}{c.r.promedio != null ? ` · promedio ${number(c.r.promedio, 1)}` : ''}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Configurar: encuestas y preguntas ────────────────────── */

function ConfigureTab({ surveys, reload }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [newSurvey, setNewSurvey] = useState('')
  const [editing, setEditing] = useState(null) // { encuesta_id, ...question }

  const act = async (fn, success) => {
    setBusy(true)
    setNotice(null)
    try {
      await fn()
      if (success) setNotice({ type: 'success', text: success })
      await reload()
      return true
    } catch (err) {
      setNotice({ type: 'danger', text: err.message })
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {notice && <div style={{ marginBottom: 'var(--space-4)' }}><Alert type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert></div>}
      <div className="card" style={{ marginBottom: 'var(--space-4)', display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 220 }}>
          <label className="form-label" htmlFor="new-survey">Nueva encuesta</label>
          <input id="new-survey" className="form-input" value={newSurvey} onChange={(e) => setNewSurvey(e.target.value)} placeholder="Ej: Satisfacción de terraza" />
        </div>
        <Button variant="primary" disabled={!newSurvey.trim() || busy}
          onClick={async () => { if (await act(() => saveSurvey({ nombre: newSurvey }), 'Encuesta creada.')) setNewSurvey('') }}>Crear</Button>
      </div>

      {surveys.map((s) => (
        <div key={s.id} className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 'var(--space-3)' }}>
            <h3 className="section-title" style={{ margin: 0 }}>{s.nombre} {s.activa ? <Badge variant="success">Activa</Badge> : <Badge>Inactiva</Badge>}</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" size="sm" disabled={busy}
                onClick={() => setEditing({ encuesta_id: s.id, ...EMPTY_QUESTION, orden: (s.preguntas.at(-1)?.orden ?? 0) + 1 })}>Agregar pregunta</Button>
              <Button variant="ghost" size="sm" disabled={busy}
                onClick={() => act(() => saveSurvey({ id: s.id, nombre: s.nombre, activa: !s.activa }), s.activa ? 'Encuesta desactivada.' : 'Encuesta activada.')}>
                {s.activa ? 'Desactivar' : 'Activar'}
              </Button>
            </div>
          </div>
          {s.preguntas.length === 0 ? <p className="text-sm text-muted">Sin preguntas.</p> : (
            <table className="data-table">
              <thead><tr><th>#</th><th>Pregunta</th><th>Tipo</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {s.preguntas.map((q) => (
                  <tr key={q.id}>
                    <td>{q.orden}</td>
                    <td>{q.texto}</td>
                    <td>{TIPOS_PREGUNTA[q.tipo]}</td>
                    <td>{q.activa ? <Badge variant="success">Activa</Badge> : <Badge>Inactiva</Badge>}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing({ ...q, encuesta_id: s.id })}>Editar</Button>
                      <Button variant="ghost" size="sm" disabled={busy}
                        onClick={() => act(() => setQuestionActive(q.id, !q.activa), q.activa ? 'Pregunta desactivada.' : 'Pregunta activada.')}>
                        {q.activa ? 'Desactivar' : 'Activar'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      <p className="text-sm text-muted">Una pregunta que ya tiene respuestas no cambia de texto ni de tipo (cambiaría el historial): desactívala y crea otra.</p>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar pregunta' : 'Nueva pregunta'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" disabled={!editing?.texto.trim() || busy}
              onClick={async () => { if (await act(() => saveQuestion(editing), 'Pregunta guardada.')) setEditing(null) }}>Guardar</Button>
          </>
        }
      >
        {editing && (
          <>
            <div className="form-group">
              <label className="form-label" htmlFor="q-text">Pregunta</label>
              <input id="q-text" className="form-input" value={editing.texto} onChange={(e) => setEditing((q) => ({ ...q, texto: e.target.value }))} autoFocus />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="q-type">Tipo</label>
                <select id="q-type" className="form-select" value={editing.tipo} onChange={(e) => setEditing((q) => ({ ...q, tipo: e.target.value }))}>
                  {Object.entries(TIPOS_PREGUNTA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="q-order">Orden</label>
                <input id="q-order" className="form-input" type="number" value={editing.orden} onChange={(e) => setEditing((q) => ({ ...q, orden: e.target.value }))} />
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
