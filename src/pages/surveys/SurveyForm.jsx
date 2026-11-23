import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import { submitSurvey } from '../../services/surveys.service'
import { number } from '../../utils/formatters'

const choiceStyle = (selected) => ({
  minWidth: 44, minHeight: 44, borderRadius: 'var(--radius-md)', cursor: 'pointer', font: 'inherit', fontWeight: 600,
  border: `2px solid ${selected ? 'var(--color-blue-500)' : 'var(--border-color)'}`,
  background: selected ? 'var(--color-blue-50)' : 'var(--bg-card)', color: 'var(--text-primary)',
})

/* Tablet-friendly capture of one survey for one visit.
   visit: { visita_id, nombre_referencia, mesa, mesero }; survey: { id, nombre, preguntas } */
export default function SurveyForm({ visit, survey, onClose, onSaved }) {
  const questions = (survey?.preguntas ?? []).filter((q) => q.activa)
  const hasText = questions.some((q) => q.tipo === 'texto')
  const [answers, setAnswers] = useState({})
  const [comentario, setComentario] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setAnswers({}); setComentario(''); setError('') }, [visit])

  const set = (id, valor) => setAnswers((a) => ({ ...a, [id]: valor }))
  const filled = Object.values(answers).some((v) => v !== '' && v != null) || comentario.trim()

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const respuestas = Object.entries(answers)
        .filter(([, valor]) => valor !== '' && valor != null)
        .map(([pregunta_id, valor]) => ({ pregunta_id, valor }))
      await submitSurvey(visit.visita_id, survey.id, respuestas, comentario.trim())
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={!!visit && !!survey}
      onClose={onClose}
      title={survey ? survey.nombre : ''}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{filled ? 'Cancelar' : 'Omitir'}</Button>
          <Button variant="primary" type="submit" form="survey-form" disabled={!filled} loading={saving}>Guardar encuesta</Button>
        </>
      }
    >
      {visit && survey && (
        <form id="survey-form" onSubmit={save}>
          <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-4)' }}>
            {visit.nombre_referencia}{visit.mesa ? ` · mesa ${visit.mesa}` : ''}{visit.mesero ? ` · atendió ${visit.mesero}` : ''}
            {visit.comensales ? ` · ${number(visit.comensales, 1)} comensales` : ''}
          </p>
          {error && <div style={{ marginBottom: 'var(--space-3)' }}><Alert type="danger">{error}</Alert></div>}

          {questions.map((q) => (
            <div key={q.id} className="form-group">
              <label className="form-label">{q.texto}</label>
              {q.tipo === 'escala' && (
                <div style={{ display: 'flex', gap: 8 }} role="radiogroup" aria-label={q.texto}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={answers[q.id] === n}
                      style={choiceStyle(answers[q.id] === n)} onClick={() => set(q.id, answers[q.id] === n ? '' : n)}>{n}</button>
                  ))}
                </div>
              )}
              {q.tipo === 'si_no' && (
                <div style={{ display: 'flex', gap: 8 }} role="radiogroup" aria-label={q.texto}>
                  {[['si', 'Sí'], ['no', 'No']].map(([v, l]) => (
                    <button key={v} type="button" role="radio" aria-checked={answers[q.id] === v}
                      style={{ ...choiceStyle(answers[q.id] === v), padding: '0 18px' }}
                      onClick={() => set(q.id, answers[q.id] === v ? '' : v)}>{l}</button>
                  ))}
                </div>
              )}
              {q.tipo === 'texto' && (
                <textarea className="form-input" rows={2} value={answers[q.id] ?? ''} onChange={(e) => set(q.id, e.target.value)} />
              )}
            </div>
          ))}

          {!hasText && (
            <div className="form-group">
              <label className="form-label" htmlFor="survey-comment">Comentario (opcional)</label>
              <textarea id="survey-comment" className="form-input" rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} />
            </div>
          )}
          <p className="text-sm text-muted">Las preguntas sin respuesta se omiten. El cliente no se identifica.</p>
        </form>
      )}
    </Modal>
  )
}
