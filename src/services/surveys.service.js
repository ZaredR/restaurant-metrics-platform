import { run } from './db'

/* ─── Encuestas (contextualización, sección 8) ────────────────
   Captured by staff on a tablet and linked to the visit; results
   (by question, waiter, area and shift) only for management,
   captain and supervisor (enforced by RLS).
   ─────────────────────────────────────────────────────────── */

export const TIPOS_PREGUNTA = {
  escala: 'Calificación 1 a 5',
  si_no:  'Sí / No',
  texto:  'Texto libre',
}

const SURVEY_FIELDS = 'id, nombre, activa, created_at, preguntas(id, texto, tipo, orden, activa)'

/* Surveys with their questions sorted by `orden`. */
export async function listSurveys() {
  const rows = await run((sb) => sb.from('encuestas').select(SURVEY_FIELDS).order('created_at'))
  return rows.map((s) => ({ ...s, preguntas: [...(s.preguntas ?? [])].sort((a, b) => a.orden - b.orden) }))
}

export function saveSurvey({ id, nombre, activa = true }) {
  const row = { nombre: nombre.trim(), activa }
  return run((sb) => (id ? sb.from('encuestas').update(row).eq('id', id) : sb.from('encuestas').insert(row)))
}

export function saveQuestion({ id, encuesta_id, texto, tipo, orden, activa = true }) {
  const row = { encuesta_id, texto: texto.trim(), tipo, orden: Number(orden) || 0, activa }
  return run((sb) => (id ? sb.from('preguntas').update(row).eq('id', id) : sb.from('preguntas').insert(row)))
}

export function setQuestionActive(id, activa) {
  return run((sb) => sb.from('preguntas').update({ activa }).eq('id', id))
}

/* Attended visits of a day that don't have this survey yet. */
export function listPendingVisits(fecha, encuestaId) {
  return run((sb) => sb.rpc('visitas_sin_encuesta', { p_fecha: fecha, p_encuesta_id: encuestaId }))
}

/* respuestas: [{ pregunta_id, valor }]; the database validates each answer. */
export function submitSurvey(visitaId, encuestaId, respuestas, comentario) {
  return run((sb) => sb.rpc('registrar_encuesta', {
    p_visita_id: visitaId, p_encuesta_id: encuestaId, p_respuestas: respuestas, p_comentario: comentario || null,
  }))
}

/* Responses (with average and comment) and their detail for a date range. */
export async function getResults(encuestaId, desde, hasta) {
  const [responses, details] = await Promise.all([
    run((sb) => sb.from('v_encuestas_contexto')
      .select('respuesta_id, created_at, fecha, turno, mesa, area, mesero_id, mesero, promedio, comentario')
      .eq('encuesta_id', encuestaId).gte('fecha', desde).lte('fecha', hasta)
      .order('created_at', { ascending: false })),
    run((sb) => sb.from('v_encuestas_detalle')
      .select('respuesta_id, fecha, turno, area, mesero_id, mesero, pregunta_id, pregunta, tipo, orden, valor_numerico, valor_texto')
      .eq('encuesta_id', encuestaId).gte('fecha', desde).lte('fecha', hasta)),
  ])
  return { responses, details }
}

/* Average of 1–5 answers grouped by a key of the response (mesero, area, turno). */
export function averageBy(responses, key) {
  const groups = new Map()
  responses.forEach((r) => {
    if (r.promedio == null) return
    const k = r[key] ?? '—'
    const g = groups.get(k) ?? { nombre: k, respuestas: 0, suma: 0, bajas: 0 }
    g.respuestas += 1
    g.suma += Number(r.promedio)
    if (Number(r.promedio) < 3) g.bajas += 1
    groups.set(k, g)
  })
  return [...groups.values()]
    .map((g) => ({ ...g, promedio: g.suma / g.respuestas }))
    .sort((a, b) => a.promedio - b.promedio)
}

/* Per question: average (scale), % yes (yes/no) or number of comments (text). */
export function summarizeQuestions(details) {
  const byQuestion = new Map()
  details.forEach((d) => {
    const q = byQuestion.get(d.pregunta_id) ?? { pregunta: d.pregunta, tipo: d.tipo, orden: d.orden, n: 0, suma: 0, si: 0 }
    q.n += 1
    if (d.tipo === 'escala') q.suma += Number(d.valor_numerico)
    if (d.tipo === 'si_no' && d.valor_texto === 'si') q.si += 1
    byQuestion.set(d.pregunta_id, q)
  })
  return [...byQuestion.values()].sort((a, b) => a.orden - b.orden)
}
