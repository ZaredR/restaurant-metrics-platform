import { run } from './db'

/* ─── Exportaciones controladas (contextualización 10 y 11) ───
   Exporting is a sensitive permission: the database checks it and
   logs what is exported (type, filters, rows, who, when) BEFORE the
   file is generated. If logging fails, nothing is downloaded.
   ─────────────────────────────────────────────────────────── */

const cell = (v) => {
  if (v == null) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/* columns: [{ header, value: (row) => any }] */
export function toCsv(rows, columns) {
  const lines = [columns.map((c) => cell(c.header)).join(',')]
  rows.forEach((r) => lines.push(columns.map((c) => cell(c.value(r))).join(',')))
  // BOM so Excel opens accents correctly.
  return '﻿' + lines.join('\r\n')
}

export async function exportCsv({ tipo, filtros = null, rows, columns, filename }) {
  await run((sb) => sb.rpc('registrar_exportacion', { p_tipo: tipo, p_filtros: filtros, p_filas: rows.length }))
  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* Audit trail with the name of who made each change (admin only, by RLS). */
export function listAudit({ tabla, desde, hasta }) {
  return run((sb) => {
    let q = sb.from('v_auditoria')
      .select('id, tabla, registro_id, accion, usuario_nombre, antes, despues, created_at')
      .gte('created_at', `${desde}T00:00:00`).lte('created_at', `${hasta}T23:59:59`)
      .order('created_at', { ascending: false }).limit(500)
    if (tabla) q = q.eq('tabla', tabla)
    return q
  })
}

export function listExports() {
  return run((sb) =>
    sb.from('exportaciones').select('id, tipo, filtros, filas, usuario_nombre, created_at').order('created_at', { ascending: false }).limit(200)
  )
}
