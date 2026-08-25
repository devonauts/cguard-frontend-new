import { createContext, useContext, useEffect, useRef, useState } from "react";
import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { setTenantId } from "@/lib/api/clientService";
import { setTenantId as setCategoryTenantId } from "@/lib/api/categoryService";
import { useLocation, useNavigate } from "react-router-dom";
import TenantJoinModal from "@/components/TenantJoinModal";
import TrialBanner from "@/components/TrialBanner";
import DemoDataBanner from "@/components/DemoDataBanner";
import PlatformAnnouncements from "@/components/PlatformAnnouncements";
import { RadioRealtimeProvider } from "@/components/radio/RadioRealtimeProvider";
import RadioVoiceWidget from "@/components/radio/RadioVoiceWidget";
import VigiaWidget from "@/components/vigia/VigiaWidget";
import OnboardingProvider from "@/components/onboarding/OnboardingProvider";
import tenantService from "@/services/tenant.service";
import { cacheTenantLocation, cacheTenantCountry, cacheTenantTimezone } from "@/utils/tenantLocation";

interface AppLayoutProps {
  children: React.ReactNode;
}

// True inside the ONE mounted shell. The CRM renders the shell (topbar/sidebar/
// radio/onboarding) once at the router level (see PersistentChrome in App.tsx),
// so pages that still wrap themselves in <AppLayout> (directly or via nested
// layouts like PostSiteLayout/GuardsLayout) must NOT paint a second shell — and,
// crucially, must not REMOUNT the shell on every navigation. When this context is
// already true, AppLayout is a transparent passthrough: it just renders its
// children into the persistent shell, so the topbar/side menu never reload.
const AppLayoutMountedContext = createContext(false);

/**
 * Marca de «ya hay un armazón montado» para que anidar no duplique el cromo.
 *
 * EL FALLO QUE ARREGLA: `PersistentChrome` (App.tsx) envuelve TODA ruta
 * autenticada en `AppLayout`, y además 112 páginas se envuelven ellas mismas en
 * otro `AppLayout` — una costumbre anterior a que existiera el armazón
 * persistente. Resultado: dos barras superiores y dos menús laterales, uno
 * dentro del otro.
 *
 * Se arregla aquí y no en las 112 páginas por dos razones: una, es un cambio en
 * lugar de ciento doce; dos, la siguiente página que alguien escriba copiando a
 * una vecina volverá a traer su `AppLayout`, y con esto dará igual.
 */
const YaHayArmazon = createContext(false);

export default function AppLayout({ children }: AppLayoutProps) {
  const anidado = useContext(YaHayArmazon);
  if (anidado) return <>{children}</>;
  return <YaHayArmazon.Provider value={true}><AppLayoutInterno>{children}</AppLayoutInterno></YaHayArmazon.Provider>;
}

function AppLayoutInterno({ children }: AppLayoutProps) {
  const alreadyInShell = useContext(AppLayoutMountedContext);
  // Nested (page-level) AppLayout → passthrough. No hooks below run here, so the
  // persistent shell above owns all the shell state/effects exactly once.
  if (alreadyInShell) return <>{children}</>;
  return <AppLayoutShell>{children}</AppLayoutShell>;
}

