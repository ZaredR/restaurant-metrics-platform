import { useState, useMemo } from 'react'
import Button from './Button'

export default function DataTable({
  columns,
  data = [],
  loading = false,
  searchable = true,
  searchPlaceholder = 'Buscar...',
  actions,
  emptyMessage = 'No hay registros',
  pageSize = 10,
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    return data.filter((row) =>
      columns.some((col) => {
        const val = col.accessor ? row[col.accessor] : null
        return val != null && String(val).toLowerCase().includes(q)
      })
    )
  }, [data, search, columns])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = av > bv ? 1 : av < bv ? -1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize)

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const handleSearch = (v) => { setSearch(v); setPage(1) }

  if (loading) {
    return (
      <div className="table-wrapper">
        <div className="loading-screen"><div className="spinner spinner-lg" /></div>
      </div>
    )
  }

  return (
    <div className="table-wrapper">
      {(searchable || actions) && (
        <div className="table-toolbar">
          <div className="table-toolbar-left">
            {searchable && (
              <div className="search-input-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  className="form-input search-input"
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
            )}
            <span className="text-sm text-muted">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          {actions && <div className="table-toolbar-right">{actions}</div>}
        </div>
      )}

      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key ?? col.accessor}
                onClick={col.sortable && col.accessor ? () => handleSort(col.accessor) : undefined}
                style={{ cursor: col.sortable ? 'pointer' : 'default', userSelect: 'none' }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {col.header}
                  {col.sortable && sortKey === col.accessor && (
                    <span>{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paginated.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            paginated.map((row, i) => (
              <tr key={row.id ?? i}>
                {columns.map((col) => (
                  <td key={col.key ?? col.accessor}>
                    {col.render ? col.render(row) : row[col.accessor]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="pagination">
          <span>Página {page} de {totalPages}</span>
          <div className="pagination-controls">
            <button className="pagination-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
            <button className="pagination-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
              return (
                <button
                  key={p}
                  className={`pagination-btn ${p === page ? 'active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              )
            })}
            <button className="pagination-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
            <button className="pagination-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
          </div>
        </div>
      )}
    </div>
  )
}
