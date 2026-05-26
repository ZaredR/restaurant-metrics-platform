import Papa from 'papaparse'

/* ─── Required columns from SoftRestaurant export ─────────── */
const REQUIRED_COLS = ['mesero', 'fecha', 'total', 'ordenes']

export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (results) => {
        const validation = validateColumns(results.meta.fields ?? [])
        resolve({ rows: results.data, validation, errors: results.errors })
      },
      error: reject,
    })
  })
}

export async function parseXLSX(file) {
  const XLSX = await import('xlsx')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, {
          defval: '',
          raw: false,
        })
        const normalizedRows = rows.map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v])
          )
        )
        const fields = normalizedRows.length > 0 ? Object.keys(normalizedRows[0]) : []
        const validation = validateColumns(fields)
        resolve({ rows: normalizedRows, validation, errors: [] })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext === 'csv') return parseCSV(file)
  if (['xlsx', 'xls'].includes(ext)) return parseXLSX(file)
  throw new Error(`Formato no soportado: .${ext}`)
}

function validateColumns(fields) {
  const normalized = fields.map((f) => f.toLowerCase())
  const missing = REQUIRED_COLS.filter((c) => !normalized.includes(c))
  return {
    valid: missing.length === 0,
    missing,
    found: normalized,
  }
}

/* ─── KPI calculation from parsed rows ─────────────────────── */
export function calculateKPIs(rows) {
  if (!rows.length) return {}

  const byMesero = {}

  rows.forEach((row) => {
    const mesero = row.mesero ?? row.nombre ?? 'Desconocido'
    const total  = parseFloat(row.total ?? row.venta ?? 0) || 0
    const ordenes= parseInt(row.ordenes ?? row.cuentas ?? 1, 10) || 1
    const upsell = parseFloat(row.upsell ?? 0) || 0

    if (!byMesero[mesero]) {
      byMesero[mesero] = { nombre: mesero, ventas: 0, ordenes: 0, upsell: 0, dias: new Set() }
    }

    byMesero[mesero].ventas  += total
    byMesero[mesero].ordenes += ordenes
    byMesero[mesero].upsell  += upsell
    if (row.fecha) byMesero[mesero].dias.add(row.fecha)
  })

  return Object.values(byMesero).map((m) => ({
    nombre:          m.nombre,
    ventas:          m.ventas,
    ordenes:         m.ordenes,
    ticket_promedio: m.ordenes > 0 ? m.ventas / m.ordenes : 0,
    upsell:          m.upsell,
    dias:            m.dias.size,
  }))
}
