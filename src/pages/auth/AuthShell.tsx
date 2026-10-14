/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — MARCO DE ACCESO
 * El escaparate: es la primera pantalla que ve cualquiera. Una sola tarjeta de
 * cristal centrada sobre el lienzo ambiental, con la marca arriba.
 *
 * ── POR QUÉ VIVE AQUÍ Y NO EN /layouts ─────────────────────────────────────
 * Lo usan las pantallas SIN sesión: las de esta carpeta y las tres de
 * invitación (vigilante, cliente, supervisor). Ninguna cuelga del chasis del
 * CRM, así que tenerlo aquí evita que un cambio de acceso toque `/layouts`.
 *
 * ── UNA SOLA PANTALLA DE ACCESO ────────────────────────────────────────────
 * Las invitaciones tenían su propio marco de dos paneles con el oro de la
 * marca escrito a mano (#C8860A/#F5C300) y un panel oscuro fijo: se veía igual
 * en claro que en oscuro e ignoraba el acento del usuario. Ahora pasan por
 * aquí con `brandName`/`logoUrl`, que es lo que hace que un invitado vea la
 * EMPRESA que le invita y no la plataforma.
 *
 * ── COLOR ──────────────────────────────────────────────────────────────────
 * Ni un color escrito a mano. El halo, el filo, la tinta y el botón salen de
 * las variables de tokens.css, así que la pantalla se repinta sola al cambiar
 * el acento y funciona igual en claro y en oscuro sin escribir dos temas.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, BarChart3, Clock, MapPin, Shield } from "lucide-react";

import SplashScreen from "@/components/SplashScreen";
import BrandLockup from "@/components/BrandLockup";
import { esMarcaDeSocio, useWhiteLabel } from "@/contexts/WhiteLabelContext";
import { FadeIn } from "@/components/kit";
import { abrirPuertaDeEntrada } from "@/lib/seguridad/puertaEnVivo";

interface AuthShellProps {
  children: ReactNode;
  /** Encabezado sobre la tarjeta. */
  title: string;
  /**
   * 'field' es la variante de la app de vigilantes (el correo de recuperación
   * del móvil llega aquí): mensajes de campo, no de plataforma.
   */
  variant?: "admin" | "field";
  /** Texto bajo el título. Si no se pasa, el de la variante. */
  subtitle?: string;
  /** Píldora sobre el título. Si no se pasa, la de la variante. */
  eyebrow?: string;
  /** Logotipo de la organización que invita, cuando lo hay. */
  logoUrl?: string;
  /** Nombre de la organización que invita, cuando lo hay. */
  brandName?: string;
  /** Las tres pastillas de abajo. Se ocultan en flujos cortos. */
  showFeatures?: boolean;
  /**
   * Pastillas propias, cuando el flujo promete otra cosa que la plataforma —
   * una invitación de vigilante habla de marcaje y rondas, no de analítica.
   */
  features?: Array<{
    icon: React.ComponentType<{
      className?: string;
      style?: React.CSSProperties;
    }>;
    label: string;
  }>;
  /** La cortina de bienvenida. Las páginas que ya cargan datos la apagan. */
  splash?: boolean;
  /** `lg` para formularios largos (activación de cuenta). */
  width?: "md" | "lg";
}

/** Dos iniciales del nombre de la organización, para cuando no hay logotipo. */
function iniciales(nombre: string): string {
  return (
    nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0] ?? "")
      .join("")
      .toUpperCase() || "•"
  );
}

