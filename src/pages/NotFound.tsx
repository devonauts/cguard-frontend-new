import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Compass, LayoutDashboard, LogIn } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/layouts/app-layout";
import { FadeIn, IconTile, PageContainer } from "@/components/kit";

/**
 * The CRM's 404 (2026-10-16, Mike: «esa página 404 debe estar al estilo de
 * nuestro CRM»). It used to be a hand-made page with fixed green colors and a
 * full-page reload link — nothing of the CRM's look or brand.
 *
 * Signed in, it renders INSIDE the app shell (menu and header stay, so the
 * person is never stranded); signed out, on the CRM canvas (`app-shell`) with
 * a way to the login. The card itself is `NotFoundCard`, shared by both.
 */
/** The CRM's pill button recipe (same as the rest of the app). */
const BTN =
  "cg-focus inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all";

export function NotFoundCard({
  signedIn,
  path,
  canGoBack,
  onBack,
}: {
  signedIn: boolean;
  path: string;
  canGoBack: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();

  return (
    <FadeIn className="mx-auto w-full max-w-md">
      <div className="glass p-8 text-center">
        <div className="mx-auto mb-6 w-fit">
          <IconTile size="lg">
            <Compass />
          </IconTile>
        </div>

        <div
          className="cg-eyebrow text-xs font-semibold uppercase"
          style={{ color: "var(--brand-text)" }}
        >
          {t("notFound.eyebrow", "Error 404")}
        </div>
        <h1 className="mt-2 font-display text-xl font-bold tracking-tight">
          {t("notFound.title", "No encontramos esta página")}
        </h1>
        <p
          className="mt-3 text-sm leading-relaxed"
          style={{ color: "var(--ink-soft)" }}
        >
          {t(
            "notFound.body",
            "La dirección puede estar mal escrita, o la página se movió o ya no existe.",
          )}
        </p>

        {path && path !== "/" && (
          <code
            className="mt-4 block truncate rounded-xl border px-3 py-2 text-xs"
            style={{
              borderColor: "var(--hairline)",
              background: "var(--glass-sunken)",
              color: "var(--ink-soft)",
            }}
            title={path}
          >
            {path}
          </code>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          {canGoBack && (
            <button
              className={`cg-btn-glass ${BTN}`}
              type="button"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
              {t("notFound.back", "Volver")}
            </button>
          )}
          {signedIn ? (
            <Link className={`cg-btn-brand ${BTN}`} to="/dashboard">
              <LayoutDashboard className="h-4 w-4" />
              {t("notFound.goDashboard", "Ir al panel")}
            </Link>
          ) : (
            <Link className={`cg-btn-brand ${BTN}`} to="/login">
              <LogIn className="h-4 w-4" />
              {t("notFound.goLogin", "Iniciar sesión")}
            </Link>
          )}
        </div>
      </div>
    </FadeIn>
  );
}

export default function NotFound() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  // The `*` route lives inside AuthProvider, so the hook is always available.
  const signedIn = !!useAuth()?.isAuthenticated;
  const canGoBack = typeof window !== "undefined" && window.history.length > 1;
  const card = (
    <NotFoundCard
      canGoBack={canGoBack}
      path={`${pathname}${search}`}
      signedIn={signedIn}
      onBack={() => navigate(-1)}
    />
  );

  if (signedIn) {
    return (
      <AppLayout>
        <PageContainer width="narrow">
          <div className="flex min-h-[60vh] items-center justify-center py-10">
            {card}
          </div>
        </PageContainer>
      </AppLayout>
    );
  }

  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-4 py-10">
      {card}
    </div>
  );
}
