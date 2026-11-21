/* ─── Date-only helpers (local time, no UTC shift) ──────────
   Postgres `date` columns travel as 'YYYY-MM-DD'. new Date() on
   that string is UTC midnight, which is the previous day in
   Mexico, so these helpers always work in local time.
   ─────────────────────────────────────────────────────────── */

const pad = (n) => String(n).padStart(2, '0')

export const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const parseISODate = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (s, n) => {
  const d = parseISODate(s)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export const today = () => toISODate(new Date())

/* Monday of the week that contains `s`. */
export const startOfWeek = (s) => {
  const day = parseISODate(s).getDay() // 0 = domingo
  return addDays(s, day === 0 ? -6 : 1 - day)
}

export const weekDays = (monday) => Array.from({ length: 7 }, (_, i) => addDays(monday, i))

export const dayHeader = (s) =>
  new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).format(parseISODate(s))