function AppLayoutShell({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );
  const { user, loading, isAdmin, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const mainRef = useRef<HTMLElement>(null);
  const toggleSidebar = () => setSidebarOpen((v) => !v);
  const closeSidebar = () => setSidebarOpen(false);

  // control body overflow when sidebar is open on mobile
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.matchMedia("(max-width: 1023px)").matches;
    document.body.style.overflow = isMobile && sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  // Keep sidebar state in sync with breakpoint: desktop => open, mobile => closed
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setSidebarOpen(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Configurar tenantId globalmente cuando el usuario cambia
  useEffect(() => {
    try {
      let tenantId: string | null = null;
      if (user) {
        if (Array.isArray(user.tenants) && user.tenants.length > 0) {
          const t = user.tenants[0];
          tenantId = t.tenantId || t.id || t._id || (t.tenant && (t.tenant.id || t.tenant.tenantId)) || null;
        }
        if (!tenantId) {
          // legacy shapes
          tenantId = (user.tenant && (user.tenant.tenant?.id || user.tenant.tenantId || user.tenant.id || user.tenant._id)) || (user.tenantId || null);
        }
      }
      if (tenantId) {
        setTenantId(tenantId);
        setCategoryTenantId(tenantId);
      }
    } catch (e) {
      // ignore
    }
  }, [user]);

  // If user has no tenant, ensure they stay on dashboard route
  useEffect(() => {
    // Wait until auth finished loading to avoid redirecting before profile is ready
    if (loading) return;

    const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null;
    const hasTenant = Boolean(tenantId || (user && (user.tenant || (Array.isArray(user.tenants) && user.tenants.length > 0))));
    if (!hasTenant && location.pathname !== "/dashboard") {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, location.pathname, navigate]);

  // show modal when user has no tenant and is on dashboard
  const tenantIdNow = typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null;

  const userHasActiveTenant = (u: any) => {
    if (!u) return false;

    // Top-level tenantId or tenant as string
    if (u.tenantId) return true;
    if (typeof u.tenant === 'string' && u.tenant) return true;

    // Direct tenant shape (single-tenant mode) as object
    if (u.tenant && typeof u.tenant === 'object') {
      const t = u.tenant;
      const tid = t.tenantId || t.id || t._id || (t.tenant && (t.tenant.id || t.tenant.tenantId));
      if (tid) return true;
    }

    // Tenants array (multi-tenant or legacy shapes)
    if (Array.isArray(u.tenants) && u.tenants.length > 0) {
      // consider tenantUser entries that are active or have a tenantId
      return u.tenants.some((tu: any) => {
        if (!tu) return false;
        // If tenant entry is a string (legacy simple id array), consider it active
        if (typeof tu === 'string' && tu) return true;
        const tid = tu.tenantId || tu.id || tu._id || (tu.tenant && (tu.tenant.id || tu.tenant.tenantId));
        const status = tu.status || null;
        return Boolean(tid) && status !== 'invited';
      });
    }

    return false;
  };

  const hasTenantNow = Boolean(
    tenantIdNow || (user && userHasActiveTenant(user))
  );

  // Helper: detect if a user holds `superadmin` in any common shape
  const userIsSuperAdmin = (u: any) => {
    if (!u) return false;
    const normalize = (r: any) => {
      if (!r) return [];
      if (Array.isArray(r)) return r.map((it) => (typeof it === 'string' ? it : (it?.name || it?.key || it?.slug || ''))).filter(Boolean);
      if (typeof r === 'string') return [r];
      return [];
    };

    const global = normalize(u.roles ?? u.role ?? []);
    const tenantsArr = Array.isArray(u.tenants) ? u.tenants.flatMap((t: any) => normalize(t.roles ?? t.role ?? [])) : [];
    const singleTenant = u.tenant ? normalize(u.tenant.roles ?? u.tenant.role ?? []) : [];
    const all = [...global, ...tenantsArr, ...singleTenant].map((s) => (s || '').toString().toLowerCase());
    return all.some((n) => n.includes('superadmin'));
  };

  // If the user object contains an active tenant but localStorage isn't
  // populated yet (race on initial load), persist it so other codepaths
  // (permissions, services) pick it up and the modal doesn't show.
  useEffect(() => {
    if (!user) return;
    if (tenantIdNow) return;
    if (!userHasActiveTenant(user)) return;

    // Derive tenantId from `user` shape
    let derived: string | null = null;
    try {
      if (user.tenant) {
        const t = user.tenant;
        derived = t.tenantId || t.id || t._id || (t.tenant && (t.tenant.id || t.tenant.tenantId)) || null;
      }
      if (!derived && Array.isArray(user.tenants) && user.tenants.length > 0) {
        const first = user.tenants[0];
        derived = first.tenantId || first.id || first._id || (first.tenant && (first.tenant.id || first.tenant.tenantId)) || null;
      }
    } catch (e) {
      derived = null;
    }

    if (derived) {
      try { localStorage.setItem('tenantId', derived); } catch {}
      try { setTenantId(derived); } catch {}
      try { setCategoryTenantId(derived); } catch {}

      // Warm the business location cache so maps center on the business city
      (async () => {
        try {
          const res: any = await tenantService.findById(String(derived));
          const t = (res && (res.data || res.tenant)) ? (res.data || res.tenant) : res;
          cacheTenantLocation((t as any)?.latitude, (t as any)?.longitude);
          cacheTenantCountry((t as any)?.countryCode ?? (t as any)?.country_code ?? null);
          cacheTenantTimezone((t as any)?.timezone ?? null);
        } catch {}
      })();
    }
  }, [user]);

  // Only show the tenant modal after auth has finished loading. This prevents
  // a flash where the modal appears before the user's profile (and tenant)
  // are available and blocks the UI.
  // Do not show tenant join/create modal for global admins (superadmin)
  // Also hide if the `user` object contains `superadmin` anywhere to avoid
  // showing the modal while auth state is still syncing.
  // Only show modal for authenticated non-admin users whose profile is loaded
  const showTenantModal =
    !loading &&
    isAuthenticated &&
    !hasTenantNow &&
    location.pathname === "/dashboard" &&
    !isAdmin &&
    !userIsSuperAdmin(user);

  // Close sidebar on mobile when the route changes to avoid it staying open
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMobile = window.matchMedia("(max-width: 1023px)").matches;
    if (isMobile) {
      setSidebarOpen(false);
    }
    // The scroll container (<main>) now persists across navigation, so reset it
    // to the top on each route change — otherwise a new page opens mid-scroll.
    try { mainRef.current?.scrollTo({ top: 0, left: 0 }); } catch { /* ignore */ }
  }, [location.pathname]);


  return (
    <AppLayoutMountedContext.Provider value={true}>
    {/* ── EL CONTRATO DE ALTURA DEL ARMAZÓN ──────────────────────────────────
       Tres piezas tienen que sumar lo mismo o el armazón se descuadra:
         · esta caja            → alto de la ventana
         · la cabecera          → 3,5rem + la muesca (`safe-area-inset-top`)
         · `<main>`             → lo que sobra: ventana − cabecera − muesca
       Y fuera de este archivo, `glass.css` coloca `.cg-route-progress` justo
       debajo de la cabecera, así que su `top` es la MISMA fórmula.

       `dvh` y no `vh`: en el móvil `100vh` cuenta la franja del navegador, así
       que la barra de direcciones tapaba los últimos ~60 px de la aplicación.
       Va detrás de `@supports` —igual que `control-center.css` hace con su
       propia altura— porque si un navegador no entiende `dvh` la declaración
       se cae entera y la caja se quedaría en `height:auto`. Con el respaldo
       en `vh` delante, ese navegador se comporta EXACTAMENTE como hoy.

       `env(safe-area-inset-*)` vale `0px` mientras el `<meta viewport>` no
       lleve `viewport-fit=cover`, que hoy NO lo lleva: todo esto mide lo mismo
       que antes hasta que alguien active el borde a borde. */}
    <div className="app-shell h-screen w-full bg-background supports-[height:100dvh]:h-[100dvh]">
      {/* El velo de los menús flotantes vive AQUÍ DENTRO, no en el <body>.
          `.app-shell` lleva `isolation: isolate`, así que crea su propio contexto
          de apilamiento: un velo hermano suyo pintaba por encima del armazón
          ENTERO —cabecera y menú incluidos— y desenfocaba también el menú que
          venía a destacar. Dentro, con z-40, queda por debajo de la cabecera
          (z-50) y por encima del contenido, que es exactamente lo que hace falta. */}
      <div className="cg-scrim-menu" aria-hidden />
      {/* La cabecera RESERVA la muesca con `padding-top` y crece lo mismo en
          `height`: con `box-sizing: border-box` su caja de contenido sigue
          midiendo 3,5rem exactas, así que los botones no se mueven ni un píxel.
          Ojo al tocar esto: `.app-header` NO debe añadir su propio
          `padding-top` — se sumaría a este y la barra saldría el doble de alta. */}
      <div className={["app-header sticky top-0 z-50 h-[calc(3.5rem_+_env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] transition-[margin] duration-300", sidebarOpen ? "lg:ml-[17rem]" : "lg:ml-16"].join(" ")}>
        <Header toggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />
      </div>

      {/* 17rem es el menú SOLO: la barra ya no lleva un riel de secciones de
          4rem pegado al panel, así que no hay que pagar ese ancho extra.
          Colapsar tampoco es «esconder»: quedan los 4rem con TODOS los destinos
          en iconos. El `overflow-visible` deja salir el submenú flotante de los
          desplegables; el desplazamiento vive dentro de la propia barra. */}
      <aside
        className={[
          "hidden lg:block fixed left-0 top-0 z-40 pl-[env(safe-area-inset-left)] h-screen supports-[height:100dvh]:h-[100dvh] overflow-visible transition-[width] duration-300",
          sidebarOpen ? "w-[17rem]" : "w-16",
        ].join(" ")}
      >
        <Sidebar collapsed={!sidebarOpen} />
      </aside>

      <div
        className={[
          "fixed left-0 top-0 z-[60] w-[calc(17rem_+_env(safe-area-inset-left))] pl-[env(safe-area-inset-left)] h-screen supports-[height:100dvh]:h-[100dvh] lg:hidden transform transition-transform duration-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <Sidebar onNavigate={closeSidebar} />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-[55] bg-black/30 lg:hidden" onClick={closeSidebar} />
      )}

      <main
        ref={mainRef}
        className={[
          "relative h-[calc(100vh_-_3.5rem_-_env(safe-area-inset-top))] supports-[height:100dvh]:h-[calc(100dvh_-_3.5rem_-_env(safe-area-inset-top))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] overflow-y-auto transition-[margin] duration-300",
          sidebarOpen ? "lg:ml-[17rem]" : "lg:ml-16",
        ].join(" ")}
      >
        <OnboardingProvider>
          <TrialBanner />
          <DemoDataBanner />
          {/* Lo que la plataforma quiere decirle a ESTA empresa. */}
          <PlatformAnnouncements />
          {children}
        </OnboardingProvider>
      </main>

      {/* Single radio surface: the header radio icon opens this persistent
          open-channel widget (toggle on → stays connected + listening across
          navigation; the socket/audio live in a module singleton). The pase de
          novedades is started from inside it. RadioRealtimeProvider stays for the
          /radio console + radio event context. */}
      <RadioRealtimeProvider tenantId={tenantIdNow}>
        <RadioVoiceWidget />
      </RadioRealtimeProvider>

      {/* VigIA — el asistente, abajo a la derecha. Solo para el equipo (el
          armazón del CRM ya es de staff); las acciones corren con los permisos
          del usuario y toda escritura se confirma en el chat. */}
      <VigiaWidget />

      {/* Toaster lives once globally in main.tsx — a second one here made every
          toast (notifications included) render twice. */}

      <TenantJoinModal open={showTenantModal} onOpenChange={() => { /* noop - modal controlled by presence */ }} />


    </div>
    </AppLayoutMountedContext.Provider>
  );
}
