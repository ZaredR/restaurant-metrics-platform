import { useAuthStore } from '../store/auth.store'
import { loginWithEmail, demoLogin, recoverPassword, logout as serviceLogout } from '../services/auth.service'
import { ROUTES } from '../constants/routes'
import { useNavigate } from 'react-router-dom'

export function useAuth() {
  const store = useAuthStore()
  const navigate = useNavigate()

  const login = async (email, password) => {
    store.setLoading(true)
    store.setError(null)
    try {
      /* Try real Supabase first; fall back to demo mode if not configured */
      let result
      try {
        result = await loginWithEmail(email, password)
      } catch (err) {
        if (err.message?.includes('Supabase no está configurado')) {
          result = demoLogin(email, password)
        } else {
          throw err
        }
      }
      store.login(result.user, result.token)
      navigate(ROUTES.DASHBOARD, { replace: true })
    } catch (err) {
      store.setError(err.message ?? 'Error al iniciar sesión')
    } finally {
      store.setLoading(false)
    }
  }

  const recover = async (email) => {
    store.setLoading(true)
    store.setError(null)
    try {
      await recoverPassword(email)
    } catch (err) {
      store.setError(err.message)
      throw err
    } finally {
      store.setLoading(false)
    }
  }

  const logout = () => {
    serviceLogout().catch(() => {})
    store.logout()
    navigate(ROUTES.LOGIN, { replace: true })
  }

  return {
    user:          store.user,
    loading:       store.loading,
    error:         store.error,
    isAuthenticated: !!store.user,
    hasPermission: store.hasPermission,
    isRole:        store.isRole,
    login,
    recover,
    logout,
  }
}
