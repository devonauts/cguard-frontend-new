import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { QueryClientProvider } from "@tanstack/react-query";
import { ArrowLeftCircle } from "lucide-react";

import AppErrorBoundary from "./components/AppErrorBoundary";
import Login from "./pages/auth/login";
import ForgotPassword from "./pages/auth/forgot-password";
import ResetPassword from "./pages/auth/reset-password";
const DashboardPage = lazy(
  () => import("./pages/admin/dashboard/control-center/ControlCenter"),
);
const AppearancePage = lazy(
  () => import("./pages/admin/Configuration/appearance/AppearancePage"),
);
const OperationsMapFull = lazy(
  () => import("./pages/admin/dashboard/control-center/OperationsMapFull"),
);

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AccentProvider } from "./contexts/AccentContext";
import { IdentidadEfectivaProvider } from "./contexts/IdentidadEfectiva";
import { RadioRealtimeProvider } from "./components/radio/RadioRealtimeProvider";
import { LanguageProvider } from "./contexts/LanguageContext";
import { queryClient } from "./lib/queryClient";
import { FichaPersonaProvider } from "./layouts/FichaPersona";
import "./i18n";
import Register from "./pages/auth/register";
import VerifyEmail from "./pages/auth/verify-email";
import AcceptInvitation from "./pages/auth/accept-invitation";

const ProfileUser = lazy(
  () => import("./pages/admin/Configuration/ProfileUserPage"),
);
const ProfileCompany = lazy(
  () => import("./pages/admin/Configuration/ProfileCompanyPage"),
);
const Notification = lazy(
  () => import("./pages/admin/Configuration/NotificationPage"),
);
const MobilPage = lazy(
  () => import("./pages/admin/Configuration/mobil/MobilPage"),
);
const MobileHubPage = lazy(
  () => import("./pages/admin/Configuration/mobile-hub/MobileHubPage"),
);
const SupervisorAppPage = lazy(
  () => import("./pages/admin/Configuration/supervisor-app/SupervisorAppPage"),
);

import GuardAppLayout from "./layouts/GuardAppLayout";
import { ClientSelectionProvider } from "./contexts/ClientSelectionContext";
import CoBrowseAgent from "./components/cobrowse/CoBrowseAgent";

import { ProgresoDeRuta } from "@/components/kit/movimiento";