export default function AuthShell({
  children,
  title,
  variant = "admin",
  subtitle,
  eyebrow,
  logoUrl,
  brandName,
  showFeatures = true,
  features,
  splash = true,
  width = "md",
}: AuthShellProps) {
  const { t } = useTranslation();
  const [cargando, setCargando] = useState(splash);

  // La puerta anti-copia también vigila la entrada (socket anónimo).
  useEffect(() => abrirPuertaDeEntrada(), []);

  useEffect(() => {
    if (!splash) return;
    const timer = setTimeout(() => setCargando(false), 2500);

    return () => clearTimeout(timer);
  }, [splash]);

  /* La identidad YA contrastada contra la empresa de la sesión: en el árbol
     autenticado la sirve `IdentidadEfectivaProvider`, y antes de entrar es la
     del anfitrión. Aquí sólo se lee un dato ya resuelto.
     VA ANTES DEL `return` de la cortina: leída después, el primer render
     (cortina) llamaba a 15 hooks y el siguiente a 16, y React avisaba del
     cambio de orden al cerrar sesión. */
  const marcaDelAnfitrion = useWhiteLabel();

  if (cargando) return <SplashScreen />;

  const esCampo = variant === "field";

  const pastillas =
    features ??
    (esCampo
      ? [
          {
            icon: Clock,
            label: t("auth.fieldLanding.tag_clock", {
              defaultValue: "Entradas y salidas",
            }),
          },
          {
            icon: MapPin,
            label: t("auth.fieldLanding.tag_patrol", {
              defaultValue: "Rondas y patrullajes",
            }),
          },
          {
            icon: AlertTriangle,
            label: t("auth.fieldLanding.tag_incidents", {
              defaultValue: "Reporte de incidentes",
            }),
          },
        ]
      : [
          { icon: Shield, label: t("auth.landing.tag_cloud") },
          { icon: Clock, label: t("auth.landing.tag_realtime") },
          { icon: BarChart3, label: t("auth.landing.tag_analytics") },
        ]);

  const { platformName: nombreDeMarca, showPlatformAttribution } =
    marcaDelAnfitrion;

  const cintillo =
    eyebrow ??
    (esCampo
      ? t("auth.fieldLanding.eyebrow", { defaultValue: "App para vigilantes" })
      : t("auth.landing.eyebrow", { defaultValue: "Plataforma de seguridad" }));

  const bajada =
    subtitle ??
    (esCampo
      ? t("auth.fieldLanding.desc", {
          defaultValue:
            "Vuelve a entrar a la app C-Guard Pro con tu nueva contraseña.",
        })
      : /* ── EL NOMBRE DEL PRODUCTO LO PONE EL ANFITRIÓN ────────────────────
         La frase ya venía con un hueco `{{product}}` en los ocho idiomas —con
         la estructura de cada lengua intacta—, pero aquí se rellenaba con
         «C-GUARD» escrito a mano. Así que en el anfitrión de un socio la
         pantalla de acceso decía en voz alta de quién es la plataforma que su
         cliente cree suya. Se rellena con el nombre resuelto; si no hubiera
         ninguno, no se pinta la frase en vez de poner el nuestro. */
        nombreDeMarca
        ? t("auth.landing.desc", { product: nombreDeMarca })
        : "");

  return (
    /* `overflow-x-clip`: el halo mide 576 px y va centrado, así que en una
       pantalla de 390 sobresale 93 por cada lado. Es decoración —`aria-hidden`,
       sin eventos— pero el navegador no lo sabe: contaba para el desplazamiento
       y la pantalla de acceso se movía de lado. `clip` y no `hidden` para no
       crear un contenedor de desplazamiento que atrape el foco de los campos. */
    <div className="app-shell relative flex min-h-screen flex-col items-center justify-center overflow-x-clip px-4 py-10 sm:px-6">
      {/* Halo del acento justo detrás de la tarjeta: es lo que el cristal
          desenfoca. Sin nada detrás, el desenfoque no se percibe. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-[58%] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--brand) 0%, transparent 65%)",
          opacity: 0.14,
        }}
      />

      <FadeIn className={`w-full ${width === "lg" ? "max-w-lg" : "max-w-md"}`}>
        {/* ── Marca ──────────────────────────────────────────────────────── */}
        <div className="mb-7 flex flex-col items-center text-center">
          {logoUrl ? (
            <img
              alt={brandName || t("ui.AuthShell.logotipo", "Logotipo")}
              className="mb-5 h-14 max-w-[220px] object-contain"
              src={logoUrl}
            />
          ) : brandName ? (
            /* La organización que invita no tiene logotipo. Sus iniciales, NO el
               logotipo de la plataforma: quien recibe la invitación tiene que
               reconocer a la empresa que le contrata. */
            <div
              aria-hidden
              className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border text-lg font-bold"
              style={{
                background: "var(--brand-wash)",
                borderColor: "var(--brand-line)",
                color: "var(--brand-text)",
              }}
            >
              {iniciales(brandName)}
            </div>
          ) : (
            <BrandLockup className="mb-5 w-[210px]" />
          )}

          <span
            className="mb-5 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{
              background: "var(--brand-wash)",
              borderColor: "var(--brand-line)",
              color: "var(--brand-text)",
            }}
          >
            <span className="cc-dot" style={{ background: "var(--brand)" }} />
            {brandName || cintillo}
          </span>

          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-[2rem]">
            {title}
          </h1>
          {bajada && (
            <p
              className="mt-2 max-w-sm text-sm leading-relaxed"
              style={{ color: "var(--ink-soft)" }}
            >
              {bajada}
            </p>
          )}
        </div>

        {/* ── La tarjeta ─────────────────────────────────────────────────── */}
        <div className="glass p-6 sm:p-8">{children}</div>

        {/* ── Pastillas ──────────────────────────────────────────────────── */}
        {showFeatures && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {pastillas.map(({ icon: Icono, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium"
                style={{
                  background: "var(--glass-sunken)",
                  borderColor: "var(--hairline)",
                  color: "var(--ink-soft)",
                }}
              >
                <Icono
                  className="h-3.5 w-3.5"
                  style={{ color: "var(--brand-text)" }}
                />
                {label}
              </span>
            ))}
          </div>
        )}

        {/* ── LA ATRIBUCIÓN, DONDE ESTÁ PERMITIDA ────────────────────────────
            Este pie nombra a CGUARD. Con `showPlatformAttribution` puesto es
            legítimo y se deja tal cual —el socio acepta que se nos vea, y
            quitarlo sería cambiarle su configuración—. Con la atribución
            DESACTIVADA el socio paga justamente por lo contrario, así que el
            pie pasa a ser suyo: su nombre y su año. */}
        <p
          className="mt-7 text-center text-xs"
          style={{ color: "var(--ink-faint)" }}
        >
          {!esMarcaDeSocio(marcaDelAnfitrion)
            ? t("auth.landing.copyright", {
                defaultValue:
                  "© {{year}} C-GUARD. Todos los derechos reservados.",
                year: new Date().getFullYear(),
              })
            : showPlatformAttribution && nombreDeMarca
              ? /* The partner's name as an authorized reseller — and nothing of
                 ours: a partner's customers never read our name. */
                t("auth.landing.copyright_partner", {
                  defaultValue:
                    "© {{year}} {{marca}} · Distribuidor autorizado",
                  year: new Date().getFullYear(),
                  marca: nombreDeMarca,
                })
              : nombreDeMarca
                ? t("auth.footer_copyright", {
                    defaultValue:
                      "© {{year}} {{marca}}. Todos los derechos reservados.",
                    year: new Date().getFullYear(),
                    marca: nombreDeMarca,
                  })
                : null}
        </p>
      </FadeIn>
    </div>
  );
}

