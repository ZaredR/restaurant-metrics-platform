import { useAuthStore } from '../../store/auth.store'
import { ROLES } from '../../constants/roles'
import DashboardAdmin from './DashboardAdmin'
import DashboardSupervisor from './DashboardSupervisor'
import DashboardMesero from './DashboardMesero'

export default function Dashboard() {
  const { user } = useAuthStore()

  if (!user) return null

  if (user.rol === ROLES.ADMIN || user.rol === ROLES.GERENTE || user.rol === ROLES.ANALISTA) {
    return <DashboardAdmin />
  }
  if (user.rol === ROLES.SUPERVISOR) {
    return <DashboardSupervisor />
  }
  return <DashboardMesero />
}