const CompanyPoliciesPage = lazy(
  () =>
    import("./pages/admin/Configuration/company-policies/CompanyPoliciesPage"),
);
const IncidentTypesPage = lazy(
  () => import("./pages/admin/Configuration/types-incidents/IncidentTypePage"),
);
const LicenseTypePage = lazy(
  () => import("./pages/admin/Configuration/types-licenses/LicensesTypePage"),
);
const DepartmentPage = lazy(
  () => import("./pages/admin/Configuration/department/DepartmentPage"),
);
const UserRolesPage = lazy(
  () => import("./pages/admin/Configuration/user-roles/UserRolesPage"),
);
const SettingsHome = lazy(
  () => import("./pages/admin/Configuration/SettingsHome"),
);
const IntegrationsList = lazy(
  () => import("./pages/admin/Configuration/integrations/IntegrationsList"),
);
const ProfileFieldsPage = lazy(
  () => import("./pages/admin/Configuration/profile-fields/ProfileFieldsPage"),
);
const PasswordChangePage = lazy(
  () =>
    import("./pages/admin/Configuration/change-password/ChangePasswordPage"),
);
const PostingGlobalPage = lazy(
  () => import("./pages/admin/Configuration/posting-global/PostingGlobalPage"),
);
const CentralPage = lazy(
  () => import("./pages/admin/Configuration/central/CentralPage"),
);
const ReportSettingsPage = lazy(
  () =>
    import("./pages/admin/Configuration/report-settings/ReportSettingsPage"),
);
const GuardsGlobalSettingsPage = lazy(
  () =>
    import(
      "./pages/admin/Configuration/guards-settings/GuardsGlobalSettingsPage"
    ),
);
const EmergencySettingsPage = lazy(
  () => import("./pages/admin/Configuration/emergency/EmergencySettingsPage"),
);
const SecurityPolicyPage = lazy(
  () => import("./pages/admin/Configuration/security/SecurityPolicyPage"),
);
const VigiaUsagePage = lazy(
  () => import("./pages/admin/Configuration/vigia/VigiaUsagePage"),
);
const RondasSettingsPage = lazy(
  () =>
    import("./pages/admin/Configuration/rondas-settings/RondasSettingsPage"),
);
const LanguagePage = lazy(
  () => import("./pages/admin/Configuration/language/LanguagePage"),
);
const JornadaPage = lazy(
  () => import("./pages/admin/Configuration/scheduling/JornadaPage"),
);
const ActivityLogHubPage = lazy(
  () => import("./pages/admin/Configuration/activity-log/ActivityLogHubPage"),
);
const MarcaPage = lazy(
  () => import("./pages/admin/Configuration/brand/MarcaPage"),
);
const FestivosPage = lazy(
  () => import("./pages/admin/Configuration/holidays/FestivosPage"),
);
const RetencionPage = lazy(
  () => import("./pages/admin/Configuration/data/RetencionPage"),
);
const MisAvisosPage = lazy(
  () => import("./pages/admin/Configuration/my-notifications/MisAvisosPage"),
);
const EmailPreferencesPage = lazy(
  () =>
    import(
      "./pages/admin/Configuration/email-preferences/EmailPreferencesPage"
    ),
);
const SmsBalancePage = lazy(
  () => import("./pages/admin/Configuration/sms/SmsBalancePage"),
);
const CommunicationsPage = lazy(
  () => import("./pages/admin/Configuration/communications/CommunicationsPage"),
);
const BillingPage = lazy(
  () => import("./pages/admin/Configuration/billing/BillingPage"),
);
const ActivitiesPage = lazy(
  () => import("./pages/admin/actividades/ActivitiesPage"),
);
const ClientesPage = lazy(() => import("./pages/admin/clientes/ClientsPage"));
const StationsPage = lazy(() => import("./pages/admin/stations/StationsPage"));
const NewOrEditClientPage = lazy(
  () => import("./pages/admin/clientes/NewOrEditClientPage"),
);
const ClientsDetails = lazy(
  () => import("./pages/admin/clientes/ClientsDetails"),
);
const NewOrEditPostSitePage = lazy(
  () => import("./pages/admin/post-sites/NewOrEditPostSitePage"),
);
const PostSiteDetailsPage = lazy(
  () => import("./pages/admin/post-sites/PostSiteDetailsPage"),
);
const AddStationPage = lazy(
  () => import("./pages/admin/post-sites/AddStationPage"),
);
const StationDetailPage = lazy(
  () => import("./pages/admin/post-sites/station-detail/StationDetailPage"),
);
const GlobalInventoryPage = lazy(
  () => import("./pages/admin/inventory/GlobalInventoryPage"),
);
const TrainingCoursesPage = lazy(
  () => import("./pages/admin/training/TrainingCoursesPage"),
);
const TrainingCourseDetailPage = lazy(
  () => import("./pages/admin/training/TrainingCourseDetailPage"),
);
const TrainingEnrollmentsPage = lazy(
  () => import("./pages/admin/training/TrainingEnrollmentsPage"),
);
const TrainingCatalogPage = lazy(
  () => import("./pages/admin/training/TrainingCatalogPage"),
);
const SecurityGuardsPage = lazy(
  () => import("./pages/admin/security-guards/SecurityGuardsPage"),
);
const NewSecurityGuardPage = lazy(
  () => import("./pages/admin/security-guards/NewSecurityGuardPage"),
);
const SupervisorsPage = lazy(
  () => import("./pages/admin/supervisors/SupervisorsPage"),
);
const SupervisorDetailPage = lazy(
  () => import("./pages/admin/supervisors/SupervisorDetailPage"),
);
const SupervisorKpisPage = lazy(
  () => import("./pages/admin/supervisors/SupervisorKpisPage"),
);
const SupervisorNotesPage = lazy(
  () => import("./pages/admin/supervisors/SupervisorNotesPage"),
);
const SupervisorLicensesPage = lazy(
  () => import("./pages/admin/supervisors/SupervisorLicensesPage"),
);
const SupervisorPositionsPage = lazy(
  () => import("./pages/admin/supervisors/SupervisorPositionsPage"),
);
const SupervisorCoveragePage = lazy(
  () => import("./pages/admin/supervisors/SupervisorCoveragePage"),
);
const SupervisorSchedulePage = lazy(
  () => import("./pages/admin/supervisors/SupervisorSchedulePage"),
);
const GuardRegistration = lazy(() => import("./pages/guard/registration"));
const ClientRegistration = lazy(() => import("./pages/client/registration"));
const SupervisorRegistration = lazy(
  () => import("./pages/supervisor/registration"),
);
const AdminOfficeUsersPage = lazy(
  () =>
    import("./pages/admin/administrative-office-users/AdminOfficeUsersPage"),
);
const NewAdminUserPage = lazy(
  () => import("./pages/admin/administrative-office-users/NewAdminUserPage"),
);
const EditAdminUserPage = lazy(
  () => import("./pages/admin/administrative-office-users/EditAdminUserPage"),
);
const AdminUserDetailPage = lazy(
  () => import("./pages/admin/administrative-office-users/AdminUserDetailPage"),
);
const MessengerPage = lazy(
  () => import("./pages/admin/messenger/MessengerPage"),
);
const RadioDispatch = lazy(() => import("./pages/radio/RadioDispatch"));
const RadioDevices = lazy(() => import("./pages/admin/radio/RadioDevices"));
const RadioChannels = lazy(() => import("./pages/radio/RadioChannels"));
const DispatcherPage = lazy(
  () => import("./pages/admin/dispatcher/DispatcherPage"),
);
const CustomerRequests = lazy(
  () => import("./pages/admin/requests/CustomerRequests"),
);
const GuardRatings = lazy(
  () => import("./pages/admin/guard-ratings/GuardRatings"),
);
const NewDispatchPage = lazy(
  () => import("./pages/admin/dispatcher/NewDispatchPage"),
);
const EditDispatchPage = lazy(
  () => import("./pages/admin/dispatcher/EditDispatchPage"),
);
const VehiclesPage = lazy(() => import("./pages/admin/vehicles/VehiclesPage"));
const DispatchDetailsPage = lazy(
  () => import("@/pages/admin/dispatcher/DispatchDetailsPage"),
);
const DispatchPrintablePage = lazy(
  () => import("@/pages/admin/dispatcher/DispatchPrintablePage"),
);
const DispatchPublicView = lazy(
  () => import("@/pages/public/DispatchPublicView"),
);
const DocumentPacketPublicView = lazy(
  () => import("@/pages/public/DocumentPacketPublicView"),
);
const NewVehiclePage = lazy(
  () => import("./pages/admin/vehicles/NewVehiclePage"),
);
const RoutesPage = lazy(() => import("./pages/admin/routes/RoutesPage"));
const PatrullaBoardPage = lazy(
  () => import("./pages/admin/vehicle-patrol/PatrullaBoardPage"),
);
const RouteRunDetailPage = lazy(
  () => import("./pages/admin/vehicle-patrol/RouteRunDetailPage"),
);
const RouteRunsHistoryPage = lazy(
  () => import("./pages/admin/vehicle-patrol/RouteRunsHistoryPage"),
);
const InspectionTemplatesPage = lazy(
  () => import("./pages/admin/vehicle-patrol/InspectionTemplatesPage"),
);
const PatrolSettingsPage = lazy(
  () =>
    import("./pages/admin/Configuration/patrol-settings/PatrolSettingsPage"),
);
const NewRoutePage = lazy(() => import("./pages/admin/routes/NewRoutePage"));
const EditRoutePage = lazy(() => import("./pages/admin/routes/EditRoutePage"));
const LiveTrackingPage = lazy(
  () => import("./pages/admin/gps-tracker/LiveTracking"),
);
const TrackingHistoryPage = lazy(
  () => import("./pages/admin/gps-tracker/TrackingHistory"),
);
const Reports = lazy(() => import("./pages/admin/Reports/Reports"));
const Reporting = lazy(() => import("./pages/admin/analytics/Reporting"));
const Scheduling = lazy(() => import("./pages/admin/analytics/Scheduling"));
const VideoMonitoring = lazy(
  () => import("./pages/admin/video/VideoMonitoring"),
);
const VideoDevices = lazy(() => import("./pages/admin/video/VideoDevices"));
const VideoRelaySites = lazy(
  () => import("./pages/admin/video/VideoRelaySites"),
);
const VideoEvents = lazy(() => import("./pages/admin/video/VideoEvents"));
const VideoSharedClip = lazy(
  () => import("./pages/admin/video/VideoSharedClip"),
);
const AlarmQueue = lazy(() => import("./pages/admin/alarm/AlarmQueue"));
const AlarmPanels = lazy(() => import("./pages/admin/alarm/AlarmPanels"));
const AlarmSignals = lazy(() => import("./pages/admin/alarm/AlarmSignals"));
const AlarmCaseDetail = lazy(
  () => import("./pages/admin/alarm/AlarmCaseDetail"),
);
const AlarmReports = lazy(() => import("./pages/admin/alarm/AlarmReports"));
const AlarmAnalytics = lazy(() => import("./pages/admin/alarm/AlarmAnalytics"));
const AuditLogs = lazy(() => import("./pages/admin/security/AuditLogs"));
const SystemLogs = lazy(() => import("./pages/admin/security/SystemLogs"));
const LoginHistory = lazy(() => import("./pages/admin/security/LoginHistory"));
const NominaDashboard = lazy(
  () => import("./pages/admin/nomina/NominaDashboard"),
);
const NominaTimeClock = lazy(
  () => import("./pages/admin/nomina/NominaTimeClock"),
);
const NominaRecords = lazy(() => import("./pages/admin/nomina/NominaRecords"));
const NominaExceptions = lazy(
  () => import("./pages/admin/nomina/NominaExceptions"),
);
const NominaApprovals = lazy(
  () => import("./pages/admin/nomina/NominaApprovals"),
);
const TaskApprovals = lazy(() => import("./pages/admin/tasks/TaskApprovals"));
const TaskTracking = lazy(() => import("./pages/admin/tasks/TaskTracking"));
const PassdownsPage = lazy(
  () => import("./pages/admin/passdown/PassdownsPage"),
);
const NominaHoursSummary = lazy(
  () => import("./pages/admin/nomina/NominaHoursSummary"),
);
const NominaTimecards = lazy(
  () => import("./pages/admin/nomina/NominaTimecards"),
);
const NominaSettings = lazy(
  () => import("./pages/admin/nomina/NominaSettings"),
);
const Visitors = lazy(
  () => import("./pages/admin/visitor-management/Visitors"),
);
const PostSite = lazy(() => import("./pages/admin/analytics/PostSite"));
const Guard = lazy(() => import("./pages/admin/analytics/Guard"));
const TimeOff = lazy(() => import("./pages/admin/programmer/TimeOff"));
const Schedule = lazy(() => import("./pages/admin/programmer/Schedule"));
const ShiftExchange = lazy(
  () => import("./pages/admin/programmer/ShiftExchange"),
);
const ShiftStatus = lazy(() => import("./pages/admin/programmer/ShiftStatus"));
const OpenShifts = lazy(() => import("./pages/admin/programmer/OpenShifts"));
const Coverage = lazy(() => import("./pages/admin/programmer/Coverage"));
const CheckInOut = lazy(() => import("./pages/admin/Reports/CheckInOut"));
const SiteTour = lazy(() => import("./pages/admin/Reports/SiteTour"));
const Task = lazy(() => import("./pages/admin/Reports/Task"));
const Dar = lazy(() => import("./pages/admin/Reports/Dar"));
const VehiclePatrol = lazy(() => import("./pages/admin/Reports/VehiclePatrol"));
const SupervisionHistory = lazy(
  () => import("./pages/admin/Reports/SupervisionHistory"),
);
const Checklist = lazy(() => import("./pages/admin/Reports/Checklist"));
const PostKpi = lazy(() => import("./pages/admin/Reports/PostKpi"));
const GuardKpi = lazy(() => import("./pages/admin/Reports/GuardKpi"));
const Incident = lazy(() => import("./pages/admin/Reports/Incident"));
const Passdown = lazy(() => import("./pages/admin/Reports/Passdown"));
const WatchMode = lazy(() => import("./pages/admin/Reports/WatchMode"));
const TourCheckPoint = lazy(
  () => import("./pages/admin/Reports/TourCheckPoint"),
);
const GuardIdleLog = lazy(() => import("./pages/admin/Reports/GuardIdleLog"));
const PanicButtonLog = lazy(
  () => import("./pages/admin/Reports/PanicButtonLog"),
);
const GeoFenceLog = lazy(() => import("./pages/admin/Reports/GeoFenceLog"));
const GuardDeviceFallReport = lazy(
  () => import("./pages/admin/Reports/GuardDeviceFallReport"),
);
const PostOrderAck = lazy(() => import("./pages/admin/Reports/PostOrderAck"));
const DocPolicyAck = lazy(() => import("./pages/admin/Reports/DocPolicyAck"));
const License = lazy(() => import("./pages/admin/Reports/License"));
const EditSecurityGuardPage = lazy(
  () => import("./pages/admin/security-guards/EditSecurityGuardPage"),
);
const GuardResumenPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardOverview/GuardOverviewPage"
    ),
);
const GuardPerfilPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardProfile/GuardProfilepage"
    ),
);
const GuardAvailabilityPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardAvailability/GuardAvailabilitypage"
    ),
);
const GuardIndicadoresPage = lazy(
  () =>
    import("./pages/admin/security-guards/components/GuardKPIs/GuardKPIspage"),
);
const GuardDispositivoPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardDevice/GuardDevicepage"
    ),
);
const GuardLicenciasPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardLicenses/GuardLicensespage"
    ),
);
const GuardNotasPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardNotes/GuardNotespage"
    ),
);
const GuardMemosPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardMemos/GuardMemosPage"
    ),
);
const GuardReviewsPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardReviews/GuardReviewsPage"
    ),
);
const GuardHorarioPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardHorario/GuardHorarioPage"
    ),
);
const GuardLogsPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardLogs/GuardLogsPage"
    ),
);
const SupervisorLogsPage = lazy(
  () => import("./pages/admin/supervisors/SupervisorLogsPage"),
);
const GuardAsistenciaPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardAsistencia/GuardAsistenciaPage"
    ),
);
const GuardDesempenoPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardDesempeno/GuardDesempenoPage"
    ),
);
const GuardDocumentosPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardDocumentos/GuardDocumentosPage"
    ),
);
const GuardFilesPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardFiles/GuardFilesPage"
    ),
);
const GuardAsignarSitiosPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardAssign-Sites/GuardAsignarSitiosPage"
    ),
);
const GuardDepartamentoPage = lazy(
  () =>
    import(
      "./pages/admin/security-guards/components/GuardDepartment/GuardDepartamentoPage"
    ),
);

