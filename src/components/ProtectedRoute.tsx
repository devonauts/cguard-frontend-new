import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { esVistaPrevia } from "@/lib/vistaPrevia";
import { Navigate, useLocation } from "react-router-dom";

import NoWorkspaceAccess from "./NoWorkspaceAccess";
import VerifyEmailGate from "./VerifyEmailGate";
import SubscriptionLockedScreen from "./SubscriptionLockedScreen";

import { useAuth } from "@/contexts/AuthContext";
import { getBillingState } from "@/lib/entitlements";
import { canAccessCrm } from "@/lib/access";
import AppAccessPending from "@/pages/auth/AppAccessPending";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireVerified?: boolean;
}

/**
 * True when the authenticated user has no usable tenant/workspace. Checks both
 * the persisted tenantId and the in-memory user.tenants array (the latter covers
 * the brief window after login before the tenantId useEffect runs).
 */
function hasNoWorkspace(user: any): boolean {
  try {
    const persisted = localStorage.getItem("tenantId");

    if (persisted) return false;
  } catch {
    /* ignore */
  }

  return !(Array.isArray(user?.tenants) && user.tenants.length > 0);
}

/** Platform superadmins are intentionally tenantless on the client (their tenant
 *  associations are stripped in AuthContext); they belong in the superadmin area,
 *  not blocked by the no-workspace modal. */
function isPlatformSuperadmin(user: any): boolean {
  if (!user) return false;
  if (user.isSuperadmin === true) return true;
  const raw = user.roles ?? user.role ?? [];
  const arr = Array.isArray(raw) ? raw : [raw];

  return arr
    .map((r: any) =>
      typeof r === "string" ? r : r?.name || r?.key || r?.slug || "",
    )
    .some((n: string) => n.toString().toLowerCase().includes("superadmin"));
}

/**
 * Full-screen boot/auth loader (shown on every reload while the session is
 * verified). Multitenant-aware: shows the current tenant's logo, cached in
 * localStorage by the sidebar on load. Falls back to a logo-less gold spinner —
 * never the platform brand — so a white-labeled tenant never sees the wrong
 * logo. Warm off-white (light) / slate-950 (dark) to match the new design.
 */
/**
 * Saca al superadmin de plataforma HACIA LA APP DE VERDAD.
 *
 * `/superadmin/tenants` existe en DOS sitios: la app separada
 * (`superadmin/`, desplegada en `/var/www/superadmin`, la que nginx sirve con
 * `location ^~ /superadmin/`) y una página homónima que quedó viva AQUÍ, en el
 * propio CRM (`pages/admin/superadmin/TenantsPage.tsx`), sobrante de antes de
 * que el panel se separara en su propia app (2026-06-06). Un `<Navigate>` de
 * React Router es navegación DE CLIENTE — no dispara ninguna petición al
 * servidor — así que aterrizaba en la página muerta de aquí, con su propio
 * fetch a `/api/superadmin/tenants` y su propio estado, en vez de en la app
 * real. Ahí es donde un superadmin recién entrado se topaba con «error» sin
 * entender por qué: la página vive, pero ya no es la que nadie mantiene.
 *
 * Por eso esto usa `window.location.replace` y no `<Navigate>`: es una
 * recarga COMPLETA de página, hace falta para cruzar a un bundle de Vite
 * distinto con su PROPIO token (`cguard_sa_token`, ajeno al `authToken` del
 * CRM — visto en `superadmin/src/lib/api.ts`).
 */
function RedirectToSuperadminApp() {
  useEffect(() => {
    window.location.replace("/superadmin/");
  }, []);

  return <LoadingScreen />;
}

