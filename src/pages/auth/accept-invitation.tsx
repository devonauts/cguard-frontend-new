import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Eye, EyeOff, Building2, Check, X, Loader2, ArrowRight, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ApiService } from "@/services/api/apiService";
import { AuthService } from "@/services/auth/authService";
import { useAuth } from "@/contexts/AuthContext";
import { IconTile } from "@/components/kit";
import AuthShell, { CAMPO, BOTON_PRINCIPAL, AvisoError, Etiqueta } from "./AuthShell";

/**
 * AcceptInvitation — onboarding for INTERNAL administrative users (admins,
 * supervisors, dispatchers, office staff). Unlike clients (who use the Mi
 * Seguridad app), these users work in THIS CRM, so after setting their password
 * we sign them straight into the panel. Clean, modern split-panel UI.
 */

const RULES = [
  { id: "len", label: "Al menos 8 caracteres", test: (p: string) => p.length >= 8 },
  { id: "upper", label: "Una letra mayúscula", test: (p: string) => /[A-Z]/.test(p) },
  { id: "lower", label: "Una letra minúscula", test: (p: string) => /[a-z]/.test(p) },
  { id: "num", label: "Un número", test: (p: string) => /[0-9]/.test(p) },
  { id: "special", label: "Un carácter especial", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  operationsmanager: "Gerente de Operaciones",
  securitysupervisor: "Supervisor de Seguridad",
  supervisor: "Supervisor",
  hrmanager: "Gerente de RR.HH.",
  dispatcher: "Despachador",
  clientaccountmanager: "Gerente de Cuentas",
  administrativesupervisor: "Supervisor Administrativo",
  administrativeassistant: "Asistente Administrativo",
  secretary: "Secretaría",
};

function roleLabel(roles?: any): string | null {
  const arr: string[] = Array.isArray(roles) ? roles : roles ? [roles] : [];
  for (const r of arr) {
    const key = String(r || "").toLowerCase();
    if (ROLE_LABELS[key]) return ROLE_LABELS[key];
  }
  return arr.length ? "Usuario administrativo" : null;
}

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { signIn } = useAuth();

  const rawToken = searchParams.get("token") || searchParams.get("invitationToken") || searchParams.get("invite") || undefined;
  const inviteToken = rawToken && rawToken !== "null" && rawToken !== "undefined" ? rawToken : undefined;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [lockedEmail, setLockedEmail] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [fetched, setFetched] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<"form" | "signing-in">("form");
  const [inviteNotFound, setInviteNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    document.title = "Activa tu cuenta | CGuard Pro";
    const run = async () => {
      if (!inviteToken) { setInviteNotFound(true); setLoading(false); return; }
      // Clear any stale session so the invite flow starts clean.
      try { localStorage.removeItem("authToken"); localStorage.removeItem("user"); } catch { /* ignore */ }
      try {
        const res = await ApiService.get(`/user/public?token=${encodeURIComponent(inviteToken)}`, { skipAuth: true });
        const data = res?.data || res;
        if (!mounted.current) return;
        if (!data) { setInviteNotFound(true); return; }
        setFetched(data);
        const n = data.fullName || data.name || (data.firstName ? `${data.firstName} ${data.lastName || ""}`.trim() : "");
        if (n) setName(n);
        if (data.email) { setEmail(data.email); setLockedEmail(true); }
      } catch {
        if (mounted.current) setInviteNotFound(true);
      } finally {
        if (mounted.current) setLoading(false);
      }
    };
    run();
  }, [inviteToken]);

  const passedRules = useMemo(() => RULES.filter((r) => r.test(password)).length, [password]);
  const strength = (passedRules / RULES.length) * 100;
  const strengthLabel = passedRules <= 2 ? "Débil" : passedRules <= 4 ? "Buena" : "Excelente";
  /* Semántico, no decorativo: la fuerza de una contraseña se lee en rojo →
     ámbar → verde en cualquier producto, así que NO sigue el acento. */
  const strengthTone = passedRules <= 2 ? "bad" : passedRules <= 4 ? "warn" : "ok";

  const canSubmit = name.trim() && email.trim() && passedRules === RULES.length && password === confirm && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (passedRules !== RULES.length) { setError("La contraseña no cumple los requisitos."); return; }
    if (password !== confirm) { setError("Las contraseñas no coinciden."); return; }
    setSubmitting(true);
    try {
      await AuthService.signUp({ email, password, invitationToken: inviteToken, name } as any);
      // Internal users belong in THIS CRM — sign them straight into the panel.
      setPhase("signing-in");
      const result = await signIn({ email, password });
      if (result?.success) {
        toast.success("¡Cuenta activada! Bienvenido.");
        navigate("/dashboard", { replace: true });
      } else {
        // Account created but auto-login failed — send them to login.
        toast.success("Cuenta activada. Inicia sesión para continuar.");
        navigate("/login", { replace: true });
      }
    } catch (err: any) {
      if (!mounted.current) return;
      setPhase("form");
      setError(err?.message || "No se pudo activar la cuenta. Verifica el enlace e inténtalo de nuevo.");
      toast.error(err?.message || "Error al activar la cuenta");
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  };

  const tenantName = fetched?.tenant?.name as string | undefined;
  const tenantLogo = fetched?.tenant?.logoUrl as string | undefined;
  const role = roleLabel(fetched?.roles);

  // ── Estados cortos: cargando / invitación caducada ───────────────────────
  if (loading || phase === "signing-in") {
    return (
      <AuthShell
        splash={false}
        showFeatures={false}
        logoUrl={tenantLogo}
        brandName={tenantName}
        title={phase === "signing-in" ? "Accediendo al panel…" : "Preparando tu invitación"}
        subtitle={phase === "signing-in" ? "Un momento, estamos preparando tu cuenta." : "Estamos comprobando tu enlace de acceso."}
      >
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="h-9 w-9 animate-spin" style={{ color: 'var(--brand-text)' }} />
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Un momento…</p>
        </div>
      </AuthShell>
    );
  }

  if (inviteNotFound) {
    return (
      <AuthShell
        splash={false}
        showFeatures={false}
        eyebrow="Invitación"
        title={t("ui.acceptinvitation.invitacionNoValida", "Invitación no válida")}
        subtitle="El enlace no existe, ya se usó o caducó."
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <IconTile tone="bad" size="lg"><AlertCircle /></IconTile>
          <p className="max-w-sm text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            Pide a tu administrador que te reenvíe la invitación y vuelve a abrir el enlace del correo.
          </p>
          <button onClick={() => navigate("/login")} className={BOTON_PRINCIPAL}>
            Ir a iniciar sesión <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </AuthShell>
    );
  }

  // ── Formulario de activación ─────────────────────────────────────────────
  return (
    <AuthShell
      splash={false}
      showFeatures={false}
      width="lg"
      logoUrl={tenantLogo}
      brandName={tenantName}
      title="Activa tu cuenta"
      subtitle={
        role
          ? `Te han invitado como ${role}${tenantName ? ` en ${tenantName}` : ''}. Crea tu contraseña y entra al panel.`
          : "Completa tu registro para entrar al panel."
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <AvisoError>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
          </AvisoError>
        )}

        <div>
          <Etiqueta>Nombre completo</Etiqueta>
          <input className={CAMPO} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" disabled={submitting} />
        </div>

        <div>
          <Etiqueta>{t("ui.acceptinvitation.correoElectronico", "Correo electrónico")}</Etiqueta>
          <div className="relative">
            <input className={`${CAMPO} pr-11`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" disabled={submitting || lockedEmail} />
            {lockedEmail && <Building2 className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />}
          </div>
        </div>

        <div>
          <Etiqueta>{t("ui.acceptinvitation.contrasena", "Contraseña")}</Etiqueta>
          <div className="relative">
            <input className={`${CAMPO} pr-11`} type={showPwd ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("ui.acceptinvitation.creaUnaContrasenaSegura", "Crea una contraseña segura")} disabled={submitting} />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={() => setShowPwd((v) => !v)}
              className="cg-focus absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2.5"
              style={{ color: 'var(--ink-faint)' }}
            >
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Medidor de seguridad */}
          {password && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[11px] font-medium">
                <span style={{ color: 'var(--ink-faint)' }}>Seguridad</span>
                <span style={{ color: `var(--${strengthTone}-text)` }}>{strengthLabel}</span>
              </div>
              <div className="glass-sunken mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${strength}%`, background: `var(--${strengthTone})` }}
                />
              </div>
            </div>
          )}

          {/* Requisitos */}
          <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {RULES.map((r) => {
              const ok = r.test(password);
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-1.5 text-[11px]"
                  style={{ color: ok ? 'var(--ok-text)' : 'var(--ink-faint)' }}
                >
                  {ok ? <Check size={13} className="shrink-0" /> : <X size={13} className="shrink-0 opacity-50" />} {r.label}
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <Etiqueta>{t("ui.acceptinvitation.confirmarContrasena", "Confirmar contraseña")}</Etiqueta>
          <input className={CAMPO} type={showPwd ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t("ui.acceptinvitation.repiteLaContrasena", "Repite la contraseña")} disabled={submitting} />
          {confirm && password !== confirm && (
            <p className="mt-1.5 text-[11px] font-medium" style={{ color: 'var(--bad-text)' }}>{t("ui.acceptinvitation.lasContrasenasNoCoinciden", "Las contraseñas no coinciden.")}</p>
          )}
        </div>

        <button type="submit" disabled={!canSubmit} className={BOTON_PRINCIPAL}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Activar y entrar al panel <ArrowRight className="h-4 w-4" /></>}
        </button>
      </form>
    </AuthShell>
  );
}