const GuardDashboard = lazy(
  () => import("./pages/guard/dashboard/GuardDashboard"),
);
const GuardSchedulePage = lazy(
  () => import("./pages/guard/dashboard/GuardSchedule"),
);
const GuardTimeOffPage = lazy(
  () => import("./pages/guard/dashboard/GuardTimeOff"),
);
const MemosPage = lazy(() => import("./pages/admin/memos/MemosPage"));
const StyleGuide = lazy(() => import("./pages/StyleGuide"));

import AppLayout from "@/layouts/app-layout";
import ProtectedRoute, { PublicOnlyRoute } from "@/components/ProtectedRoute";
import i18n from "@/i18n";

function normalizeInviteToken(value: string | null | undefined) {
  return value && value !== "null" && value !== "undefined" ? value : undefined;
}

function LoginRouteResolver() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const inviteToken = normalizeInviteToken(
    searchParams.get("token") ||
      searchParams.get("invitationToken") ||
      searchParams.get("invite") ||
      undefined,
  );
  const inviteType = normalizeInviteToken(
    searchParams.get("inviteType") || undefined,
  );
  const securityGuardId = normalizeInviteToken(
    searchParams.get("securityGuardId") || undefined,
  );

  useEffect(() => {
    if (!inviteToken) return;

    // If token explicitly marks a client invite, go to client registration
    if (inviteType === "client") {
      navigate(
        `/client/registration?token=${encodeURIComponent(inviteToken)}&inviteType=client`,
        { replace: true },
      );

      return;
    }

    // Supervisor invite: their home is the SUPERVISOR app, not this CRM. Send
    // them to the supervisor registration/waiting screen (NOT guard, NOT CRM).
    if (inviteType === "supervisor") {
      navigate(
        `/supervisor/registration?token=${encodeURIComponent(inviteToken)}&inviteType=supervisor`,
        { replace: true },
      );

      return;
    }

    // Administrative / internal staff invites: they work in THIS CRM, so send
    // them to the panel onboarding (NOT the customer registration view).
    if (inviteType === "staff" || inviteType === "admin") {
      navigate(
        `/auth/accept-invitation?token=${encodeURIComponent(inviteToken)}&inviteType=staff`,
        { replace: true },
      );

      return;
    }

    // Default behavior: treat as guard invitation and open the public invitation
    // registration page directly. Avoid probing backend endpoints here because
    // that can return 400/204 preflight errors and leave the user on the login page.
    navigate(
      `/auth/invitation?token=${encodeURIComponent(inviteToken)}${securityGuardId ? `&securityGuardId=${encodeURIComponent(securityGuardId)}` : ""}&inviteType=guard`,
      { replace: true },
    );
  }, [inviteToken, inviteType, securityGuardId, navigate]);

  return (
    <PublicOnlyRoute>
      <Login />
    </PublicOnlyRoute>
  );
}

