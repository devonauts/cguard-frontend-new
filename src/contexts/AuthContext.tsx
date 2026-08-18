import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { AuthService, LoginCredentials, SignUpData } from "../services/auth/authService";
import { setAuthToken, clearAuthToken } from "@/lib/api";
import { setTenantId as setClientServiceTenantId, clearTenantId as clearClientServiceTenantId } from "@/lib/api/clientService";
import { setTenantId as setCategoryTenantId } from "@/lib/api/categoryService";
import { setTenantId as setStationServiceTenantId } from "@/lib/api/stationService";
import { ApiError } from "../services/api/apiService";
import { queryClient } from "@/lib/queryClient";
import { clearPersistedCache } from "@/lib/offline/persistCache";
import { clearQueue } from "@/lib/offline/offlineQueue";
import { isNetworkFailure } from "@/lib/offline/networkStatus";
import { setAppBadge } from "@/lib/desktop";

/**
 * Higiene de máquina compartida: si el usuario que ENTRA no es el mismo que
 * dejó datos offline (caché IDB, cola de escrituras, perfil), se limpian antes
 * de hidratar. El signOut ya limpia — esto cubre los cierres que NO pasan por
 * signOut (401 duro, sesión superseded, pestaña cerrada sin salir).
 */
function purgeOfflineDataIfDifferentUser(newUserId: string | undefined): void {
  try {
    const raw = localStorage.getItem("authUserCache");
    const prevId = raw ? JSON.parse(raw)?.user?.id : null;
    if (prevId && newUserId && prevId !== newUserId) {
      void clearPersistedCache();
      clearQueue();
      localStorage.removeItem("authUserCache");
    }
  } catch { /* best-effort */ }
}