function LoadingScreen() {
  const { t } = useTranslation();
  let tenantLogo: string | null = null;

  try {
    tenantLogo = localStorage.getItem("tenantLogoUrl");
  } catch {
    tenantLogo = null;
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-[#F8F7F4] dark:bg-[#0A0A0A]">
      {tenantLogo && (
        <img
          alt="Logo"
          className="h-14 max-w-[200px] object-contain"
          src={tenantLogo}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        <p className="text-sm text-muted-foreground">
          {t("common.loading", "Cargando…")}
        </p>
      </div>
    </div>
  );
}

export default function ProtectedRoute({
  children,
  requireVerified = false,
}: ProtectedRouteProps) {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  // Mostrar loading mientras verifica autenticación
  if (loading) {
    return <LoadingScreen />;
  }

  // Si no está autenticado, redirigir a login
  if (!isAuthenticated) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  // Sin espacio de trabajo: el usuario está autenticado pero no pertenece a
  // ningún tenant. Antes esto provocaba una pantalla en blanco (los servicios
  // con scope de tenant lanzan «No pudimos identificar tu empresa»). Lo
  // interceptamos
  // ANTES de montar cualquier página con scope de tenant.
  if (hasNoWorkspace(user)) {
    // Los superadmin de plataforma son tenantless a propósito: enviarlos a su
    // área (gestión de tenants) en vez de mostrar el modal de "sin acceso".
    if (isPlatformSuperadmin(user)) {
      if (location.pathname.startsWith("/superadmin")) {
        return <>{children}</>;
      }

      return <RedirectToSuperadminApp />;
    }

    return <NoWorkspaceAccess />;
  }

  // Verificación de correo OBLIGATORIA: el backend rechaza (403) toda escritura
  // con scope de tenant hasta que el correo esté verificado. En vez de mostrar
  // errores confusos, bloqueamos con una pantalla clara (reenviar / ya verifiqué).
  // Tiene prioridad sobre el onboarding. (Superadmins ya se manejaron arriba.)
  if (
    user &&
    (user as any).emailVerified === false &&
    !isPlatformSuperadmin(user)
  ) {
    return <VerifyEmailGate />;
  }

  // Bloqueo duro por suscripción (no aplica a superadmins de plataforma).
  //  - suspended: retención administrativa → sin acceso, sin excepción.
  //  - canceled: puede llegar a facturación para reactivar, así que dejamos
  //    pasar la ruta de facturación; el resto se bloquea.
  // Fail-open: sólo bloquea con un estado explícito (sesiones viejas sin estos
  // campos nunca se bloquean).
  if (!isPlatformSuperadmin(user)) {
    const { billingStatus, suspendedAt } = getBillingState(user);

    if (suspendedAt) {
      return <SubscriptionLockedScreen variant="suspended" />;
    }
    if (billingStatus === "canceled") {
      const onBilling =
        location.pathname.startsWith("/setting/billing") ||
        location.pathname.startsWith("/billing");

      if (!onBilling) {
        return <SubscriptionLockedScreen variant="canceled" />;
      }
    }
  }

  // Acceso por canal: el CRM es solo para el personal administrativo. Los
  // vigilantes y supervisores (cuyo acceso es por su app) ven una pantalla que
  // los guía a la app, no el panel. El backend también lo bloquea (403/401);
  // esto es defensa en profundidad + una salida amable en vez de un error.
  if (!canAccessCrm(user)) {
    return <AppAccessPending />;
  }

  // Si todo está bien, mostrar el contenido protegido
  return <>{children}</>;
}

// Variante para rutas públicas (solo accesibles si NO estás autenticado).
// `redirectByRole`: usuarios guardia-solo van a /guard en vez de /dashboard
// (usado en la ruta raíz "/").
export function PublicOnlyRoute({
  children,
  redirectByRole = false,
}: {
  children: React.ReactNode;
  redirectByRole?: boolean;
}) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  // The partner's login preview always shows the login, session or not.
  if (esVistaPrevia()) return <>{children}</>;

  if (loading) {
    return <LoadingScreen />;
  }

  // Permitir acceso si hay un token de invitación en la URL (flujo de registro)
  const searchParams = new URLSearchParams(location.search);
  const hasInviteToken =
    searchParams.has("token") ||
    searchParams.has("invitationToken") ||
    searchParams.has("invite");
  const isInvitationFlow =
    location.pathname.includes("/invitation") ||
    location.pathname.includes("/registration") ||
    searchParams.get("inviteType") === "guard" ||
    searchParams.get("inviteType") === "client";

  // Si hay un token de invitación o es flujo de registro, permitir acceso sin importar autenticación
  if (hasInviteToken || isInvitationFlow) {
    return <>{children}</>;
  }

  // Si ya está autenticado y NO es flujo de invitación, redirigir al dashboard
  if (isAuthenticated) {
    if (redirectByRole) {
      const raw = (user as any)?.roles ?? (user as any)?.role ?? [];
      const arr = Array.isArray(raw) ? raw : [raw];
      const tenantRoles: string[] = Array.isArray((user as any)?.tenants)
        ? (user as any).tenants.flatMap((t: any) => {
            const tr = t.roles ?? t.role ?? [];

            return Array.isArray(tr) ? tr : [tr];
          })
        : [];
      const roles = [...arr, ...tenantRoles]
        .map((x: any) => String(x || "").toLowerCase())
        .filter(Boolean);
      const adminRoles = [
        "admin",
        "superadmin",
        "operationsmanager",
        "securitysupervisor",
        "hrmanager",
        "dispatcher",
        "clientaccountmanager",
        "administrativesupervisor",
        "administrativeassistant",
        "secretary",
      ];
      const isGuardOnly =
        roles.includes("securityguard") &&
        !roles.some((r) => adminRoles.includes(r));

      if (isGuardOnly) return <Navigate replace to="/guard" />;
    }
    const from = (location.state as any)?.from?.pathname || "/dashboard";

    return <Navigate replace to={from} />;
  }

  return <>{children}</>;
}