// Routes that render WITHOUT the app chrome (topbar/sidebar): public/auth pages
// and the few full-screen views (shared video clip, style guide, the new-tab
// operations map). Everything else gets the persistent shell.
const NO_CHROME_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/guard_registration",
  "/auth/",
  "/client/registration",
  "/supervisor/registration",
  "/video/shared",
  "/style-guide",
  "/dashboard/operations-map",
  // El enlace privado de documentación: quien lo abre no tiene cuenta, así que
  // la barra lateral del CRM no le sirve de nada y le confundiría.
  "/d/",
];

function isNoChromePath(pathname: string): boolean {
  if (pathname === "/") return true;
  // Guard-mode web app owns its chrome (GuardAppLayout has its own header) — it
  // must NOT get the admin shell. Match /guard and /guard/* but NOT /guards/*
  // (the admin guard-management pages, which DO want the admin shell).
  if (pathname === "/guard" || pathname.startsWith("/guard/")) return true;

  return NO_CHROME_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p),
  );
}

/**
 * Mounts the app shell (topbar + side menu + radio/onboarding providers) ONCE and
 * keeps it mounted across navigation — only the routed page inside it swaps. This
 * is what makes the CRM behave like a real SPA: clicking a menu item no longer
 * reloads the whole chrome. Pages still wrapping themselves in <AppLayout> become
 * transparent passthroughs (see app-layout.tsx). Bare render for unauthenticated
 * sessions and full-screen/public routes.
 */
function PersistentChrome({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated || isNoChromePath(location.pathname))
    return <>{children}</>;

  // La cabecera persistente (topbar + menú + overlay de pánico) se monta FUERA
  // del AppErrorBoundary de las rutas. Este boundary de respaldo evita que un
  // error en cualquier pieza de la envoltura tumbe el CRM entero a blanco.
  return (
    <AppErrorBoundary scope="chrome">
      <AppLayout>{children}</AppLayout>
    </AppErrorBoundary>
  );
}

/**
 * Cruza al panel de plataforma. `window.location` y no `<Navigate>`: hay que
 * recargar de verdad para saltar a otro bundle de Vite, con su propio token
 * (`cguard_sa_token`, ajeno al de este CRM). Vive aquí y no en
 * `ProtectedRoute` porque hay que atenderlo aunque la sesión de ESTE CRM no
 * sirva — el panel tiene su propio inicio de sesión.
 */
