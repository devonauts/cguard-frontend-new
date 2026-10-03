import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";

import OnboardingWizard from "./OnboardingWizard";
import OnboardingBanner from "./OnboardingBanner";
import {
  extractOnboardingTenant,
  needsOnboarding,
  snoozeKey,
  OnboardingTenant,
} from "./onboardingUtils";

import { useAuth } from "@/contexts/AuthContext";

interface OnboardingContextValue {
  tenant: OnboardingTenant | null;
  openWizard: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(
  undefined,
);

export const useOnboarding = () => {
  const ctx = useContext(OnboardingContext);

  if (!ctx) {
    return { tenant: null, openWizard: () => {} } as OnboardingContextValue;
  }

  return ctx;
};

// Detect platform superadmin across the common profile shapes.
function userIsSuperadmin(u: any): boolean {
  if (!u) return false;
  if (u.isSuperadmin === true) return true;
  const normalize = (r: any) => {
    if (!r) return [];
    if (Array.isArray(r))
      return r
        .map((it) =>
          typeof it === "string" ? it : it?.name || it?.key || it?.slug || "",
        )
        .filter(Boolean);
    if (typeof r === "string") return [r];

    return [];
  };
  const global = normalize(u.roles ?? u.role ?? []);
  const tenants = Array.isArray(u.tenants)
    ? u.tenants.flatMap((t: any) => normalize(t.roles ?? t.role ?? []))
    : [];
  const single = u.tenant
    ? normalize(u.tenant.roles ?? u.tenant.role ?? [])
    : [];

  return [...global, ...tenants, ...single].some((n) =>
    (n || "").toString().toLowerCase().includes("superadmin"),
  );
}

/**
 * Controller for the first-login onboarding feature. Derives the current
 * tenant + completeness from auth state, owns the wizard open state, and
 * auto-opens the wizard once on first login (or while incomplete) unless the
 * user snoozed it. Mounts the banner and wizard; exposes openWizard().
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, loading, refreshProfile, isAdmin, hasPermission } = useAuth();
  const [wizardOpen, setWizardOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  const tenant = useMemo(() => extractOnboardingTenant(user), [user]);
  const isSuper = useMemo(() => userIsSuperadmin(user), [user]);

  const incomplete = !isSuper && needsOnboarding(tenant);
  /* ── OBLIGATORIO, PERO SÓLO PARA QUIEN PUEDE GUARDARLO ──────────────────
     Pedido del dueño (2026-10-03): con «Completar más tarde» casi nadie
     volvía. Pero guardar la empresa exige `tenantEdit`: obligar a un
     operador sin ese permiso lo dejaría encerrado delante de un formulario
     que el servidor le rechaza. A él se le sigue ofreciendo, sin forzar. */
  // El contexto expone `hasPermission`, no la lista: leer `permissions` o
  // `tenantAdmin` daba siempre `undefined` y el asistente nunca se volvía
  // obligatorio.
  const puedeEditarEmpresa = !!isAdmin || !!hasPermission?.("tenantEdit");
  const obligatorio = incomplete && puedeEditarEmpresa;

  // Auto-open once: first login OR onboarding incomplete, unless snoozed.
  useEffect(() => {
    if (loading) return;
    if (isSuper) return;
    if (!tenant?.id) return;
    if (autoOpenedRef.current) return;
    if (!incomplete) return;

    let snoozed = false;

    try {
      snoozed = localStorage.getItem(snoozeKey(tenant.id)) === "1";
    } catch {}

    const firstLogin = user?.isFirstLogin === true;

    // Obligatorio o primer acceso: se abre aunque se haya pospuesto antes.
    if (obligatorio || firstLogin || !snoozed) {
      autoOpenedRef.current = true;
      setWizardOpen(true);
    }
  }, [
    loading,
    isSuper,
    tenant?.id,
    incomplete,
    user?.isFirstLogin,
    obligatorio,
  ]);

  /* Si es obligatorio no se puede quedar cerrado (p. ej. otro componente
     llamó a cerrar): se vuelve a abrir. */
  useEffect(() => {
    if (obligatorio && !wizardOpen && !loading) setWizardOpen(true);
  }, [obligatorio, wizardOpen, loading]);

  const value = useMemo<OnboardingContextValue>(
    () => ({ tenant, openWizard: () => setWizardOpen(true) }),
    [tenant],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {!isSuper && tenant?.id && (
        <OnboardingBanner
          isSuperadmin={isSuper}
          tenant={tenant}
          onOpenWizard={() => setWizardOpen(true)}
          onRefresh={refreshProfile}
        />
      )}
      {children}
      {!isSuper && tenant?.id && (
        <OnboardingWizard
          defaultEmail={user?.email}
          obligatorio={obligatorio}
          open={wizardOpen}
          tenant={tenant}
          onOpenChange={setWizardOpen}
          onRefresh={refreshProfile}
        />
      )}
    </OnboardingContext.Provider>
  );
}

export default OnboardingProvider;