/* ── PIEZAS COMPARTIDAS DE FORMULARIO ──────────────────────────────────────
   Las seis páginas de acceso repetían la misma cadena de 12 clases por campo.
   Centralizarlas aquí es lo que garantiza que el anillo de foco del acento sea
   idéntico en todas. `cg-input` (glass.css) ya trae el hueco y el foco. */

/** Campo hundido. `pl-11` cuando lleva icono a la izquierda. */
export const CAMPO =
  "cg-input h-12 w-full px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50";
export const CAMPO_ICONO = `${CAMPO} pl-11`;

/** Botón principal: píldora de marca con brillo. */
export const BOTON_PRINCIPAL =
  "cg-btn-brand cg-focus flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60";

/** Etiqueta de campo. */
export function Etiqueta({
  htmlFor,
  children,
  requerido = true,
}: {
  htmlFor?: string;
  children: ReactNode;
  requerido?: boolean;
}) {
  return (
    <label className="mb-2 block text-sm font-medium" htmlFor={htmlFor}>
      {children}
      {requerido && <span style={{ color: "var(--brand-text)" }}> *</span>}
    </label>
  );
}

/** Separador con una palabra en medio. */
export function Separador({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1" style={{ background: "var(--hairline)" }} />
      <span
        className="text-xs font-medium uppercase tracking-widest"
        style={{ color: "var(--ink-faint)" }}
      >
        {children}
      </span>
      <div className="h-px flex-1" style={{ background: "var(--hairline)" }} />
    </div>
  );
}

/** Aviso de error dentro del formulario. */
export function AvisoError({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl border px-4 py-3 text-sm"
      style={{
        background: "color-mix(in oklab, var(--bad) 12%, transparent)",
        borderColor: "color-mix(in oklab, var(--bad) 30%, transparent)",
        color: "var(--bad-text)",
      }}
    >
      {children}
    </div>
  );
}