function IrAlPanelDePlataforma() {
  useEffect(() => {
    window.location.replace("/superadmin/");
  }, []);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AccentProvider>
          <LanguageProvider>
            <AuthProvider>
              {/* ── LA MARCA, YA CONTRASTADA CONTRA LA EMPRESA DE LA SESIÓN ───
                  `WhiteLabelProvider` (en main.tsx) resuelve de quién es el
                  ANFITRIÓN, que es lo correcto mientras no hay nadie dentro.
                  Esto va DEBAJO de `AuthProvider` porque necesita saber qué
                  empresa está activa: una empresa directa entrando por el
                  anfitrión de un socio —o la del socio A bajo el de B— no puede
                  pintarse con una marca que no es la suya. Vuelve a proveer el
                  MISMO contexto, así que los componentes siguen leyendo
                  `useWhiteLabel()` sin enterarse. */}
              <IdentidadEfectivaProvider>
              <ClientSelectionProvider>
                <CoBrowseAgent />
                <BrowserRouter>
                  {/* ── EL CONTEXTO DE RADIO, POR ENCIMA DE LAS RUTAS ──────────────
                Estaba dentro de `AppLayout`, envolviendo SÓLO al widget
                flotante. Pero `RadioDispatch` renderiza `AppLayout` como HIJO
                suyo y llama a `useRadioRealtime()` en su propio cuerpo, o sea
                por ENCIMA del proveedor: leía el valor por defecto del contexto
                —`connected: false`, `version: 0`— pasara lo que pasara.
                Se veía como un «Reconectando…» eterno en la consola de radio,
                pero lo que de verdad rompía es que `version` NUNCA subía: la
                pantalla no se refrescaba con los eventos de radio en vivo,
                aunque el socket estuviera perfectamente conectado (la campana,
                que usa el mismo hook por su cuenta, sí decía «En vivo»).
                Aquí arriba lo ven las rutas Y el widget, que es lo que el propio
                componente documenta: UNA sola suscripción compartida. */}
                  <RadioRealtimeProvider
                    tenantId={
                      typeof window !== "undefined"
                        ? localStorage.getItem("tenantId")
                        : null
                    }
                  >
                    <PersistentChrome>
                      <Suspense
                        fallback={
                          <>
                            <ProgresoDeRuta />
                            <div
                              style={{
                                minHeight: "60vh",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <div
                                aria-label={i18n.t("ui.App.cargando")}
                                className="animate-spin"
                                style={{
                                  width: 28,
                                  height: 28,
                                  border: "3px solid var(--border,#e5e7eb)",
                                  borderTopColor: "var(--primary,#C8860A)",
                                  borderRadius: "50%",
                                }}
                              />
                            </div>
                          </>
                        }
                      >
                        <AppErrorBoundary scope="routes">
                          <Routes>
                            {/* Enlace público de video compartido (cliente, sin login) */}
                            <Route
                              element={<VideoSharedClip />}
                              path="/video/shared/:token"
                            />

                            {/* Guía de estilo / sistema de diseño */}
                            <Route
                              element={<StyleGuide />}
                              path="/style-guide"
                            />

                            {/* Ruta raíz: sin sesión muestra Login; con sesión redirige por rol
                  (guardia-solo → /guard, resto → /dashboard). Antes había un
                  segundo path="/" al final del árbol que nunca se ejecutaba. */}
                            <Route
                              element={
                                <PublicOnlyRoute redirectByRole>
                                  <Login />
                                </PublicOnlyRoute>
                              }
                              path="/"
                            />
                            <Route
                              element={
                                <PublicOnlyRoute>
                                  <ClientRegistration />
                                </PublicOnlyRoute>
                              }
                              path="/client/registration"
                            />
                            <Route
                              element={
                                <PublicOnlyRoute>
                                  <SupervisorRegistration />
                                </PublicOnlyRoute>
                              }
                              path="/supervisor/registration"
                            />
                            <Route
                              element={<LoginRouteResolver />}
                              path="/login"
                            />
                            <Route
                              element={
                                <PublicOnlyRoute>
                                  <Register />
                                </PublicOnlyRoute>
                              }
                              path="/register"
                            />
                            <Route
                              element={
                                <PublicOnlyRoute>
                                  <GuardRegistration />
                                </PublicOnlyRoute>
                              }
                              path="/guard_registration"
                            />
                            <Route
                              element={
                                <PublicOnlyRoute>
                                  <GuardRegistration />
                                </PublicOnlyRoute>
                              }
                              path="/auth/invitation"
                            />
                            <Route
                              element={
                                <PublicOnlyRoute>
                                  <AcceptInvitation />
                                </PublicOnlyRoute>
                              }
                              path="/auth/accept-invitation"
                            />
                            <Route
                              element={
                                <PublicOnlyRoute>
                                  <VerifyEmail />
                                </PublicOnlyRoute>
                              }
                              path="/auth/verify-email"
                            />
                            <Route
                              element={
                                <PublicOnlyRoute>
                                  <ForgotPassword />
                                </PublicOnlyRoute>
                              }
                              path="/forgot-password"
                            />
                            <Route
                              element={<ResetPassword />}
                              path="/reset-password"
                            />
                            <Route
                              element={<ResetPassword />}
                              path="/auth/password-reset"
                            />

                            {/* Rutas protegidas (requieren autenticación) */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <DashboardPage />
                                </ProtectedRoute>
                              }
                              path="/dashboard"
                            />
                            {/* Full-screen operations map — opened in a new tab (no app chrome). */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <OperationsMapFull />
                                </ProtectedRoute>
                              }
                              path="/dashboard/operations-map"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ActivitiesPage />
                                </ProtectedRoute>
                              }
                              path="/activities"
                            />

                            {/* CLIENTES */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ClientesPage />
                                </ProtectedRoute>
                              }
                              path="/clients"
                            />
                            {/* ESTACIONES */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <StationsPage />
                                </ProtectedRoute>
                              }
                              path="/stations"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NewOrEditClientPage />
                                </ProtectedRoute>
                              }
                              path="/clients/add-new"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NewOrEditClientPage />
                                </ProtectedRoute>
                              }
                              path="/clients/edit/:id"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ClientsDetails />
                                </ProtectedRoute>
                              }
                              path="/clients/:id/overview"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ClientsDetails />
                                </ProtectedRoute>
                              }
                              path="/clients/:id/profile"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ClientsDetails />
                                </ProtectedRoute>
                              }
                              path="/clients/:id/contacts"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ClientsDetails />
                                </ProtectedRoute>
                              }
                              path="/clients/:id/notes"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ClientsDetails />
                                </ProtectedRoute>
                              }
                              path="/clients/:id/files"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ClientsDetails />
                                </ProtectedRoute>
                              }
                              path="/clients/:id/post-sites"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ClientsDetails />
                                </ProtectedRoute>
                              }
                              path="/clients/:id/portal"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ClientsDetails />
                                </ProtectedRoute>
                              }
                              path="/clients/:id/user-access"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ClientsDetails />
                                </ProtectedRoute>
                              }
                              path="/clients/:id/email-reports"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ClientsDetails />
                                </ProtectedRoute>
                              }
                              path="/clients/:id/projects"
                            />
                            {[
                              "contract",
                              "coverage",
                              "staff",
                              "incidents",
                              "reports",
                              "documents",
                            ].map((seg) => (
                              <Route
                                key={seg}
                                element={
                                  <ProtectedRoute>
                                    <ClientsDetails />
                                  </ProtectedRoute>
                                }
                                path={`/clients/:id/${seg}`}
                              />
                            ))}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <TrainingCoursesPage />
                                </ProtectedRoute>
                              }
                              path="/training/courses"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <TrainingCatalogPage />
                                </ProtectedRoute>
                              }
                              path="/training/catalog"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <TrainingCourseDetailPage />
                                </ProtectedRoute>
                              }
                              path="/training/courses/:id"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <TrainingEnrollmentsPage />
                                </ProtectedRoute>
                              }
                              path="/training/courses/:courseId/enrollments"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <GlobalInventoryPage />
                                </ProtectedRoute>
                              }
                              path="/inventory"
                            />
                            {/* "Sitios de servicio" listing retired — sites/stations are now
                  managed from Clientes. Redirect old links there. Detail routes
                  (/post-sites/:id/...) stay: stations are reached via Clientes. */}
                            <Route
                              element={<Navigate replace to="/clients" />}
                              path="/post-sites"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NewOrEditPostSitePage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/new"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NewOrEditPostSitePage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:id/edit"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <AddStationPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:id/stations/new"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PostSiteDetailsPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:id"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PostSiteDetailsPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:id/overview"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PostSiteDetailsPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:id/profile"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PostSiteDetailsPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:id/contacts"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PostSiteDetailsPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:id/kpis"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PostSiteDetailsPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:id/notes"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PostSiteDetailsPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:id/incidents"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PostSiteDetailsPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:id/assign-guards"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PostSiteDetailsPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:id/stations"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PostSiteDetailsPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:id/inventory"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PostSiteDetailsPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:id/site-tours"
                            />
                            {/* STATION DETAIL ROUTES */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <StationDetailPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:postSiteId/stations/:stationId"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <StationDetailPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:postSiteId/stations/:stationId/overview"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <StationDetailPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:postSiteId/stations/:stationId/visitors"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <StationDetailPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:postSiteId/stations/:stationId/guards"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <StationDetailPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:postSiteId/stations/:stationId/shifts"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <StationDetailPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:postSiteId/stations/:stationId/orders"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <StationDetailPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:postSiteId/stations/:stationId/site-tours"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <StationDetailPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:postSiteId/stations/:stationId/tag-scans"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <StationDetailPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:postSiteId/stations/:stationId/inventory"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <StationDetailPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:postSiteId/stations/:stationId/incidents"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <StationDetailPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:postSiteId/stations/:stationId/etiquetas"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <StationDetailPage />
                                </ProtectedRoute>
                              }
                              path="/post-sites/:postSiteId/stations/:stationId/parking"
                            />
                            {/* FIN CLIENTES */}

                            {/* EQUIPOS DE SEGURIDAD */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <SecurityGuardsPage />
                                </ProtectedRoute>
                              }
                              path="/security-guards"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NewSecurityGuardPage />
                                </ProtectedRoute>
                              }
                              path="/security-guards/new"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <EditSecurityGuardPage />
                                </ProtectedRoute>
                              }
                              path="/security-guards/edit/:id"
                            />
                            {/* ── LA FICHA DEL VIGILANTE, BAJO UNA SOLA RUTA PADRE ────────────
                                Las 13 pestañas eran 16 rutas HERMANAS, cada una montando su propio
                                `GuardsLayout`. Cambiar de pestaña desmontaba la cabecera y montaba
                                otra, así que el perfil, la valoración y el rol se volvían a pedir
                                en cada click: 13 x 3 = 39 peticiones para leer una ficha (auditoría
                                2026-09-15). `FichaPersonaProvider` se queda montado mientras se
                                cambia de pestaña y sirve esos tres datos por contexto; las pestañas
                                se pintan en su `<Outlet/>` y siguen siendo exactamente las mismas
                                páginas, con su propio armazón y su propia cabecera. */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <FichaPersonaProvider />
                                </ProtectedRoute>
                              }
                              path="/guards/:id"
                            >
                              {/* `/guards/:id` a secas —un enlace viejo, un
                                  marcador— cae en el resumen. Antes esa url no
                                  resolvía ninguna ruta; ahora la resuelve el
                                  padre, así que sin esto se quedaría en blanco. */}
                              <Route
                                element={<Navigate replace to="resumen" />}
                                index
                              />
                              <Route
                                element={<GuardResumenPage />}
                                path="resumen"
                              />
                              <Route
                                element={<GuardPerfilPage {...({} as any)} />}
                                path="perfil"
                              />
                              <Route
                                element={<GuardDispositivoPage />}
                                path="dispositivo"
                              />
                              <Route
                                element={<GuardAvailabilityPage />}
                                path="availability"
                              />
                              <Route
                                element={<GuardIndicadoresPage />}
                                path="indicadores"
                              />
                              <Route
                                element={<GuardLicenciasPage />}
                                path="licencias"
                              />
                              <Route
                                element={<GuardNotasPage />}
                                path="notas"
                              />
                              <Route
                                element={<GuardMemosPage />}
                                path="memos"
                              />
                              <Route
                                element={<GuardReviewsPage />}
                                path="reviews"
                              />
                              <Route
                                element={<GuardHorarioPage />}
                                path="horario"
                              />
                              <Route
                                element={<GuardAsistenciaPage />}
                                path="asistencia"
                              />
                              {/* Los fichajes que el reloj le RECHAZÓ. Va al
                                  lado de «asistencia» porque es lo que le falta
                                  a esa pestaña: lo que NO llegó a ser. */}
                              <Route element={<GuardLogsPage />} path="logs" />
                              <Route
                                element={<GuardDesempenoPage />}
                                path="desempeno"
                              />
                              <Route
                                element={<GuardDocumentosPage />}
                                path="documentos"
                              />
                              <Route
                                element={<GuardFilesPage />}
                                path="archivos"
                              />
                              <Route
                                element={<GuardAsignarSitiosPage />}
                                path="asignar-sitios"
                              />
                              <Route
                                element={<GuardDepartamentoPage />}
                                path="departamento"
                              />
                            </Route>
                            <Route
                              element={
                                <ProtectedRoute>
                                  <MemosPage />
                                </ProtectedRoute>
                              }
                              path="/memos"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <AdminOfficeUsersPage />
                                </ProtectedRoute>
                              }
                              path="/back-office"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NewAdminUserPage />
                                </ProtectedRoute>
                              }
                              path="/back-office/new"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <EditAdminUserPage />
                                </ProtectedRoute>
                              }
                              path="/back-office/edit/:id"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <AdminUserDetailPage />
                                </ProtectedRoute>
                              }
                              path="/back-office/:id"
                            />
                            {/* FIN DE EQUIPOS DE SEGURIDAD */}

                            {/* ANALITICAS */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <Reporting />
                                </ProtectedRoute>
                              }
                              path="/analytics/reporting"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <Scheduling />
                                </ProtectedRoute>
                              }
                              path="/analytics/scheduling"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PostSite />
                                </ProtectedRoute>
                              }
                              path="/analytics/postsite"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <Guard />
                                </ProtectedRoute>
                              }
                              path="/analytics/guard"
                            />

                            {/* VIDEOVIGILANCIA */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <VideoMonitoring />
                                </ProtectedRoute>
                              }
                              path="/video/monitoring"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <VideoDevices />
                                </ProtectedRoute>
                              }
                              path="/video/devices"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <VideoRelaySites />
                                </ProtectedRoute>
                              }
                              path="/video/relays"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <VideoEvents />
                                </ProtectedRoute>
                              }
                              path="/video/events"
                            />
                            {/* FIN VIDEOVIGILANCIA */}

                            {/* CENTRAL DE MONITOREO (ALARMAS) */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <AlarmQueue />
                                </ProtectedRoute>
                              }
                              path="/alarm/queue"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <AlarmPanels />
                                </ProtectedRoute>
                              }
                              path="/alarm/panels"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <AlarmSignals />
                                </ProtectedRoute>
                              }
                              path="/alarm/signals"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <AlarmCaseDetail />
                                </ProtectedRoute>
                              }
                              path="/alarm/case/:id"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <AlarmReports />
                                </ProtectedRoute>
                              }
                              path="/alarm/reports"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <AlarmAnalytics />
                                </ProtectedRoute>
                              }
                              path="/alarm/analytics"
                            />
                            {/* FIN CENTRAL DE MONITOREO */}

                            <Route
                              element={
                                <ProtectedRoute>
                                  <AuditLogs />
                                </ProtectedRoute>
                              }
                              path="/security/audit"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <SystemLogs />
                                </ProtectedRoute>
                              }
                              path="/registros-sistema"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <LoginHistory />
                                </ProtectedRoute>
                              }
                              path="/historial-inicio-sesion"
                            />
                            {/* FIN ANALITICAS */}

                            <Route
                              element={
                                <ProtectedRoute>
                                  <LiveTrackingPage />
                                </ProtectedRoute>
                              }
                              path="/live-tracking"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <TrackingHistoryPage />
                                </ProtectedRoute>
                              }
                              path="/tracking-history"
                            />

                            {/* Keep any ?conversation=… so notification deep-links still open the thread. */}
                            <Route
                              element={
                                <Navigate
                                  replace
                                  to={`/messenger/operativos${window.location.search}`}
                                />
                              }
                              path="/messenger"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  {/* key per scope: both routes render the same MessengerPage
                        type at the same tree position, so without a distinct key
                        React reuses the instance and just swaps the prop —
                        leaving the previously selected (client) thread on screen.
                        The key forces a fresh remount when switching scopes. */}
                                  <MessengerPage
                                    key="messenger-operational"
                                    scope="operational"
                                  />
                                </ProtectedRoute>
                              }
                              path="/messenger/operativos"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <MessengerPage
                                    key="messenger-client"
                                    scope="client"
                                  />
                                </ProtectedRoute>
                              }
                              path="/messenger/clientes"
                            />

                            <Route
                              element={
                                <ProtectedRoute>
                                  <RadioDispatch />
                                </ProtectedRoute>
                              }
                              path="/radio"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <RadioChannels />
                                </ProtectedRoute>
                              }
                              path="/radio/channels"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <RadioDevices />
                                </ProtectedRoute>
                              }
                              path="/radio/devices"
                            />

                            {/* INFORMES */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <Reports />
                                </ProtectedRoute>
                              }
                              path="/reports"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <CheckInOut />
                                </ProtectedRoute>
                              }
                              path="/reports/check-in-out"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <SiteTour />
                                </ProtectedRoute>
                              }
                              path="/reports/site-tour"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <Task />
                                </ProtectedRoute>
                              }
                              path="/reports/tasks"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <Dar />
                                </ProtectedRoute>
                              }
                              path="/reports/dar"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <VehiclePatrol />
                                </ProtectedRoute>
                              }
                              path="/reports/vehicle-patrol"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <SupervisionHistory />
                                </ProtectedRoute>
                              }
                              path="/reports/supervision-history"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <Checklist />
                                </ProtectedRoute>
                              }
                              path="/reports/checklist"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PostKpi />
                                </ProtectedRoute>
                              }
                              path="/reports/post-kpi"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <GuardKpi />
                                </ProtectedRoute>
                              }
                              path="/reports/guard-kpi"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <Incident />
                                </ProtectedRoute>
                              }
                              path="/reports/incident/:id"
                            />
                            {/* The reports-config "General Incident report" card + "Ver todos"
                  point here (plural); route them to the real incident report. */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <Incident />
                                </ProtectedRoute>
                              }
                              path="/reports/incidents"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <Incident />
                                </ProtectedRoute>
                              }
                              path="/reports/incidents/general"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <Passdown />
                                </ProtectedRoute>
                              }
                              path="/reports/passdown"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <WatchMode />
                                </ProtectedRoute>
                              }
                              path="/reports/watch-mode"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <TourCheckPoint />
                                </ProtectedRoute>
                              }
                              path="/reports/tour-check-point"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <GuardIdleLog />
                                </ProtectedRoute>
                              }
                              path="/reports/guard-idle-log"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PanicButtonLog />
                                </ProtectedRoute>
                              }
                              path="/reports/panic-button-log"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <GeoFenceLog />
                                </ProtectedRoute>
                              }
                              path="/reports/geo-fence-log"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <GuardDeviceFallReport />
                                </ProtectedRoute>
                              }
                              path="/reports/guard-device-fall-report"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PostOrderAck />
                                </ProtectedRoute>
                              }
                              path="/reports/post-order-ack"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <DocPolicyAck />
                                </ProtectedRoute>
                              }
                              path="/reports/doc-policy-ack"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <License />
                                </ProtectedRoute>
                              }
                              path="/reports/license"
                            />

                            {/* FIN DE INFORMES */}

                            {/* NOMINA */}

                            {/* ASISTENCIA · Time & Attendance.
                  Timesheets only. "Rol de Pagos" was removed on 2026-08-06 —
                  pay has to be rebuilt for any country, not just Ecuador. */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NominaDashboard />
                                </ProtectedRoute>
                              }
                              path="/nomina/dashboard"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NominaTimeClock />
                                </ProtectedRoute>
                              }
                              path="/nomina/time-clock"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NominaRecords />
                                </ProtectedRoute>
                              }
                              path="/nomina/records"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NominaExceptions />
                                </ProtectedRoute>
                              }
                              path="/nomina/exceptions"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NominaApprovals />
                                </ProtectedRoute>
                              }
                              path="/nomina/approvals"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <SupervisorsPage />
                                </ProtectedRoute>
                              }
                              path="/supervisors"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <SupervisorPositionsPage />
                                </ProtectedRoute>
                              }
                              path="/supervisor-positions"
                            />
                            {/* La ficha del supervisor, bajo la misma ruta padre que la del
                                vigilante y por lo mismo: `FichaPersonaProvider` lee la ficha una
                                vez y la cabecera deja de pedirla en cada pestaña. */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <FichaPersonaProvider isSupervisor />
                                </ProtectedRoute>
                              }
                              path="/supervisors/:id"
                            >
                              <Route element={<SupervisorDetailPage />} index />
                              <Route
                                element={<SupervisorDetailPage />}
                                path="perfil"
                              />
                              <Route
                                element={<SupervisorCoveragePage />}
                                path="cobertura"
                              />
                              <Route
                                element={<SupervisorSchedulePage />}
                                path="horario"
                              />
                              <Route
                                element={
                                  <GuardDispositivoPage
                                    navKey="supervisors"
                                    title="Dispositivo"
                                  />
                                }
                                path="dispositivo"
                              />
                              <Route
                                element={<SupervisorKpisPage />}
                                path="indicadores"
                              />
                              <Route
                                element={<SupervisorNotesPage />}
                                path="notas"
                              />
                              <Route
                                element={<SupervisorLicensesPage />}
                                path="licencias"
                              />
                              {/* Los fichajes que el reloj le RECHAZÓ. Misma
                                  pantalla que la del vigilante: el suceso es el
                                  mismo aunque el reloj que lo rechaza sea otro. */}
                              <Route element={<SupervisorLogsPage />} path="logs" />
                            </Route>
                            <Route
                              element={
                                <ProtectedRoute>
                                  <TaskTracking />
                                </ProtectedRoute>
                              }
                              path="/tasks"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <TaskApprovals />
                                </ProtectedRoute>
                              }
                              path="/tasks/approvals"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PassdownsPage />
                                </ProtectedRoute>
                              }
                              path="/passdowns"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NominaHoursSummary />
                                </ProtectedRoute>
                              }
                              path="/nomina/payroll-summary"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NominaTimecards />
                                </ProtectedRoute>
                              }
                              path="/nomina/timecards"
                            />
                            {/* Bookmarks and old notification links must not land on a 404. */}
                            <Route
                              element={
                                <Navigate
                                  replace
                                  to="/nomina/payroll-summary"
                                />
                              }
                              path="/nomina/rol-de-pagos"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NominaSettings />
                                </ProtectedRoute>
                              }
                              path="/nomina/settings"
                            />

                            {/* FIN NOMINA */}

                            {/* PROGRAMADOR */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <TimeOff />
                                </ProtectedRoute>
                              }
                              path="/time-off"
                            />
                            {/* /attendance (Programador · Asistencia) removed — merged into
                  /nomina/records, which now shows patrols/incidents per shift. */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <Schedule />
                                </ProtectedRoute>
                              }
                              path="/schedule"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ShiftExchange />
                                </ProtectedRoute>
                              }
                              path="/shift-exchange"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ShiftStatus />
                                </ProtectedRoute>
                              }
                              path="/shift-status"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <OpenShifts />
                                </ProtectedRoute>
                              }
                              path="/open-shifts"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <Coverage />
                                </ProtectedRoute>
                              }
                              path="/coverage"
                            />
                            {/* FIN PROGRAMADOR */}

                            {/* DESPACHADOR */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <DispatcherPage />
                                </ProtectedRoute>
                              }
                              path="/dispatch-tickets"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NewDispatchPage />
                                </ProtectedRoute>
                              }
                              path="/dispatch-tickets/new"
                            />

                            <Route
                              element={
                                <ProtectedRoute>
                                  <EditDispatchPage />
                                </ProtectedRoute>
                              }
                              path="/dispatch-tickets/:id/edit"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <DispatchDetailsPage />
                                </ProtectedRoute>
                              }
                              path="/dispatch-tickets/:id"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <DispatchPrintablePage />
                                </ProtectedRoute>
                              }
                              path="/dispatch-tickets/:id/print"
                            />

                            {/* Public shared dispatch view (no auth) */}
                            <Route
                              element={<DispatchPublicView />}
                              path="/public/dispatch/:token"
                            />

                            {/* Carpeta de documentos entregada al cliente por
                                enlace (no auth). La ruta es corta —`/d/`— a
                                propósito: viaja en un correo. */}
                            <Route
                              element={<DocumentPacketPublicView />}
                              path="/d/:token"
                            />

                            {/* FIN DESPACHADOR */}

                            {/* SOLICITUDES Y CALIFICACIONES DE CLIENTES */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <CustomerRequests />
                                </ProtectedRoute>
                              }
                              path="/customer-requests"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <GuardRatings />
                                </ProtectedRoute>
                              }
                              path="/guard-ratings"
                            />
                            {/* FIN SOLICITUDES Y CALIFICACIONES DE CLIENTES */}

                            {/* GESTION DE VISITANTES */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <Visitors />
                                </ProtectedRoute>
                              }
                              path="/visitors"
                            />
                            {/* «Visitas» y «Vehículos de visitantes» se quitaron:
                                cada una era una segunda vista de datos que ya
                                enseña otra pantalla —`/visitors` lee el mismo
                                `visitorLogService` y además filtra por estación,
                                y `/vehicle-patrol/vehicles` pide la misma lista
                                de flota con buscador y filtro de estado—. */}
                            {/* FIN GESTION DE VISITANTES */}

                            {/* VEHICLES */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <VehiclesPage />
                                </ProtectedRoute>
                              }
                              path="/vehicle-patrol/vehicles"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NewVehiclePage />
                                </ProtectedRoute>
                              }
                              path="/vehicle-patrol/vehicles/add-vehicle"
                            />

                            {/* RUTAS */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PatrullaBoardPage />
                                </ProtectedRoute>
                              }
                              path="/vehicle-patrol"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <RoutesPage />
                                </ProtectedRoute>
                              }
                              path="/vehicle-patrol/routes"
                            />
                            {/* Ejecución guiada (2026-09): historial, detalle de una ejecución
                  (puesto de mando si está abierta) y plantillas de inspección. */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <RouteRunsHistoryPage />
                                </ProtectedRoute>
                              }
                              path="/vehicle-patrol/history"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <RouteRunDetailPage />
                                </ProtectedRoute>
                              }
                              path="/vehicle-patrol/runs/:runId"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <InspectionTemplatesPage />
                                </ProtectedRoute>
                              }
                              path="/vehicle-patrol/templates"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <NewRoutePage />
                                </ProtectedRoute>
                              }
                              path="/tenant/:tenantId/vehicle-patrol/routes/add-new"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <EditRoutePage />
                                </ProtectedRoute>
                              }
                              path="/tenant/:tenantId/vehicle-patrol/routes/:id/edit"
                            />

                            {/* /patrol/:id/execute RETIRADA (2026-08-08): copia vieja del flujo
                  de rondas del app del vigilante. Sin entrada de menú, sin nada
                  que navegara a ella, y su acción publicaba en /patrolLog — un
                  endpoint que nunca existió. El flujo real vive en worker-app
                  (GuardPatrol) contra /site-tour/tag-scan. Implementar /patrolLog
                  habría creado un segundo camino paralelo para registrar lo mismo. */}

                            {/* CONFIGURACIONES */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ProfileUser />
                                </ProtectedRoute>
                              }
                              path="/setting/user-profile"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ProfileCompany />
                                </ProtectedRoute>
                              }
                              path="/setting/company-profile"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PasswordChangePage />
                                </ProtectedRoute>
                              }
                              path="/setting/change-password"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <MobilPage />
                                </ProtectedRoute>
                              }
                              path="/setting/mobil"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <MobileHubPage />
                                </ProtectedRoute>
                              }
                              path="/setting/mobile-hub"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <SupervisorAppPage />
                                </ProtectedRoute>
                              }
                              path="/setting/supervisor-app"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <Notification />
                                </ProtectedRoute>
                              }
                              path="/setting/notifications"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <CompanyPoliciesPage />
                                </ProtectedRoute>
                              }
                              path="/setting/politicas"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <IncidentTypesPage />
                                </ProtectedRoute>
                              }
                              path="/setting/tipos-incidentes"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <LicenseTypePage />
                                </ProtectedRoute>
                              }
                              path="/setting/tipos-licencias"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <DepartmentPage />
                                </ProtectedRoute>
                              }
                              path="/setting/Departamentos"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ProfileFieldsPage />
                                </ProtectedRoute>
                              }
                              path="/setting/campos-perfil"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <SettingsHome />
                                </ProtectedRoute>
                              }
                              path="/setting"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <LanguagePage />
                                </ProtectedRoute>
                              }
                              path="/setting/idioma"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <AppearancePage />
                                </ProtectedRoute>
                              }
                              path="/setting/apariencia"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <UserRolesPage />
                                </ProtectedRoute>
                              }
                              path="/setting/roles"
                            />

                            <Route
                              element={
                                <ProtectedRoute>
                                  <IntegrationsList />
                                </ProtectedRoute>
                              }
                              path="/setting/integraciones"
                            />

                            {/* The real payroll/nómina config lives at /nomina/settings (salary basis,
                  monthly, extra-hour types). /setting/payroll-setup was a no-op stub —
                  redirect it to the working page. */}
                            <Route
                              element={
                                <Navigate replace to="/nomina/settings" />
                              }
                              path="/setting/payroll-setup"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PostingGlobalPage />
                                </ProtectedRoute>
                              }
                              path="/setting/publishing-sites"
                            />
                            {/* La consola 24/7: si existe, dónde está y a quién avisa. */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <CentralPage />
                                </ProtectedRoute>
                              }
                              path="/setting/central"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <GuardsGlobalSettingsPage />
                                  {/* FALTA */}
                                </ProtectedRoute>
                              }
                              path="/setting/keep-safe"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <VigiaUsagePage />
                                </ProtectedRoute>
                              }
                              path="/setting/asistente-ia"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <SecurityPolicyPage />
                                </ProtectedRoute>
                              }
                              path="/setting/seguridad"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <EmergencySettingsPage />
                                </ProtectedRoute>
                              }
                              path="/setting/emergencias"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <RondasSettingsPage />
                                </ProtectedRoute>
                              }
                              path="/setting/rondas"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <PatrolSettingsPage />
                                </ProtectedRoute>
                              }
                              path="/setting/patrullaje"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <JornadaPage />
                                </ProtectedRoute>
                              }
                              path="/setting/jornada"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ActivityLogHubPage />
                                </ProtectedRoute>
                              }
                              path="/setting/registro-actividad"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <MarcaPage />
                                </ProtectedRoute>
                              }
                              path="/setting/marca"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <FestivosPage />
                                </ProtectedRoute>
                              }
                              path="/setting/festivos"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <RetencionPage />
                                </ProtectedRoute>
                              }
                              path="/setting/retencion"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <MisAvisosPage />
                                </ProtectedRoute>
                              }
                              path="/setting/mis-avisos"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <EmailPreferencesPage />
                                </ProtectedRoute>
                              }
                              path="/setting/email-preferences"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <SmsBalancePage />
                                </ProtectedRoute>
                              }
                              path="/setting/sms"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <CommunicationsPage />
                                </ProtectedRoute>
                              }
                              path="/setting/comunicaciones"
                            />
                            <Route
                              element={
                                <Navigate replace to="/setting/billing" />
                              }
                              path="/billing"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <BillingPage />
                                </ProtectedRoute>
                              }
                              path="/setting/billing"
                            />
                            <Route
                              element={
                                <ProtectedRoute>
                                  <ReportSettingsPage />
                                </ProtectedRoute>
                              }
                              path="/setting/report-configuration"
                            />

                            {/* La antigua /idioma montaba el widget de Google Translate: un
                  segundo sistema de traducción, por máquina y encima del real,
                  que además ofrecía idiomas que el producto no habla. El ajuste
                  de verdad vive en Configuración › Idioma; el marcador viejo
                  sigue funcionando. */}
                            <Route
                              element={
                                <Navigate replace to="/setting/idioma" />
                              }
                              path="/idioma"
                            />

                            {/* GUARD APP (role-based) */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <GuardAppLayout />
                                </ProtectedRoute>
                              }
                              path="/guard"
                            >
                              <Route index element={<GuardDashboard />} />
                              <Route
                                element={<GuardSchedulePage />}
                                path="schedule"
                              />
                              <Route
                                element={<GuardTimeOffPage />}
                                path="time-off"
                              />
                            </Route>

                            {/* El panel de plataforma es OTRA app, servida por
                                nginx en `/superadmin/` con su propio bundle y su
                                propio token. Quien llegue aquí con un marcador
                                de antes de la separación caía en el 404 de este
                                CRM en vez de en su panel. */}
                            <Route
                              element={<IrAlPanelDePlataforma />}
                              path="/superadmin/*"
                            />

                            {/* 404 - Página no encontrada */}
                            <Route element={<NotFound />} path="*" />
                          </Routes>
                        </AppErrorBoundary>
                      </Suspense>
                    </PersistentChrome>
                  </RadioRealtimeProvider>
                </BrowserRouter>
              </ClientSelectionProvider>
              </IdentidadEfectivaProvider>
            </AuthProvider>
          </LanguageProvider>
        </AccentProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
      <div className="text-center">
        <ArrowLeftCircle className="mx-auto h-16 w-16 text-emerald-500 mb-4" />
        <h1 className="text-6xl font-extrabold text-emerald-600">404</h1>
        <p className="mt-4 text-lg text-foreground/70">
          {t("ui.App.paginaNoEncontrada", "Página no encontrada")}
        </p>
        <a
          className="mt-6 inline-block rounded-lg bg-emerald-600 px-6 py-2 text-white font-semibold shadow hover:bg-emerald-700 transition-all"
          href="/dashboard"
        >
          Ir al Dashboard
        </a>
      </div>
    </div>
  );
}
