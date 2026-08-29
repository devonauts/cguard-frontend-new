import { lazy, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from 'react-i18next';
import { createPortal } from "react-dom";
import { Siren, Phone, MapPin, User, Building2, Clock } from "lucide-react";
import { startPanicAlarm, stopPanicAlarm } from "@/lib/notificationSound";
import { ApiService } from "@/services/api/apiService";
import type { PlatformNotification } from "@/hooks/useNotificationStream";

import { localeActual } from '@/lib/localeActual'
/**
 * AHORRO · El mapa llega SÓLO cuando hay un pánico en pantalla.
 *
 * Este aviso vive en la cabecera global, o sea en TODAS las pantallas del CRM.
 * Con la importación normal, el código del mapa viajaba en el paquete de la
 * cabecera y se evaluaba en cada carga de la aplicación aunque no hubiera
 * ninguna emergencia. Cargándolo aquí, no se descarga hasta que suena la sirena.
 *
 * Y sigue siendo un mapa INTERACTIVO a propósito: en un pánico el operador
 * necesita acercarse a ver el portal exacto. Una imagen fija ahorraría más y
 * serviría de mucho menos, que es justo el sitio donde el ahorro no toca.
 */
const GoogleMapEmbed = lazy(() => import("@/components/GoogleMap/GoogleMapEmbed"));

/**
 * Centered, backdropped, IMPOSSIBLE-TO-MISS modal shown when an SOS / panic fires
 * (eventType `panic.alert`). It wails a siren and CANNOT be dismissed by clicking
 * away or a toast — the ONLY way to silence it is to RECORD the action taken, which
 * acknowledges the alarm case in the backend (logged to history). The location is
 * rendered INLINE on a live map (never a new tab). Multiple panics stack.
 *
 * ── EL COLOR DE ESTA PANTALLA NO SIGUE AL ACENTO ──────────────────────────────
 * Todo el rojo sale de `--bad`, que en tokens.css es FIJO por diseño: si mañana
 * alguien pone el acento de la empresa en verde, un pánico NO puede volverse
 * verde. Por eso aquí no aparece ni `--brand` ni `--primary` en ningún sitio.
 *
 * Las tres variables locales de abajo son el contrato de color del overlay:
 *   --panic       el rojo del sistema, tal cual (bordes, pulso, iconos, chips).
 *   --panic-fill  el MISMO rojo bajado de luminosidad para poder llevar tinta
 *                 blanca. `--bad` vale 0.55 en claro y 0.70 en oscuro; a 0.70 el
 *                 blanco encima se cae a ~2,5:1. Rebajarlo con `color-mix` deja
 *                 el relleno en ~0.40 (claro) / ~0.50 (oscuro): blanco legible en
 *                 los dos temas con UNA sola declaración, sin escribir `dark:`.
 *   --panic-ink   blanco puro, la tinta correcta sobre un rojo de esa
 *                 luminosidad. Mismo criterio que `.cg-btn-bad` en glass.css.
 * Se usa `color-mix` y no `oklch(from …)` a propósito: soporte más amplio, y un
 * color inválido en una alarma de pánico no es un fallo cosmético.
 */

/**
 * Texto seguro para pintar como hijo de React. Si llega un objeto —una
 * asociación de Sequelize que se coló en el payload— saca su campo legible en
 * vez de reventar con «Objects are not valid as a React child» (#31). Un SOS
 * NO puede caerse por un dato con forma inesperada.
 */
function comoTexto(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const o = v as any;
    return o.fullName || o.name || o.stationName || o.companyName || o.title || o.label || null;
  }
  return String(v);
}

const PANIC_VARS = {
  "--panic": "var(--bad)",
  "--panic-fill": "color-mix(in oklab, var(--bad) 72%, black)",
  "--panic-ink": "oklch(1 0 0)",
  // Reapunta el anillo de foco DENTRO del overlay: `.cg-focus` lo lee de `--ring`,
  // que a nivel de aplicación es el acento. Aquí, hasta el foco de teclado es rojo.
  "--ring": "var(--bad)",
} as CSSProperties;

const QUICK_ACTIONS = [
  "Contacté al vigilante en sitio",
  "Despaché supervisor / móvil",
  "Llamé a la policía (911)",
  "Contacté al cliente",
  "Falsa alarma / prueba",
];

