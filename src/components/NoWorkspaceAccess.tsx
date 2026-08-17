import { useAuth } from "@/contexts/AuthContext"

/**
 * Full-screen, non-dismissible modal shown when a user is authenticated but has
 * NO tenant membership (no workspace). Previously this state white-screened the
 * app: the dashboard's tenant-scoped services call getTenantId(), which throws
 * «No pudimos identificar tu empresa» when localStorage.tenantId is empty, crashing the
 * React tree. Now we intercept the state in ProtectedRoute and render this modal
 * BEFORE any tenant-scoped page mounts, so the user gets a clear message and a
 * way out (sign out) instead of a blank screen.
 *
 * Platform superadmins are handled separately (routed to /superadmin/tenants) —
 * this screen is for end users whose account was not attached to any workspace.
 */
export default function NoWorkspaceAccess() {
  const { user, signOut } = useAuth()
  const email = user?.email || ""

  return (
    // El lienzo del sistema (`.app-shell`) trae sus halos de acento detrás, que
    // es justamente lo que el cristal del diálogo tiene que desenfocar. Sin algo
    // detrás, el desenfoque no se nota y el panel parece un rectángulo gris.
    //
    // `position` va en línea a propósito: `.app-shell` fija `position: relative`
    // y glass.css va sin `@layer`, así que gana a la utilidad `fixed` de Tailwind
    // y el gate caería en el flujo del documento en vez de cubrir la pantalla.
    <div
      className="app-shell fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ position: "fixed" }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="no-workspace-title"
        className="glass-raised w-full max-w-md p-7"
      >
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border"
          style={{ background: "var(--brand-wash)", borderColor: "var(--brand-line)", color: "var(--brand-text)" }}
        >
          <svg
            className="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          </svg>
        </div>

        <h2
          id="no-workspace-title"
          className="font-display text-center text-lg font-semibold"
          style={{ color: "var(--ink)" }}
        >
          Sin acceso a un espacio de trabajo
        </h2>

        <p className="mt-3 text-center text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          Tu cuenta no está asociada a ninguna empresa. Pídele a un administrador
          que te asigne a un espacio de trabajo para poder ingresar.
        </p>

        {email && (
          <p className="mt-2 text-center text-xs" style={{ color: "var(--ink-faint)" }}>
            Sesión iniciada como <span className="font-medium">{email}</span>
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => signOut()}
            className="cg-btn-brand cg-focus w-full rounded-full px-4 py-2.5 text-sm font-semibold transition-[filter] hover:brightness-110"
          >
            Cerrar sesión
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="cg-btn-glass cg-focus w-full rounded-full px-4 py-2.5 text-sm font-medium"
          >
            Reintentar
          </button>
        </div>
      </div>
    </div>
  )
}
