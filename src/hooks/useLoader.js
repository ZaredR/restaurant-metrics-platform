import { useCallback, useEffect, useState } from 'react'

/* Loads data on mount and exposes reload() for after a save. */
export function useLoader(loader) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await loader())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [loader])

  useEffect(() => { reload() }, [reload])

  return { data, loading, error, reload }
}
