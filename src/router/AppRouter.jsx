import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { PERMISSIONS } from '../constants/permissions'
import AppLayout from '../components/layout/AppLayout'
import { ROUTES, isHiddenRoute } from '../constants/routes'

/* ── Lazy pages ─────────────────────────────────────── */
import { lazy, Suspense } from 'react'

const Login            = lazy(() => import('../pages/auth/Login'))
const RecoverPassword  = lazy(() => import('../pages/auth/RecoverPassword'))
const Dashboard        = lazy(() => import('../pages/dashboard/Dashboard'))
const RestaurantList   = lazy(() => import('../pages/restaurants/RestaurantList'))
const RestaurantForm   = lazy(() => import('../pages/restaurants/RestaurantForm'))
const UserList         = lazy(() => import('../pages/users/UserList'))
const UserForm         = lazy(() => import('../pages/users/UserForm'))
const ReportUpload     = lazy(() => import('../pages/reports/ReportUpload'))
const ReportHistory    = lazy(() => import('../pages/reports/ReportHistory'))
const MetricsDashboard = lazy(() => import('../pages/metrics/MetricsDashboard'))
const RankingGeneral   = lazy(() => import('../pages/rankings/RankingGeneral'))
const IncentiveList    = lazy(() => import('../pages/incentives/IncentiveList'))
const IncentiveForm    = lazy(() => import('../pages/incentives/IncentiveForm'))
const NoticeList       = lazy(() => import('../pages/notices/NoticeList'))
const NoticeCreate     = lazy(() => import('../pages/notices/NoticeCreate'))
const History          = lazy(() => import('../pages/history/History'))
const Config           = lazy(() => import('../pages/config/Config'))
const Profile          = lazy(() => import('../pages/profile/Profile'))
const Audit            = lazy(() => import('../pages/audit/Audit'))
const StaffList        = lazy(() => import('../pages/staff/StaffList'))
const FloorConfig      = lazy(() => import('../pages/floor/FloorConfig'))
const AbsenceList      = lazy(() => import('../pages/absences/AbsenceList'))
const WeeklySchedule   = lazy(() => import('../pages/schedules/WeeklySchedule'))
const DailyRoster      = lazy(() => import('../pages/roster/DailyRoster'))
const HostessDesk      = lazy(() => import('../pages/hostess/HostessDesk'))
const ShiftClosing     = lazy(() => import('../pages/closing/ShiftClosing'))
const SurveysPage      = lazy(() => import('../pages/surveys/SurveysPage'))
const AlertsPage       = lazy(() => import('../pages/alerts/AlertsPage'))
const AccountsPage     = lazy(() => import('../pages/accounts/AccountsPage'))
const ResetPassword    = lazy(() => import('../pages/auth/ResetPassword'))

/* ── Guards ─────────────────────────────────────────── */
function RequireAuth() {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to={ROUTES.LOGIN} replace />
  return <Outlet />
}

function RequirePermission({ permission }) {
  const hasPermission = useAuthStore(s => s.hasPermission)
  if (!hasPermission(permission)) return <Navigate to={ROUTES.DASHBOARD} replace />
  return <Outlet />
}

/* Old-version screens kept in code but not reachable (see HIDDEN_ROUTES). */
function RedirectHidden() {
  const { pathname } = useLocation()
  if (isHiddenRoute(pathname)) return <Navigate to={ROUTES.DASHBOARD} replace />
  return <Outlet />
}

function GuestOnly() {
  const user = useAuthStore(s => s.user)
  if (user) return <Navigate to={ROUTES.DASHBOARD} replace />
  return <Outlet />
}

/* ── Loading fallback ────────────────────────────────── */
function PageLoader() {
  return (
    <div className="loading-screen" style={{ minHeight: '60vh' }}>
      <div className="spinner spinner-lg" />
      <p>Cargando...</p>
    </div>
  )
}

