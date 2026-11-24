import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { ROUTES } from '../../constants/routes'
import HomePage from './HomePage'

/* Every profile lands on the same Inicio (banner, quick access and, for
   management, today's numbers). The sales dashboards of the previous version
   (DashboardAdmin, DashboardSupervisor, DashboardMesero) stay in the code,
   unused: their figures were sample data. */
export default function Dashboard() {
  const { user } = useAuthStore()
  if (!user) return null
  // A linked tablet has a single screen.
  if (user.dispositivo) return <Navigate to={user.dispositivo.funcion === 'encuestas' ? ROUTES.SURVEYS : ROUTES.HOSTESS} replace />
  return <HomePage />
}
