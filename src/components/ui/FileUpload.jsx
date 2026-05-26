import { useState, useRef } from 'react'

export default function FileUpload({ onFile, accept = '.csv,.xlsx,.xls', maxMB = 10 }) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef()

  const handleFile = (f) => {
    setError('')
    if (!f) return
    if (f.size > maxMB * 1024 * 1024) {
      setError(`El archivo supera el límite de ${maxMB}MB`)
      return
    }
    setFile(f)
    onFile?.(f)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  const onDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onInputChange = (e) => handleFile(e.target.files[0])

  const reset = (e) => {
    e.stopPropagation()
    setFile(null)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
    onFile?.(null)
  }

  if (file) {
    return (
      <div className="file-upload-zone" style={{ cursor: 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-green-600)" strokeWidth="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <div style={{ textAlign: 'left' }}>
            <p className="font-semibold text-sm">{file.name}</p>
            <p className="text-muted text-xs">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={reset} style={{ marginLeft: 'auto' }}>
            ✕ Quitar
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        className={`file-upload-zone ${dragging ? 'dragging' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
      >
        <svg className="file-upload-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p className="file-upload-title">Arrastra tu archivo aquí</p>
        <p className="file-upload-hint">o <span style={{ color: 'var(--color-brand-dark)', fontWeight: 500 }}>haz clic para seleccionar</span></p>
        <p className="file-upload-hint" style={{ marginTop: '0.5rem' }}>Formatos: CSV, XLSX, XLS · Máx. {maxMB}MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={onInputChange}
          style={{ display: 'none' }}
        />
      </div>
      {error && <p className="form-error" style={{ marginTop: '0.5rem' }}>{error}</p>}
    </>
  )
}
