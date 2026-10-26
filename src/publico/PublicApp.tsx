/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA MINI-APLICACIÓN PÚBLICA (`/p/`).
 *
 * Lo ÚNICO que el servidor entrega a quien no ha iniciado sesión (ver
 * `lib/sesionDeCodigo.ts`). Tiene sólo las pantallas que de verdad son
 * públicas —las mismas rutas y los mismos componentes que `App.tsx`— y nada
 * del panel: si importas aquí una página de `pages/admin/…`, su código vuelve
 * a quedar a la vista de cualquiera. `scripts/publico-index.mjs` falla el
 * build si eso pasa.
 *
 * Todo lo demás cae en `CualquierOtraRuta`: al acceso si no hay sesión, y con
 * sesión al traspaso, que pide la cookie y recarga en el CRM de verdad.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import { CualquierOtraRuta } from "./Traspaso";

import "@/i18n";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import { PublicOnlyRoute } from "@/components/ProtectedRoute";
import { AccentProvider } from "@/contexts/AccentContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { IdentidadEfectivaProvider } from "@/contexts/IdentidadEfectiva";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { queryClient } from "@/lib/queryClient";
import Login from "@/pages/auth/login";
import LoginRouteResolver from "@/pages/auth/LoginRouteResolver";

const ForgotPassword = lazy(() => import("@/pages/auth/forgot-password"));
const ResetPassword = lazy(() => import("@/pages/auth/reset-password"));
const AccesoSoporte = lazy(() => import("@/pages/auth/AccesoSoporte"));
const AccesoBloqueado = lazy(() => import("@/pages/auth/AccesoBloqueado"));
const Register = lazy(() => import("@/pages/auth/register"));
const VerifyEmail = lazy(() => import("@/pages/auth/verify-email"));
const AcceptInvitation = lazy(() => import("@/pages/auth/accept-invitation"));
const GuardRegistration = lazy(() => import("@/pages/guard/registration"));
const ClientRegistration = lazy(() => import("@/pages/client/registration"));
const SupervisorRegistration = lazy(
  () => import("@/pages/supervisor/registration"),
);
const VideoSharedClip = lazy(
  () => import("@/pages/admin/video/VideoSharedClip"),
);
const DispatchPublicView = lazy(
  () => import("@/pages/public/DispatchPublicView"),
);
const DocumentPacketPublicView = lazy(
  () => import("@/pages/public/DocumentPacketPublicView"),
);

function Cargando() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#F8F7F4] dark:bg-[#0A0A0A]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
    </div>
  );
}

export default function PublicApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AccentProvider>
          <LanguageProvider>
            <AuthProvider>
              <IdentidadEfectivaProvider>
                <BrowserRouter>
                  <Suspense fallback={<Cargando />}>
                    <AppErrorBoundary scope="routes">
                      <Routes>
                        <Route
                          element={<VideoSharedClip />}
                          path="/video/shared/:token"
                        />
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
                        <Route element={<LoginRouteResolver />} path="/login" />
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
                          element={<AccesoSoporte />}
                          path="/acceso-soporte"
                        />
                        <Route
                          element={<AccesoBloqueado />}
                          path="/acceso-bloqueado"
                        />
                        <Route
                          element={<ResetPassword />}
                          path="/auth/password-reset"
                        />
                        <Route
                          element={<DispatchPublicView />}
                          path="/public/dispatch/:token"
                        />
                        <Route
                          element={<DocumentPacketPublicView />}
                          path="/d/:token"
                        />
                        <Route element={<CualquierOtraRuta />} path="*" />
                      </Routes>
                    </AppErrorBoundary>
                  </Suspense>
                </BrowserRouter>
              </IdentidadEfectivaProvider>
            </AuthProvider>
          </LanguageProvider>
        </AccentProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