export function PanicAlertOverlay({
  alerts,
  onAcknowledge,
}: {
  alerts: PlatformNotification[];
  /** Records the action + acknowledges the alarm case, then removes the alert. */
  onAcknowledge: (alert: PlatformNotification, action: string) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const active = alerts.length > 0;
  const [action, setAction] = useState("");
  const [saving, setSaving] = useState(false);
  // Sólo presentación: el foco del campo dibuja un halo ROJO, no el del acento.
  // `.cg-input` lo pintaría con `--brand` y aquí nada puede seguir al acento.
  const [fieldFocused, setFieldFocused] = useState(false);
  // La cadena de llamadas del SOS. DEBE declararse aquí arriba, junto al resto
  // de hooks y ANTES de cualquier `return`: estaba después del `if (!active)
  // return null`, así que al abrirse un pánico React veía «más hooks que en el
  // render anterior» (#310) y el overlay reventaba —lo que, sin boundary,
  // ponía el CRM entero en blanco—. Regla de hooks: nunca tras un return.
  const [contactos, setContactos] = useState<Array<{
    nombre: string; telefono: string; rol: string; pideClave?: boolean;
  }>>([]);
  const latest = alerts[0];

  // Siren wails while any panic is on screen; stops when the last is acknowledged.
  useEffect(() => {
    if (!active) return;
    const stop = startPanicAlarm();
    return () => {
      stop();
      stopPanicAlarm();
    };
  }, [active]);

  // Reset the action field whenever the visible alert changes.
  useEffect(() => {
    setAction("");
  }, [latest?.id]);

  // ── LA LISTA DE LLAMADAS ────────────────────────────────────────────────
  // El servidor resuelve la cadena completa (contactos del panel → cliente →
  // representante legal → supervisor de zona → emergencias del país). Antes,
  // en un SOS de persona este espacio estaba vacío. Va aquí arriba con el resto
  // de hooks; los ids se sacan de `latest.payload` porque aún no se ha
  // desestructurado `p` (eso ocurre después del return de abajo).
  useEffect(() => {
    if (!latest) { setContactos([]); return; }
    const pp: any = latest.payload || {};
    let vivo = true;
    const qs = new URLSearchParams();
    if (pp.stationId) qs.set("stationId", String(pp.stationId));
    if (pp.postSiteId) qs.set("postSiteId", String(pp.postSiteId));
    if (pp.clientAccountId) qs.set("clientAccountId", String(pp.clientAccountId));

    ApiService.get(`/tenant/${localStorage.getItem("tenantId")}/emergency/call-list?${qs}`)
      .then((r: any) => { if (vivo) setContactos(r?.contacts || r?.data?.contacts || []); })
      .catch(() => { if (vivo) setContactos([]); });

    return () => { vivo = false; };
  }, [latest?.id]);

  if (!active) return null;

  const p: any = latest.payload || {};
  const isClient = p.source === "client";
  const lat = Number(p.latitude);
  const lng = Number(p.longitude);
  const hasCoords = !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0);
  const when = (() => {
    try {
      return new Date(p.at || latest.createdAt).toLocaleString(localeActual(), {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "short",
      });
    } catch {
      return "";
    }
  })();

  const phoneTel = p.phone ? String(p.phone).replace(/[^+\d]/g, "") : null;

  const handleAck = async () => {
    if (!action.trim() || saving) return;
    setSaving(true);
    try {
      await onAcknowledge(latest, action.trim());
    } finally {
      setSaving(false);
      setAction("");
    }
  };

  const Row = ({ icon, label, value }: { icon: ReactNode; label: string; value?: unknown }) => {
    const texto = comoTexto(value);
    return texto ? (
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0" style={{ color: "var(--bad-text)" }}>{icon}</span>
        <div className="min-w-0">
          <div className="cg-eyebrow">{comoTexto(label)}</div>
          <div className="break-words text-sm font-semibold" style={{ color: "var(--ink)" }}>{texto}</div>
        </div>
      </div>
    ) : null;
  };

  // Portal to <body> so `position: fixed` is relative to the VIEWPORT. Mounted
  // inside the header, an ancestor's backdrop-filter would otherwise make `fixed`
  // resolve against the 56px header box → the modal pinned to the top + clipped.
  return createPortal(
    // Dimmed backdrop — the SOS modal sits centered on top of the whole CRM. No
    // click-away dismissal: the backdrop swallows clicks (no onClick handler).
    // El velo va NEGRO en los dos temas, con un lavado rojo del propio `--bad`
    // encima. Un velo tomado de un token acromático se invertiría con el tema y
    // en claro dejaría la alarma sobre un gris pálido: nada que grite.
    <div
      className="fixed inset-0 z-[9999] flex animate-in items-center justify-center p-4 fade-in duration-200"
      style={{
        ...PANIC_VARS,
        background:
          "radial-gradient(ellipse at center, color-mix(in oklab, var(--panic) 26%, transparent) 0%, transparent 62%), oklch(0 0 0 / 0.80)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      {/* Marco pulsante pegado al borde de la pantalla — se ve aunque el modal
          quede fuera del campo visual del operador. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 animate-pulse"
        style={{ boxShadow: "inset 0 0 0 5px var(--panic), inset 0 0 60px -10px var(--panic)" }}
      />

      {/* `glass-raised` aporta el filo iluminado y el desenfoque; el fondo se
          fuerza OPACO y el borde a rojo con estilo en línea, que es la única
          forma de pisar a glass.css (va sin @layer — ver su cabecera). */}
      <div
        className="glass-raised relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden"
        style={{
          background: "var(--glass-solid)",
          border: "2px solid var(--panic)",
          boxShadow: "var(--lift-4), 0 0 60px -12px var(--panic)",
        }}
      >
        {/* Header */}
        <div
          className="relative flex shrink-0 items-center gap-3 px-4 py-4 sm:px-6"
          style={{ background: "var(--panic-fill)", color: "var(--panic-ink)" }}
        >
          <Siren size={36} className="shrink-0 animate-pulse" />
          <div className="min-w-0">
            <div className="text-lg font-black leading-none tracking-tight sm:text-xl">
              {isClient ? "ALERTA SOS — CLIENTE" : "ALERTA DE PÁNICO"}
            </div>
            <div className="mt-1 text-sm" style={{ color: "color-mix(in oklab, var(--panic-ink) 84%, transparent)" }}>
              {isClient ? "Un cliente activó el botón de SOS" : "Un vigilante activó el botón de emergencia"}
            </div>
          </div>
          {alerts.length > 1 && (
            <span
              className="ml-auto shrink-0 rounded-full px-3 py-1 text-sm font-bold"
              style={{ background: "var(--panic-ink)", color: "var(--panic-fill)" }}
            >
              +{alerts.length - 1}
            </span>
          )}
        </div>

        {/* Body (scrollable) */}
        <div className="space-y-4 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <Row icon={<Building2 size={18} />} label={t('comun.puesto')} value={p.stationName || p.siteName} />
              <Row icon={<MapPin size={18} />} label={t("ui.PanicAlertOverlay.ubicacion", "Ubicación")} value={p.address || p.location} />
              <Row icon={<User size={18} />} label={isClient ? "Cliente" : "Vigilante"} value={isClient ? (p.clientName || p.guardName) : p.guardName} />
              <Row icon={<Phone size={18} />} label={t("ui.PanicAlertOverlay.telefonoDelSitio", "Teléfono del sitio")} value={p.phone} />
              <Row icon={<Clock size={18} />} label={t('comun.hora')} value={when} />
              {/* La cadena de llamadas, en el orden en que se llamaría. Antes
                  este espacio estaba vacío en todo pánico de persona. */}
              {contactos.filter((c) => c.rol !== "Emergencias").length > 0 && (
                <div className="pt-1">
                  <p className="cg-eyebrow mb-1.5">{t("ui.PanicAlertOverlay.aQuienLlamar", "A quién llamar")}</p>
                  <div className="space-y-1">
                    {contactos
                      .filter((c) => c.rol !== "Emergencias")
                      .map((c, i) => (
                        <a
                          key={`${c.telefono}-${i}`}
                          href={`tel:${String(c.telefono).replace(/[^+\d]/g, "")}`}
                          className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:brightness-110"
                          style={{ background: "color-mix(in oklab, var(--panic) 8%, transparent)" }}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-semibold">{comoTexto(c.nombre)}</span>
                            <span className="ml-2 text-xs" style={{ color: "var(--ink-faint)" }}>
                              {comoTexto(c.rol)}
                            </span>
                            {/* La clave verbal NO viaja; sólo el aviso de que hay
                                que pedirla, que es lo que la hace útil. */}
                            {c.pideClave && (
                              <span className="ml-2 text-xs font-semibold" style={{ color: "var(--warn-text)" }}>
                                pide clave
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 font-mono text-xs">{comoTexto(c.telefono)}</span>
                        </a>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {/* El número de emergencias lo decide el SERVIDOR según el país
                    del tenant o lo que la empresa configuró. Estaba fijo en 911
                    —correcto en Ecuador y México, no en Colombia (123), Perú
                    (105) ni España (112)— y no había forma de cambiarlo. */}
                {(() => {
                  const emerg = contactos.find((c) => c.rol === "Emergencias");
                  const numero = emerg?.telefono || "911";
                  return (
                    <a
                      href={`tel:${numero}`}
                      className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-[filter] hover:brightness-110"
                      style={{ background: "var(--panic-fill)", color: "var(--panic-ink)" }}
                    >
                      <Phone size={16} /> Llamar {numero}
                    </a>
                  );
                })()}
                {phoneTel && (
                  <a
                    href={`tel:${phoneTel}`}
                    className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold"
                    style={{
                      borderColor: "color-mix(in oklab, var(--panic) 45%, transparent)",
                      background: "color-mix(in oklab, var(--panic) 10%, transparent)",
                      color: "var(--bad-text)",
                    }}
                  >
                    <Phone size={16} /> Llamar al sitio
                  </a>
                )}
              </div>
            </div>

            {/* Inline live map — rendered HERE, never a new tab. */}
            <div
              className="h-56 overflow-hidden rounded-xl border sm:h-auto sm:min-h-[220px]"
              style={{ borderColor: "var(--hairline)" }}
            >
              {hasCoords ? (
                <Suspense
                  fallback={
                    <div
                      className="flex h-full min-h-[220px] items-center justify-center text-sm"
                      style={{ background: "var(--glass-sunken)", color: "var(--ink-soft)" }}
                    >
                      Abriendo el mapa…
                    </div>
                  }
                >
                  <GoogleMapEmbed lat={lat} lng={lng} zoom={16} className="h-full w-full" height="100%" />
                </Suspense>
              ) : (
                <div
                  className="flex h-full min-h-[220px] items-center justify-center text-sm"
                  style={{ background: "var(--glass-sunken)", color: "var(--ink-soft)" }}
                >
                  Sin coordenadas
                </div>
              )}
            </div>
          </div>

          {/* Action — REQUIRED to silence. Logged to the case history. */}
          <div className="glass-sunken p-3">
            <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
              Acción tomada <span style={{ color: "var(--bad-text)" }}>*</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((a) => {
                const elegida = action === a;
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAction(a)}
                    className="cg-focus inline-flex min-h-9 items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                    style={
                      elegida
                        ? {
                            borderColor: "var(--panic)",
                            background: "color-mix(in oklab, var(--panic) 16%, transparent)",
                            color: "var(--bad-text)",
                          }
                        : { borderColor: "var(--hairline)", color: "var(--ink-soft)" }
                    }
                  >
                    {a}
                  </button>
                );
              })}
            </div>
            <textarea
              value={action}
              onChange={(e) => setAction(e.target.value)}
              onFocus={() => setFieldFocused(true)}
              onBlur={() => setFieldFocused(false)}
              rows={2}
              placeholder={t("ui.PanicAlertOverlay.describeLaAccionTomadaPara", "Describe la acción tomada para atender el SOS…")}
              className="mt-2 w-full resize-none p-2 text-sm outline-none"
              style={{
                background: "var(--glass-solid)",
                color: "var(--ink)",
                border: `1px solid ${fieldFocused ? "var(--panic)" : "var(--hairline)"}`,
                borderRadius: "var(--r-md)",
                boxShadow: fieldFocused
                  ? "0 0 0 3px color-mix(in oklab, var(--panic) 30%, transparent)"
                  : "none",
              }}
            />
          </div>
        </div>

        {/* Footer — acknowledge (disabled until an action is recorded). */}
        <div className="shrink-0 border-t p-4" style={{ borderColor: "var(--hairline)", background: "var(--glass-sunken)" }}>
          <button
            onClick={handleAck}
            disabled={!action.trim() || saving}
            className="cg-focus flex w-full items-center justify-center gap-2 rounded-full py-3 text-lg font-bold transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "var(--panic-fill)",
              color: "var(--panic-ink)",
              boxShadow: "0 8px 26px -10px color-mix(in oklab, var(--panic) 60%, transparent)",
            }}
          >
            {saving ? "Registrando…" : "RECONOCER Y SILENCIAR"}
          </button>
          {!action.trim() && (
            <p className="mt-1.5 text-center text-xs" style={{ color: "var(--ink-soft)" }}>
              Registra la acción tomada para poder silenciar la alarma.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