interface User { id?: string; email: string; permissions?: string[]; [k: string]: any }
interface AuthResult { success: boolean; error?: string; needVerification?: boolean }
interface AuthContextType {
  user: User | null; loading: boolean; error: string | null;
  signIn: (c: LoginCredentials) => Promise<AuthResult>;
  signUp: (d: SignUpData) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  // permite iniciar sesión usando un token (por ejemplo OAuth callback)
  signInWithToken: (token: string, user?: any) => Promise<AuthResult>;
  // Re-fetch the profile from /auth/me and re-hydrate auth state.
  // Returns the fresh user object (or null on failure).
  refreshProfile: () => Promise<User | null>;
  isAuthenticated: boolean;
  hasPermission: (perm: string) => boolean;
  hasAny: (perms: string[]) => boolean;
  // global admin flag (true only for global admin/superadmin roles)
  isAdmin: boolean;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Prevent concurrent executions that trigger repeated API calls (which may hit backend rate limits)
let authCheckInProgress = false;
let signInInProgress = false;

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Guard: instead of throwing (which crashes the whole React tree),
    // return a safe fallback so the app can continue running while we
    // diagnose why the AuthProvider is not present. This should be
    // reverted once the root cause is fixed.
    // eslint-disable-next-line no-console
    console.error('useAuth called but no AuthProvider found in the tree');
    return {
      user: null,
      loading: false,
      error: null,
      signIn: async () => ({ success: false, error: 'Auth unavailable' }),
      signUp: async () => ({ success: false, error: 'Auth unavailable' }),
      signOut: async () => {},
      signInWithToken: async () => ({ success: false, error: 'Auth unavailable' }),
      refreshProfile: async () => null,
      isAuthenticated: false,
      hasPermission: () => false,
      hasAny: () => false,
      isAdmin: false,
    } as AuthContextType;
  }
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem('userPermissions');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try { return localStorage.getItem('userIsAdmin') === 'true'; } catch { return false; }
  });
  const [tenantAdmin, setTenantAdmin] = useState<boolean>(() => {
    try { return localStorage.getItem('userTenantAdmin') === 'true'; } catch { return false; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Restore tenantId for services. Diagnostics are dev-only and never dump tokens.
    try {
      if (import.meta.env.DEV) {
        console.debug('[AuthProvider] localStorage userPermissions=', localStorage.getItem('userPermissions'));
        console.debug('[AuthProvider] localStorage userIsAdmin=', localStorage.getItem('userIsAdmin'));
        console.debug('[AuthProvider] localStorage tenantId=', localStorage.getItem('tenantId'));
      }
      const t = localStorage.getItem('tenantId');
      if (t) {
        try { setClientServiceTenantId(t); } catch {}
      }
    } catch (e) {}

    checkAuth();
  }, []);

  // Cross-tab account sync. authToken/tenantId are single shared localStorage
  // keys, so signing into ANOTHER account (e.g. a second company) in a second
  // tab silently swaps this tab's credentials: its UI keeps the old tenant but
  // requests carry the new account's token → the backend's tenant-membership
  // guard 403s everything until the tab is refreshed (Seguridad B.A.S. /
  // Ecuaseguridad tickets, 2026-07-09). Reload so the tab adopts the new
  // session instead of dying in a 403 loop.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'authToken' && e.key !== 'tenantId') return;
      if (e.oldValue === e.newValue) return;
      try { window.location.reload(); } catch {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Expose a debug handle for quick inspection in the browser console.
  // SECURITY: never put the raw bearer token (or anything else sensitive) on this
  // global — any third-party script / XSS payload can read it with one property
  // access. Services that need the tenant id use the setTenantId singletons.
  // Gated to dev builds only.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    try {
      (window as any).__APP_AUTH = {
        user,
        permissions,
        isAdmin,
        tenantAdmin,
        loading,
        tenantId: localStorage.getItem('tenantId'),
      };
    } catch (e) {}
  }, [user, permissions, isAdmin, tenantAdmin, loading]);

  // Persist permissions and admin flags whenever they change — but NOT while
  // logged out. signOut removes authToken first, so the state resets it fires
  // here must not re-write (resurrect) the perm/admin keys it just deleted.
  useEffect(() => {
    try {
      if (!localStorage.getItem('authToken')) return; // logged out → don't resurrect
      localStorage.setItem('userPermissions', JSON.stringify(permissions || []));
      localStorage.setItem('userIsAdmin', isAdmin ? 'true' : 'false');
      localStorage.setItem('userTenantAdmin', tenantAdmin ? 'true' : 'false');
    } catch (e) {}
  }, [permissions, isAdmin, tenantAdmin]);

  // Persist tenantId derived from user when user changes, and restore into clientService
  useEffect(() => {
    try {
      const tenantId = (user && Array.isArray(user.tenants) && user.tenants.length > 0)
        ? (user.tenants[0].tenantId || (user.tenants[0].tenant && user.tenants[0].tenant.id))
        : null;
      if (tenantId) {
        try { localStorage.setItem('tenantId', tenantId); } catch {}
        try { setClientServiceTenantId(tenantId); } catch {}
      }
    } catch (e) {}
  }, [user]);

  const checkAuth = async () => {
    const token = localStorage.getItem("authToken");
    if (!token) { setLoading(false); return; }

    if (authCheckInProgress) return;
    authCheckInProgress = true;

    // restore cached permissions/tenant quickly to avoid UI flash
    try {
      const cached = localStorage.getItem('userPermissions');
      if (cached) {
        try { setPermissions(JSON.parse(cached)); } catch { setPermissions([]); }
      }
      const cachedAdmin = localStorage.getItem('userIsAdmin');
      if (cachedAdmin) setIsAdmin(cachedAdmin === 'true');
      const cachedTenant = localStorage.getItem('tenantId');
      if (cachedTenant) {
        try { /* nothing else needed here */ } catch {}
      }
    } catch {}

    // Sync token with axios client instance
    try { setAuthToken(token); } catch {}

    try {
      // /auth/me can fail transiently (rate-limit 429, infra 5xx). Retry with
      // backoff instead of settling at "no user" — that would bounce a valid
      // session to /login and read as a random logout.
      let userData: any;
      for (let attempt = 1; ; attempt++) {
        try {
          userData = await AuthService.getProfile();
          break;
        } catch (err: any) {
          const status = err?.status;
          const transient = status === 429 || status === 502 || status === 503 || status === 504;
          if (!transient || attempt >= 3) throw err;
          await new Promise((r) => setTimeout(r, attempt * 8000));
        }
      }

      // If the user is a global superadmin, ensure they are not tenant-scoped:
      const isGlobalSuperadmin = (u: any) => {
        if (!u) return false;
        // The backend marks platform superadmins with the `isSuperadmin` boolean
        // (there is no global `superadmin` role row). Honor it as the source of truth.
        if (u.isSuperadmin === true) return true;
        const roles = u.roles ?? u.role ?? [];
        const normalize = (r: any) => {
          if (!r) return [];
          if (Array.isArray(r)) return r.map((it) => (typeof it === 'string' ? it : (it?.name || it?.key || it?.slug || ''))).filter(Boolean);
          if (typeof r === 'string') return [r];
          return [];
        };
        const names = normalize(roles);
        // Also check tenant-scoped roles: some deployments attach `superadmin` at tenantUser
        // level when there's no separate global role. Treat any `superadmin` occurrence
        // as global to ensure the UI behaves correctly for platform superadmins.
        const tenantRoles: string[] = Array.isArray(u.tenants)
          ? u.tenants.flatMap((t: any) => normalize(t.roles ?? t.role ?? []))
          : [];
        const allNames = [...names, ...tenantRoles].map((n) => (n || '').toString().toLowerCase());
        return allNames.includes('superadmin') || allNames.includes('super_admin');
      };

      if (isGlobalSuperadmin(userData)) {
        try { localStorage.removeItem('tenantId'); } catch (e) {}
        try { clearClientServiceTenantId(); } catch (e) {}
        // Avoid exposing tenant associations in the client for superadmin users
        if (Array.isArray(userData.tenants)) userData.tenants = [];
      }

      purgeOfflineDataIfDifferentUser(userData?.id);
      setUser(userData);
      // Copia local del perfil para la SESIÓN OFFLINE: si el próximo arranque
      // no alcanza al servidor (internet de la oficina caído), la app abre con
      // esta identidad en modo lectura en vez de rebotar al login. Se borra en
      // el cierre de sesión. El backend sigue autorizando cada petición real.
      try { localStorage.setItem("authUserCache", JSON.stringify({ at: Date.now(), user: userData })); } catch {}
      // normalize permissions and admin flag
      const { perms, admin, tenantAdmin } = extractPermissionsFromUser(userData);
      // /auth/me is the source of truth: ALWAYS reconcile (including clearing)
      // permissions and the admin flags from the server. Cached localStorage
      // values are only a render-flash optimization and must never be allowed to
      // keep admin/permissions elevated once the server has answered. (The backend
      // still independently authorizes every request regardless of client state.)
      setPermissions(perms);
      if (import.meta.env.DEV) {
        try { console.debug('[AuthContext] extracted permissions for tenant:', perms); } catch (e) {}
      }
      try { localStorage.setItem('userPermissions', JSON.stringify(perms)); } catch {}

      setTenantAdmin(tenantAdmin);
      setIsAdmin(admin);
      try { localStorage.setItem('userIsAdmin', admin ? 'true' : 'false'); } catch {}
      try { localStorage.setItem('userTenantAdmin', tenantAdmin ? 'true' : 'false'); } catch {}
    } catch (e: any) {
      if (e instanceof ApiError) {
        console.warn("getProfile falló:", e.status, e.message);
        // Solo eliminamos token si estamos seguros que no sirve (401/invalid)
        if (e.status === 401) {
          localStorage.removeItem("authToken");
          setUser(null);
        }
        // 403 suele ser CORS, política o permisos. NO borres token aquí.
      } else {
        console.warn("getProfile error no tipado:", e?.message || e);
      }
      // ── Sesión offline ────────────────────────────────────────────────────
      // El fallo fue de RED (no un 401): hay token válido pero no hay servidor.
      // Antes esto dejaba `user` en null → rebote al login con la oficina sin
      // internet. Ahora se abre con el último perfil conocido (≤24 h): la
      // navegación funciona, las listas salen del caché persistido, y las
      // escrituras seguras se encolan. En cuanto vuelve la red, /auth/me
      // reconcilia y manda la verdad del servidor.
      try {
        const is401 = e instanceof ApiError && e.status === 401;
        if (!is401 && isNetworkFailure(e)) {
          const raw = localStorage.getItem("authUserCache");
          const cached = raw ? JSON.parse(raw) : null;
          const fresh = cached && Date.now() - (cached.at || 0) < 24 * 60 * 60 * 1000;
          if (fresh && cached.user) {
            console.warn("[offline] sin servidor — sesión restaurada del caché local");
            setUser(cached.user);
            const { perms, admin, tenantAdmin } = extractPermissionsFromUser(cached.user);
            setPermissions(perms);
            setIsAdmin(admin);
            setTenantAdmin(tenantAdmin);
          }
        }
      } catch { /* sin caché utilizable — se queda el comportamiento previo */ }
    } finally {
      setLoading(false);
      authCheckInProgress = false;
    }
  };

  const signIn = async (credentials: LoginCredentials) => {
    if (signInInProgress) {
      return { success: false, error: 'Login already in progress' };
    }
    signInInProgress = true;
    try {
      setError(null);
      const response = await AuthService.signIn(credentials);
      if (response?.token) {
        localStorage.setItem("authToken", response.token);
        try { setAuthToken(response.token); } catch {}
        let u = response.user || { email: credentials.email };
        // If the returned user is incomplete (no tenants/roles/permissions),
        // try to fetch the full profile now so UI permissions are hydrated
        // immediately after login (avoids needing a manual page refresh).
        const looksIncomplete = !(Array.isArray(u.tenants) && u.tenants.length > 0) && !(u.permissions || u.perms || u.role || u.roles);
        if (looksIncomplete) {
          try {
            const prof = await AuthService.getProfile();
            if (prof) u = prof;
          } catch (e) {
            // ignore - we'll continue with what we have
          }
        }

        // Ensure tenantId is persisted and client services configured BEFORE
        // extracting tenant-scoped permissions (extractPermissionsFromUser
        // reads localStorage.tenantId to pick tenantEntry).
        // If user is superadmin, do not persist tenantId or tenant associations
        const isGlobalSuperadminLocal = (u: any) => {
          if (u && u.isSuperadmin === true) return true;
          const roles = u.roles ?? u.role ?? [];
          const normalize = (r: any) => {
            if (!r) return [];
            if (Array.isArray(r)) return r.map((it) => (typeof it === 'string' ? it : (it?.name || it?.key || it?.slug || ''))).filter(Boolean);
            if (typeof r === 'string') return [r];
            return [];
          };
          const globalNames = normalize(roles);
          const tenantNames = Array.isArray(u.tenants)
            ? u.tenants.flatMap((t: any) => normalize(t.roles ?? t.role ?? []))
            : [];
          const all = [...globalNames, ...tenantNames].map((n) => (n || '').toString().toLowerCase());
          return all.some((n) => n.includes('superadmin'));
        };
        if (!isGlobalSuperadminLocal(u)) {
          try {
            const tenantId = (u.tenants && u.tenants[0] && (u.tenants[0].tenantId || (u.tenants[0].tenant && u.tenants[0].tenant.id))) || null;
            if (tenantId) {
              localStorage.setItem('tenantId', tenantId);
              try { setClientServiceTenantId(String(tenantId)); } catch {}
              try { setCategoryTenantId(String(tenantId)); } catch {}
            }
          } catch (e) {}
        } else {
          try { localStorage.removeItem('tenantId'); } catch (e) {}
          try { clearClientServiceTenantId(); } catch (e) {}
          if (Array.isArray(u.tenants)) u.tenants = [];
        }

        setUser(u);
        const { perms, admin, tenantAdmin } = extractPermissionsFromUser(u);
        setPermissions(perms);
        setTenantAdmin(tenantAdmin);
        try { localStorage.setItem('userPermissions', JSON.stringify(perms)); localStorage.setItem('userIsAdmin', admin ? 'true' : 'false'); } catch {}
        // store tenantId quickly if available and configure services immediately
        try {
          const tenantId = (u.tenants && u.tenants[0] && (u.tenants[0].tenantId || (u.tenants[0].tenant && u.tenants[0].tenant.id))) || null;
          if (tenantId) {
            localStorage.setItem('tenantId', tenantId);
            try { setClientServiceTenantId(String(tenantId)); } catch {}
            try { setCategoryTenantId(String(tenantId)); } catch {}
          }
        } catch {}
        if (import.meta.env.DEV) { try { console.debug('[AuthContext] permissions after signIn:', perms); } catch (e) {} }
        setIsAdmin(admin);
        return { success: true };
      }
      throw new Error("No se recibió token de autenticación");
    } catch (err: any) {
      const message = err?.message || "Error al iniciar sesión";
      // Surface rate-limit errors more clearly
      if (err && err.status === 429) {
        const m = 'Demasiadas solicitudes. Intenta de nuevo en unos segundos.';
        setError(m);
        return { success: false, error: m };
      }
      if (message === "auth.emailNotVerified") {
        return { success: false, error: "Tu correo no está verificado. Te enviamos un correo de verificación.", needVerification: true };
      }
      setError(message);
      return { success: false, error: message };
    } finally {
      signInInProgress = false;
    }
  };

  const signUp = async (data: SignUpData) => {
    try { setError(null); await AuthService.signUp(data); return { success: true }; }
    catch (err: any) { const m = err.message || "Error al registrarse"; setError(m); return { success: false, error: m }; }
  };

  const signOut = async () => {
    try { await AuthService.signOut(); } catch {} finally {
      // Remove the token FIRST so the persist effect (guarded on authToken) can't
      // resurrect the perm/admin keys when the state resets below re-fire it.
      localStorage.removeItem("authToken");
      try {
        localStorage.removeItem('userPermissions'); localStorage.removeItem('userIsAdmin');
        localStorage.removeItem('userTenantAdmin'); localStorage.removeItem('tenantId');
        localStorage.removeItem('tenantLogoUrl'); localStorage.removeItem('tenantName');
      } catch {}
      try { clearAuthToken(); } catch {}
      // Clear the tenant id cached inside the service singletons (localStorage
      // alone isn't their source of truth once loaded).
      try { clearClientServiceTenantId(); setCategoryTenantId(''); setStationServiceTenantId(''); } catch {}
      // Flush the react-query cache so the NEXT login (an SPA nav, no page
      // reload) can't be served the previous session's cached lists.
      try { queryClient.clear(); } catch {}
      // Modo offline: en una máquina compartida, el siguiente usuario no puede
      // heredar ni los datos persistidos en IndexedDB, ni el perfil cacheado,
      // ni una cola de escrituras ajena.
      try { localStorage.removeItem("authUserCache"); } catch {}
      try { clearQueue(); } catch {}
      try { void clearPersistedCache(); } catch {}
      // El contador del icono es de la sesión que se va.
      try { setAppBadge(0); } catch {}
      // Reset ALL in-memory auth state — previously permissions/isAdmin lingered.
      setUser(null);
      setPermissions([]);
      setIsAdmin(false);
      setTenantAdmin(false);
      setError(null);
    }
  };

  const signInWithToken = async (token: string, userData?: any) => {
    try {
      localStorage.setItem("authToken", token);
      try { setAuthToken(token); } catch {}
      if (userData) {
        let u = userData;
        const looksIncomplete = !(Array.isArray(u.tenants) && u.tenants.length > 0) && !(u.permissions || u.perms || u.role || u.roles);
        if (looksIncomplete) {
          try {
            const prof = await AuthService.getProfile();
            if (prof) u = prof;
          } catch (e) {}
        }

        // Persist tenantId and configure services before extracting permissions
        try {
          const isGlobalSuper = (u: any) => {
            if (u && u.isSuperadmin === true) return true;
            const roles = u.roles ?? u.role ?? [];
            const arr = Array.isArray(roles) ? roles : [roles];
            return arr.some((r: any) => (typeof r === 'string' ? r : (r?.name || r?.key || '')).toString().toLowerCase().includes('superadmin'));
          };
          if (!isGlobalSuper(u)) {
            const tenantId = (u.tenants && u.tenants[0] && (u.tenants[0].tenantId || (u.tenants[0].tenant && u.tenants[0].tenant.id))) || null;
            if (tenantId) {
              localStorage.setItem('tenantId', tenantId);
              try { setClientServiceTenantId(String(tenantId)); } catch {}
              try { setCategoryTenantId(String(tenantId)); } catch {}
            }
          } else {
            try { localStorage.removeItem('tenantId'); } catch (e) {}
            try { clearClientServiceTenantId(); } catch (e) {}
            if (Array.isArray(u.tenants)) u.tenants = [];
          }
        } catch (e) {}

        setUser(u);
        const { perms, admin, tenantAdmin } = extractPermissionsFromUser(u);
        if (Array.isArray(perms) && perms.length > 0) {
          setPermissions(perms);
          try { localStorage.setItem('userPermissions', JSON.stringify(perms)); } catch {}
        }
        setTenantAdmin(tenantAdmin);
        if (admin) {
          setIsAdmin(admin);
          try { localStorage.setItem('userIsAdmin', admin ? 'true' : 'false'); } catch {}
        }
      } else {
        // intenta hidratar profile desde el backend
        try {
          const u = await AuthService.getProfile();
          setUser(u);
          const { perms, admin, tenantAdmin } = extractPermissionsFromUser(u);
          if (Array.isArray(perms) && perms.length > 0) {
            setPermissions(perms);
            try { localStorage.setItem('userPermissions', JSON.stringify(perms)); } catch {}
          }
          setTenantAdmin(tenantAdmin);
          if (admin) {
            setIsAdmin(admin);
            try { localStorage.setItem('userIsAdmin', admin ? 'true' : 'false'); } catch {}
          }
        } catch (e) {
          // ignore
        }
      }
      return { success: true };
    } catch (err: any) {
      const message = err?.message || "Error al iniciar sesión con token";
      setError(message);
      return { success: false, error: message };
    }
  };

  // Re-fetch the profile from the backend and re-hydrate auth state.
  // Used by flows that mutate the tenant (e.g. onboarding wizard) so the
  // freshly-saved fields (logoId, onboardingCompleted, billing...) appear
  // immediately without a manual reload. Best-effort retry to absorb
  // backend propagation latency on freshly created tenants.
  const refreshProfile = async (): Promise<User | null> => {
    const maxAttempts = 4;
    const delayMs = 400;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const profile = await AuthService.getProfile();
        if (profile) {
          setUser(profile);
          const { perms, admin, tenantAdmin } = extractPermissionsFromUser(profile);
          if (Array.isArray(perms) && perms.length > 0) {
            setPermissions(perms);
            try { localStorage.setItem('userPermissions', JSON.stringify(perms)); } catch {}
          }
          setTenantAdmin(tenantAdmin);
          if (admin) {
            setIsAdmin(admin);
            try { localStorage.setItem('userIsAdmin', admin ? 'true' : 'false'); } catch {}
          }
          return profile;
        }
      } catch (e) {
        // retry
      }
      if (attempt < maxAttempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
  };

  function matchesByAlias(requested: string): boolean {
    if (!requested) return false;
    // direct match (preferred)
    if (permissions.includes(requested)) return true;

    // Alias match: only bridge well-known resource-name variants for the SAME
    // action (e.g. `clientAccountEdit` vs `clientEdit`). We deliberately avoid the
    // previous loose `includes()` substring test, which could let a narrow perm
    // satisfy a broader check (over-grant in the UI).
    const m = requested.match(/^(.*?)(Import|Create|Edit|Destroy|Read|Autocomplete|Export|Restore|Archive)$/i);
    if (m) {
      const reqResource = m[1].toLowerCase();
      const actionNorm = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
      const found = permissions.find((p) => {
        const pm = p.match(/^(.*?)(Import|Create|Edit|Destroy|Read|Autocomplete|Export|Restore|Archive)$/i);
        if (!pm) return false;
        // Same action required.
        if (pm[2].toLowerCase() !== actionNorm.toLowerCase()) return false;
        const permResource = pm[1].toLowerCase();
        // Resources must be aliases of one another: equal, or one is a
        // prefix of the other at a name boundary (clientAccount <-> client).
        return (
          permResource === reqResource ||
          permResource.startsWith(reqResource) ||
          reqResource.startsWith(permResource)
        );
      });
      if (found) return true;
    }
    return false;
  }

  const hasPermission = (perm: string) => {
    if (isAdmin) return true;
    if (tenantAdmin) return true;
    if (!permissions || permissions.length === 0) return false;
    const ok = matchesByAlias(perm);
    // Debug: only log client-related permission checks to avoid noisy logs (dev only)
    if (import.meta.env.DEV) {
      try {
        if (perm && perm.toLowerCase().includes('client')) {
          console.debug('[AuthContext] hasPermission check', { perm, isAdmin, permissions, result: ok });
        }
      } catch (e) {}
    }
    return ok;
  };

  const hasAny = (perms: string[]) => {
    if (isAdmin || tenantAdmin) return true;
    if (!perms || perms.length === 0) return false;
    return perms.some((p) => hasPermission(p));
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, signIn, signUp, signOut, signInWithToken, refreshProfile, isAuthenticated: !!user, hasPermission, hasAny, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

function extractPermissionsFromUser(u: any): { perms: string[]; admin: boolean; tenantAdmin: boolean } {
  if (!u) return { perms: [], admin: false, tenantAdmin: false };
  // If user has a tenants array, prefer tenant-scoped permissions for current tenant
  const tenantId = localStorage.getItem('tenantId');
  let tenantEntry: any = null;
  if (Array.isArray(u.tenants) && u.tenants.length > 0) {
    if (tenantId) {
      tenantEntry = u.tenants.find((t: any) => (t.tenantId === tenantId) || (t.tenant && (t.tenant.id === tenantId || t.tenant.tenantId === tenantId)));
    }
    if (!tenantEntry) tenantEntry = u.tenants[0];
  }

  if (!tenantEntry && u.tenant) {
    const tenant = u.tenant;
    if (tenant.tenantId || (tenant.tenant && (tenant.tenant.id || tenant.tenant.tenantId))) {
      tenantEntry = tenant;
    }
  }

  // candidate permission sources
  const p = (
    (tenantEntry && (tenantEntry.permissions ?? tenantEntry.perms)) ||
    (u.tenant && (u.tenant.permissions ?? u.tenant.perms)) ||
    u.permissions ||
    u.perms ||
    u.role?.permissions ||
    u.roles?.permissions
  );

  // Separate tenant-scoped roles from global roles so tenant `admin` doesn't become global admin
  // Also consider `u.tenant` (single-tenant shape) which may contain roles even when the
  // tenant object has no tenantId set (common for global accounts attached to a placeholder).
  const tenantRolesRaw = (
    (tenantEntry && ((tenantEntry.roles && tenantEntry.roles) || (tenantEntry.role ? [tenantEntry.role] : []))) ||
    (u.tenant && ((u.tenant.roles && u.tenant.roles) || (u.tenant.role ? [u.tenant.role] : []))) ||
    []
  );
  const globalRolesRaw = u.roles ?? u.role ?? [];

  const normalizeRoles = (rolesInput: any) => {
    if (!rolesInput) return [] as string[];
    if (Array.isArray(rolesInput)) {
      return rolesInput.map((r: any) => {
        if (!r) return '';
        if (typeof r === 'string') return r;
        return r.name || r.key || r.slug || r.id || '';
      }).filter(Boolean);
    }
    if (typeof rolesInput === 'string') return [rolesInput];
    return [] as string[];
  };

  const roleNamesTenant = normalizeRoles(tenantRolesRaw);
  const roleNamesGlobal = normalizeRoles(globalRolesRaw);

  // Only global roles should normally grant isAdmin. However, treat `superadmin`
  // specially: if it appears anywhere (global or tenant-scoped), promote to admin
  // so platform-level superadmins see all tenants and do not get tenant-only UX.
  const admin =
    u.isSuperadmin === true ||
    roleNamesGlobal.includes('admin') ||
    roleNamesGlobal.includes('superadmin') ||
    roleNamesGlobal.includes('super_admin') ||
    roleNamesTenant.includes('superadmin') ||
    roleNamesTenant.includes('super_admin');
  const tenantAdmin = roleNamesTenant.includes('admin') || roleNamesTenant.includes('superadmin') || roleNamesTenant.includes('super_admin');

  // Normalize permissions: handle arrays of strings, arrays of objects, or comma-separated strings
  let perms: string[] = [];
  if (!p) perms = [];
  else if (Array.isArray(p)) {
    perms = p.map((item: any) => {
      if (!item) return '';
      if (typeof item === 'string') return item;
      // item might be an object like { permission: 'clientAccountRead' } or { name: '...' }
      return item.permission || item.name || item.key || '';
    }).filter(Boolean);
  } else if (typeof p === 'string') {
    try {
      const parsed = JSON.parse(p);
      if (Array.isArray(parsed)) perms = parsed.map((it: any) => (typeof it === 'string' ? it : (it?.permission || it?.name || it?.key || ''))).filter(Boolean);
      else perms = p.split(/\s*,\s*/).filter(Boolean);
    } catch {
      perms = p.split(/\s*,\s*/).filter(Boolean);
    }
  } else if (typeof p === 'object') {
    // e.g. { read: true, write: true } — not typical, but try to extract keys
    perms = Object.keys(p).filter(Boolean);
  }

  return { perms, admin, tenantAdmin };
}