/* ── Router ─────────────────────────────────────────── */
export default function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public (guest only) */}
        <Route element={<GuestOnly />}>
          <Route path={ROUTES.LOGIN}   element={<Login />} />
          <Route path={ROUTES.RECOVER} element={<RecoverPassword />} />
        </Route>
        {/* Link of the recovery email: open with or without a session in the app */}
        <Route path={ROUTES.RESET_PASSWORD} element={<ResetPassword />} />

        {/* Protected */}
        <Route element={<RequireAuth />}>
          <Route element={<RedirectHidden />}>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to={ROUTES.DASHBOARD} replace />} />
            <Route path={ROUTES.DASHBOARD} element={<Dashboard />} />
            <Route path={ROUTES.PROFILE}   element={<Profile />} />
            <Route element={<RequirePermission permission={PERMISSIONS.VIEW_METRICS} />}>
              <Route path={ROUTES.METRICS} element={<MetricsDashboard />} />
            </Route>
            <Route path={ROUTES.RANKINGS}  element={<RankingGeneral />} />
            <Route path={ROUTES.INCENTIVES}element={<IncentiveList />} />
            <Route path={ROUTES.INCENTIVE_NEW}  element={<IncentiveForm />} />
            <Route path="/incentives/:id/edit"   element={<IncentiveForm />} />
            <Route path={ROUTES.NOTICES}   element={<NoticeList />} />
            <Route path={ROUTES.NOTICE_NEW}element={<NoticeCreate />} />
            <Route path={ROUTES.HISTORY}   element={<History />} />

            {/* Requires UPLOAD_REPORTS */}
            <Route element={<RequirePermission permission={PERMISSIONS.UPLOAD_REPORTS} />}>
              <Route path={ROUTES.REPORTS}       element={<ReportHistory />} />
              <Route path={ROUTES.REPORT_UPLOAD} element={<ReportUpload />} />
            </Route>

            {/* Requires VIEW_RESTAURANTS */}
            <Route element={<RequirePermission permission={PERMISSIONS.VIEW_RESTAURANTS} />}>
              <Route path={ROUTES.RESTAURANTS}     element={<RestaurantList />} />
              <Route path={ROUTES.RESTAURANT_NEW}  element={<RestaurantForm />} />
              <Route path="/restaurants/:id/edit"  element={<RestaurantForm />} />
            </Route>

            {/* Requires VIEW_USERS */}
            <Route element={<RequirePermission permission={PERMISSIONS.VIEW_USERS} />}>
              <Route path={ROUTES.USERS}    element={<UserList />} />
              <Route path={ROUTES.USER_NEW} element={<UserForm />} />
              <Route path="/users/:id/edit" element={<UserForm />} />
            </Route>

            {/* Requires VIEW_CONFIG */}
            <Route element={<RequirePermission permission={PERMISSIONS.VIEW_CONFIG} />}>
              <Route path={ROUTES.CONFIG} element={<Config />} />
            </Route>

            {/* Requires VIEW_AUDIT */}
            <Route element={<RequirePermission permission={PERMISSIONS.VIEW_AUDIT} />}>
              <Route path={ROUTES.AUDIT} element={<Audit />} />
            </Route>

            {/* Gestión operativa */}
            <Route element={<RequirePermission permission={PERMISSIONS.VIEW_STAFF} />}>
              <Route path={ROUTES.STAFF} element={<StaffList />} />
            </Route>
            <Route element={<RequirePermission permission={PERMISSIONS.VIEW_FLOOR} />}>
              <Route path={ROUTES.FLOOR} element={<FloorConfig />} />
            </Route>
            <Route element={<RequirePermission permission={PERMISSIONS.VIEW_SCHEDULES} />}>
              <Route path={ROUTES.SCHEDULES} element={<WeeklySchedule />} />
            </Route>
            <Route element={<RequirePermission permission={PERMISSIONS.MANAGE_SCHEDULES} />}>
              <Route path={ROUTES.ABSENCES} element={<AbsenceList />} />
            </Route>
            <Route element={<RequirePermission permission={PERMISSIONS.VIEW_ROSTER} />}>
              <Route path={ROUTES.ROSTER} element={<DailyRoster />} />
            </Route>
            <Route element={<RequirePermission permission={PERMISSIONS.HOSTESS_DESK} />}>
              <Route path={ROUTES.HOSTESS} element={<HostessDesk />} />
            </Route>
            <Route element={<RequirePermission permission={PERMISSIONS.VIEW_CLOSING} />}>
              <Route path={ROUTES.CLOSING} element={<ShiftClosing />} />
            </Route>
            <Route element={<RequirePermission permission={PERMISSIONS.CAPTURE_SURVEYS} />}>
              <Route path={ROUTES.SURVEYS} element={<SurveysPage />} />
            </Route>
            <Route element={<RequirePermission permission={PERMISSIONS.VIEW_ALERTS} />}>
              <Route path={ROUTES.ALERTS} element={<AlertsPage />} />
            </Route>
            <Route element={<RequirePermission permission={PERMISSIONS.MANAGE_USERS} />}>
              <Route path={ROUTES.ACCOUNTS} element={<AccountsPage />} />
            </Route>
          </Route>
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
      </Routes>
    </Suspense>
  )
}
