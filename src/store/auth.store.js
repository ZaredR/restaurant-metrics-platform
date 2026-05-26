import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ROLE_PERMISSIONS } from '../constants/permissions'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: false,
      error: null,

      login: (userData, token) => {
        set({ user: userData, token, error: null })
      },

      logout: () => {
        set({ user: null, token: null })
      },

      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),

      hasPermission: (permission) => {
        const { user } = get()
        if (!user) return false
        const perms = ROLE_PERMISSIONS[user.rol] ?? []
        return perms.includes(permission)
      },

      isRole: (...roles) => {
        const { user } = get()
        if (!user) return false
        return roles.includes(user.rol)
      },
    }),
    {
      name: 'metricas-auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
)
