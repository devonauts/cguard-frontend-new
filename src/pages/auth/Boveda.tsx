/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL MARCO «BÓVEDA» — registro e inicio de sesión
 *
 * Elegido por el dueño (2026-10-03) entre veinte propuestas: una tarjeta de
 * vidrio oscuro con esquinas de visor sobre un fondo de noche LISO y QUIETO
 * (pidió quitar la rejilla y las animaciones). Registro e inicio de sesión
 * comparten este marco para que entrar y darse de alta se sientan el mismo
 * sitio.
 *
 * ── MARCA BLANCA ───────────────────────────────────────────────────────────
 * El acento es `--brand`: oro en la plataforma, el color del socio en su
 * anfitrión. El logotipo y el nombre salen de `useWhiteLabel()`; en el
 * anfitrión de un socio no aparece nada nuestro (ni escudo ni nombre), y el
 * pie respeta `showPlatformAttribution` igual que hacía `AuthShell`.
 * ════════════════════════════════════════════════════════════════════════════
 */
import {
  ButtonHTMLAttributes,
  ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Globe, Lock, Moon, Sun } from "lucide-react";

import CortinaDescifrado from "./CortinaDescifrado";

import BrandLockup from "@/components/BrandLockup";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { esMarcaDeSocio, useWhiteLabel } from "@/contexts/WhiteLabelContext";
import { LANGUAGES, useLanguage } from "@/contexts/LanguageContext";
import { useThemeContext } from "@/contexts/ThemeContext";

export default function Boveda({
  estado,
  bajoLaTarjeta,
  splash = false,
  children,
}: {
  /** La línea de arriba a la derecha de la tarjeta («Alta de empresa», «Acceso»). */
  estado: string;
  /** Lo que va debajo de la tarjeta (la cifra de la plataforma, por ejemplo). */
  bajoLaTarjeta?: ReactNode;
  /** La cortina de bienvenida, como la tenía el inicio de sesión. */
  splash?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  /* Claro u oscuro: el mismo tema del CRM (se guarda en la cuenta), así que
     lo que se elige aquí sigue al entrar. */
  const { theme, setTheme } = useThemeContext();
  const claro = theme === "light";
  /* Los hooks, antes del `return` de la cortina: si no, el primer render y el
     siguiente llaman a un número distinto y React avisa al cerrar sesión. */
  const marca = useWhiteLabel();
  /* La cortina de bienvenida sale UNA vez por pestaña: al abrir el CRM. Antes
     salía cada vez que se entraba a esta pantalla —también desde el enlace
     del registro— y eran 2,5 s de espera sin cargar nada (2026-10-03). */
  const [cargando, setCargando] = useState(() => splash && !cortinaYaVista());

  useEffect(() => {
    if (cargando) marcarCortinaVista();
  }, [cargando]);
  const terminarCortina = useCallback(() => setCargando(false), []);

  /* La cortina «Descifrado» (opción 8, elegida por el dueño). Va con los
     estilos de la Bóveda para que tenga la tipografía del acceso. */
  if (cargando)
    return (
      <>
        <style>{ESTILOS_BOVEDA}</style>
        <CortinaDescifrado onFin={terminarCortina} />
      </>
    );

  const dePlataforma = !!marca.puedeUsarArteDePlataforma;
  const nombreDeMarca = marca.platformName || "";
  const anio = new Date().getFullYear();

  return (
    <div
      className="app-shell cg-reg relative flex min-h-[100dvh] flex-col overflow-x-clip"
      data-modo={claro ? "claro" : "oscuro"}
    >
      <style>{ESTILOS_BOVEDA}</style>

      {/* Idioma: el de la IP o el navegador, pero se puede cambiar aquí mismo.
          Cada idioma se nombra en su propio idioma. */}
      {/* Modo e idioma en una píldora de cristal. El modo es un interruptor
          de dos posiciones con una perla que se desliza; el idioma, un menú
          nativo (el del teléfono en el móvil) vestido de cristal. */}
      <div className="cg-reg-ajustes">
        <div
          aria-label={t("auth.signup.apariencia", {
            defaultValue: "Apariencia",
          })}
          className={`cg-reg-modo ${claro ? "is-claro" : ""}`}
          role="radiogroup"
        >
          <i aria-hidden />
          <button
            aria-checked={claro}
            aria-label={t("auth.signup.modoClaro", {
              defaultValue: "Modo claro",
            })}
            role="radio"
            title={t("auth.signup.modoClaro", { defaultValue: "Modo claro" })}
            type="button"
            onClick={() => setTheme("light")}
          >
            <Sun aria-hidden className="h-3.5 w-3.5" />
          </button>
          <button
            aria-checked={!claro}
            aria-label={t("auth.signup.modoOscuro", {
              defaultValue: "Modo oscuro",
            })}
            role="radio"
            title={t("auth.signup.modoOscuro", { defaultValue: "Modo oscuro" })}
            type="button"
            onClick={() => setTheme("dark")}
          >
            <Moon aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* El desplegable del CRM (Radix), no el del navegador: con
            teclado, lector de pantalla y el mismo cristal que la tarjeta. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t("auth.signup.idioma", { defaultValue: "Idioma" })}
              className="cg-reg-idioma"
              type="button"
            >
              <Globe aria-hidden className="h-3.5 w-3.5" />
              <span>
                {(LANGUAGES as Record<string, { name: string }>)[language]
                  ?.name || language}
              </span>
              <ChevronDown aria-hidden className="h-3.5 w-3.5 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="cg-reg-menu"
            data-modo={claro ? "claro" : "oscuro"}
            sideOffset={8}
          >
            <DropdownMenuRadioGroup
              value={language}
              onValueChange={(v) => setLanguage(v as any)}
            >
              {Object.values(LANGUAGES).map((l) => (
                <DropdownMenuRadioItem key={l.code} value={l.code}>
                  {l.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Se centran SÓLO el logo y la tarjeta: el pie va aparte, abajo. Antes el
          pie contaba en el centrado y empujaba el bloque hacia arriba. */}
      <main className="cg-reg-centro relative mx-auto flex w-full max-w-[460px] flex-1 flex-col items-center justify-center gap-5 px-4 py-12">
        {/* ── LA MARCA DEL ANFITRIÓN ──────────────────────────────────────
            Plataforma: el bloque de marca de la web. Socio: su logotipo; sin
            logotipo, sus iniciales y su nombre — nunca el nuestro. */}
        {dePlataforma ? (
          /* El mismo bloque de marca que la web: escudo, letras y lema. */
          <BrandLockup className="w-[220px]" />
        ) : (
          <div className="flex items-center gap-2.5">
            {marca.logo ? (
              <img
                alt={nombreDeMarca}
                className="cg-reg-logo-socio h-[72px] w-auto max-w-[min(340px,85vw)] object-contain sm:h-[88px]"
                src={(!claro && marca.logoDarkUrl) || marca.logo}
              />
            ) : nombreDeMarca ? (
              <span aria-hidden className="cg-reg-iniciales">
                {iniciales(nombreDeMarca)}
              </span>
            ) : null}
            {!marca.logo && nombreDeMarca && (
              <span className="font-display text-lg font-bold tracking-tight">
                {nombreDeMarca}
              </span>
            )}
          </div>
        )}

        <div className="relative w-full">
          <section className="cg-reg-tarjeta w-full">
            <i aria-hidden className="cg-reg-esq cg-reg-esq--a" />
            <i aria-hidden className="cg-reg-esq cg-reg-esq--b" />
            <i aria-hidden className="cg-reg-esq cg-reg-esq--c" />
            <i aria-hidden className="cg-reg-esq cg-reg-esq--d" />

            <div className="cg-reg-estado">
              <span className="inline-flex items-center gap-1.5">
                <Lock aria-hidden className="cg-reg-ok h-3 w-3" />
                {t("auth.signup.conexionCifrada", {
                  defaultValue: "Conexión cifrada",
                })}
              </span>
              <span>{estado}</span>
            </div>

            {children}
          </section>
        </div>

        {bajoLaTarjeta}
      </main>

      {/* ── LA ATRIBUCIÓN, DONDE ESTÁ PERMITIDA ──────────────────────────
            Misma regla que `AuthShell`: con la atribución apagada el socio
            paga justamente por no vernos, así que el pie es suyo. */}
      <p className="cg-reg-tenue relative px-4 pb-5 text-center text-xs">
        {!esMarcaDeSocio(marca)
          ? t("auth.landing.copyright", {
              defaultValue:
                "© {{year}} C-GUARD. Todos los derechos reservados.",
              year: anio,
            })
          : marca.showPlatformAttribution && nombreDeMarca
            ? t("auth.landing.copyright_partner", {
                defaultValue: "© {{year}} {{marca}} · Distribuidor autorizado",
                year: anio,
                marca: nombreDeMarca,
              })
            : nombreDeMarca
              ? t("auth.footer_copyright", {
                  defaultValue:
                    "© {{year}} {{marca}}. Todos los derechos reservados.",
                  year: anio,
                  marca: nombreDeMarca,
                })
              : null}
      </p>
    </div>
  );
}

const CLAVE_CORTINA = "cg-cortina-vista";

function cortinaYaVista(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_CORTINA) === "1";
  } catch {
    return false;
  }
}

function marcarCortinaVista(): void {
  try {
    sessionStorage.setItem(CLAVE_CORTINA, "1");
  } catch {
    /* sin almacenamiento: la cortina saldrá otra vez, nada más */
  }
}

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

/** La clase de los campos de texto de la Bóveda. */
export const CAMPO = "cg-reg-campo";

/** Un campo con icono, etiqueta y aviso debajo — el patrón de la Bóveda. */
export function Campo({
  etiqueta,
  htmlFor,
  Icono,
  aviso,
  children,
}: {
  etiqueta: string;
  htmlFor: string;
  Icono: React.ComponentType<{ className?: string }>;
  aviso?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="cg-reg-etiqueta" htmlFor={htmlFor}>
        {etiqueta}
      </label>
      <div className="relative">
        <Icono className="cg-reg-tenue pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" />
        {children}
      </div>
      {aviso && <p className="cg-reg-mal mt-1 text-xs">{aviso}</p>}
    </div>
  );
}

/* ── EL BOTÓN DE ACCIÓN (opción 6, «Cargando → listo», elegida por el dueño) ──
   Para lo que espera al servidor: entrar, crear la cuenta, enviar el enlace.
   Al pulsar se encoge a un círculo que carga y, si sale bien, termina en un
   visto verde antes de seguir; si sale mal, vuelve a su forma. */
export type EstadoDeAccion = "reposo" | "cargando" | "listo";

/** El estado del botón y una forma de ejecutar la acción con él. `fn` devuelve
 *  `true` si salió bien. Lo cargando dura al menos 450 ms (un servidor rápido
 *  haría parpadear el círculo) y el visto se ve 700 ms antes de seguir. */
export function useBotonDeAccion() {
  const [estado, setEstado] = useState<EstadoDeAccion>("reposo");
  const ejecutar = useCallback(async (fn: () => Promise<boolean>) => {
    setEstado("cargando");
    const minimo = new Promise((r) => setTimeout(r, 450));
    let ok = false;

    try {
      ok = await fn();
    } catch (err) {
      await minimo;
      setEstado("reposo");
      throw err;
    }
    await minimo;
    if (!ok) {
      setEstado("reposo");

      return false;
    }
    setEstado("listo");
    await new Promise((r) => setTimeout(r, 700));

    return true;
  }, []);
  const reiniciar = useCallback(() => setEstado("reposo"), []);

  return { estado, ejecutar, reiniciar };
}

export function BotonDeAccion({
  estado,
  children,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { estado: EstadoDeAccion }) {
  const { t } = useTranslation();

  return (
    <button
      {...props}
      aria-busy={estado === "cargando"}
      className={`cg-reg-boton cg-accion ${estado !== "reposo" ? `is-${estado}` : ""} ${className}`}
      disabled={disabled || estado !== "reposo"}
    >
      <span className="cg-accion-txt">{children}</span>
      <span aria-hidden className="cg-accion-giro" />
      <span aria-hidden className="cg-accion-ok">
        <Check className="h-5 w-5" />
      </span>
      <span aria-live="polite" className="sr-only">
        {estado === "cargando"
          ? t("auth.signup.procesando", { defaultValue: "Procesando…" })
          : estado === "listo"
            ? t("auth.signup.listo", { defaultValue: "Listo" })
            : ""}
      </span>
    </button>
  );
}

/** El botón «Ver / Ocultar» dentro del campo de contraseña. */
export function BotonVer({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();

  return (
    <button
      aria-label={
        visible
          ? t("auth.hide_password", { defaultValue: "Ocultar contraseña" })
          : t("auth.show_password", { defaultValue: "Mostrar contraseña" })
      }
      className="cg-reg-ver"
      type="button"
      onClick={onClick}
    >
      {visible
        ? t("auth.signup.ocultar", { defaultValue: "Ocultar" })
        : t("auth.signup.ver", { defaultValue: "Ver" })}
    </button>
  );
}

const ESTILOS_BOVEDA = `
/* Las dos paletas, como variables: nada de color suelto en las reglas. */
.cg-reg {
  --rg-ink: #fff; --rg-medio: rgba(255,255,255,.72); --rg-suave: rgba(255,255,255,.58); --rg-tenue: rgba(255,255,255,.4);
  --rg-tarjeta: linear-gradient(155deg, rgba(255,255,255,.11), rgba(255,255,255,.035) 45%, rgba(255,255,255,.06)); --rg-tarjeta-borde: rgba(255,255,255,.14);
  --rg-tarjeta-sombra: 0 40px 100px -40px rgba(0,0,0,.85), inset 0 1px 0 rgba(255,255,255,.28), inset 0 -1px 0 rgba(255,255,255,.06), inset 0 0 50px rgba(255,255,255,.03);
  --rg-filo: rgba(255,255,255,.55); --rg-reflejo: rgba(255,255,255,.10);
  --rg-campo: rgba(0,0,0,.22); --rg-campo-foco: rgba(0,0,0,.3); --rg-campo-borde: rgba(255,255,255,.12); --rg-marcador: rgba(255,255,255,.35);
  --rg-hueco: rgba(0,0,0,.35); --rg-hueco-borde: rgba(255,255,255,.06);
  --rg-control: rgba(255,255,255,.04); --rg-control-borde: rgba(255,255,255,.12);
  --rg-pista: rgba(255,255,255,.1); --rg-ok: #86efac; --rg-ok-fondo: rgba(74,222,128,.08); --rg-ok-borde: rgba(74,222,128,.35); --rg-mal: #fda4af;
  color-scheme: dark; color: var(--rg-ink);
}
.cg-reg[data-modo="claro"] {
  --rg-ink: #0d1424; --rg-medio: #3b4558; --rg-suave: #5b6577; --rg-tenue: #8a93a3;
  --rg-tarjeta: linear-gradient(155deg, rgba(255,255,255,.72), rgba(255,255,255,.42) 50%, rgba(255,255,255,.55)); --rg-tarjeta-borde: rgba(255,255,255,.75);
  --rg-tarjeta-sombra: 0 40px 90px -45px rgba(20,35,70,.45), inset 0 1px 0 #fff, inset 0 -1px 0 rgba(255,255,255,.5), inset 0 0 40px rgba(255,255,255,.35);
  --rg-filo: #fff; --rg-reflejo: rgba(255,255,255,.5);
  --rg-campo: rgba(255,255,255,.55); --rg-campo-foco: rgba(255,255,255,.85); --rg-campo-borde: rgba(30,50,90,.14); --rg-marcador: #9aa3b2;
  --rg-hueco: #eef1f6; --rg-hueco-borde: #e2e7ef;
  --rg-control: #fff; --rg-control-borde: #dde3ec;
  --rg-pista: #e3e8f0; --rg-ok: #15803d; --rg-ok-fondo: rgba(22,163,74,.08); --rg-ok-borde: rgba(22,163,74,.35); --rg-mal: #be123c;
  color-scheme: light;
}
.cg-reg-medio { color: var(--rg-medio); } .cg-reg-suave { color: var(--rg-suave); } .cg-reg-tenue { color: var(--rg-tenue); }
.cg-reg-ok { color: var(--rg-ok); } .cg-reg-mal { color: var(--rg-mal); }

/* El fondo es el lienzo del CRM (.app-shell, glass.css). En oscuro, el dueño
   lo quiere NEGRO MATE con las luces en BLANCO translúcido (2026-10-03): se
   cambia sólo aquí, el resto del CRM sigue con su índigo y cian. */
.app-shell.cg-reg[data-modo="oscuro"] { background: #0a0a0b; }
.app-shell.cg-reg[data-modo="oscuro"]::before {
  background:
    radial-gradient(38% 42% at 44% 40%, rgba(255,255,255,.13), transparent 74%),
    radial-gradient(36% 40% at 58% 60%, rgba(255,255,255,.08), transparent 74%) !important; }

.cg-reg-ajustes { position: absolute; top: max(16px, env(safe-area-inset-top, 0px)); right: 16px; z-index: 3; display: flex; gap: 8px; }
/* El cristal de los controles: el mismo material que la tarjeta, en píldora. */
.cg-reg-modo, .cg-reg-idioma { position: relative; display: inline-flex; align-items: center; height: 40px; border-radius: 9999px;
  background: linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.05) 55%, rgba(255,255,255,.09));
  border: 1px solid transparent;
  backdrop-filter: blur(18px) saturate(200%) brightness(1.08); -webkit-backdrop-filter: blur(18px) saturate(200%) brightness(1.08);
  box-shadow: 0 12px 30px -14px rgba(0,0,0,.6), inset 0 0 14px rgba(255,255,255,.06); color: var(--rg-medio); isolation: isolate; }
/* El filo especular: luz fuerte arriba a la izquierda y abajo a la derecha,
   casi nada en el medio — es lo que hace que se lea como vidrio. */
.cg-reg-modo::before, .cg-reg-idioma::before, .cg-reg-tarjeta::before {
  content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; pointer-events: none;
  background: linear-gradient(135deg, var(--rg-filo) 0%, rgba(255,255,255,.18) 22%, rgba(255,255,255,.04) 50%, rgba(255,255,255,.14) 78%, color-mix(in oklab, var(--rg-filo) 70%, transparent) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
/* El brillo de la mitad de arriba, como la curva de luz de una gota. */
.cg-reg-modo::after, .cg-reg-idioma::after { content: ""; position: absolute; left: 6%; right: 6%; top: 1px; height: 48%; border-radius: 9999px 9999px 50% 50%;
  background: linear-gradient(180deg, rgba(255,255,255,.22), transparent); pointer-events: none; z-index: -1; }
.cg-reg[data-modo="claro"] .cg-reg-modo, .cg-reg[data-modo="claro"] .cg-reg-idioma {
  background: linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.45) 55%, rgba(255,255,255,.65));
  box-shadow: 0 10px 26px -14px rgba(20,35,70,.45), inset 0 0 12px rgba(255,255,255,.6); }
.cg-reg-modo { padding: 3px; gap: 0; }
.cg-reg-modo button { position: relative; z-index: 1; display: grid; place-items: center; width: 32px; height: 30px; border-radius: 9999px; color: var(--rg-suave); transition: color .25s; }
.cg-reg-modo button[aria-checked="true"] { color: var(--rg-ink); }
/* La perla: una gota de cristal más clara con el acento por dentro. */
.cg-reg-modo > i { position: absolute; top: 3px; left: 3px; width: 32px; height: 30px; border-radius: 9999px; transform: translateX(32px);
  background: radial-gradient(120% 90% at 30% 15%, rgba(255,255,255,.65), rgba(255,255,255,.12) 55%), color-mix(in oklab, var(--brand) 30%, transparent);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.85), inset 0 -2px 4px rgba(0,0,0,.18), 0 0 0 .5px rgba(255,255,255,.4), 0 6px 14px -4px var(--brand-glow);
  transition: transform .3s cubic-bezier(.3,1.3,.5,1); }
.cg-reg-modo.is-claro > i { transform: translateX(0); }
.cg-reg-idioma { gap: 6px; padding: 0 12px; font-size: .82rem; font-weight: 600; }
.cg-reg-idioma span { color: var(--rg-ink); }
.cg-reg-idioma:focus-visible, .cg-reg-modo button:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

/* El menú de idiomas. Va en un portal FUERA de .cg-reg, así que no ve sus
   variables: lleva sus dos paletas propias según data-modo. */
.cg-reg-menu.cg-reg-menu { min-width: 200px; padding: 6px; border-radius: 18px; border: 1px solid transparent; color: #fff;
  background: linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.04) 60%, rgba(255,255,255,.08)), rgba(14,20,34,.5);
  backdrop-filter: blur(26px) saturate(200%) brightness(1.05); -webkit-backdrop-filter: blur(26px) saturate(200%) brightness(1.05);
  box-shadow: 0 26px 60px -22px rgba(0,0,0,.75), inset 0 0 18px rgba(255,255,255,.05); isolation: isolate; }
.cg-reg-menu::before { content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; pointer-events: none;
  background: linear-gradient(135deg, rgba(255,255,255,.6), rgba(255,255,255,.12) 25%, rgba(255,255,255,.03) 55%, rgba(255,255,255,.4));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
.cg-reg-menu::after { content: ""; position: absolute; left: 4%; right: 4%; top: 1px; height: 40%; border-radius: 17px 17px 50% 50%;
  background: linear-gradient(180deg, rgba(255,255,255,.14), transparent); pointer-events: none; z-index: -1; }
.cg-reg-menu[data-modo="claro"] { color: #0d1424;
  background: linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,.55) 60%, rgba(255,255,255,.72));
  box-shadow: 0 24px 50px -24px rgba(20,35,70,.5), inset 0 0 14px rgba(255,255,255,.6); }
.cg-reg-menu [role="menuitemradio"] { border-radius: 11px; padding: 9px 12px 9px 32px; font-size: 14px; font-weight: 500; }
.cg-reg-menu [role="menuitemradio"][data-highlighted] { background: rgba(255,255,255,.12); }
.cg-reg-menu[data-modo="claro"] [role="menuitemradio"][data-highlighted] { background: rgba(20,40,80,.07); }
.cg-reg-menu [role="menuitemradio"][data-state="checked"] { font-weight: 700; color: inherit;
  background: color-mix(in oklab, var(--brand) 18%, transparent); box-shadow: inset 0 1px 0 rgba(255,255,255,.25); }
.cg-reg-menu [role="menuitemradio"] svg { color: var(--brand); }

.cg-reg-iniciales { display: grid; place-items: center; width: 40px; height: 40px; border-radius: .8rem; font-weight: 700;
  color: var(--brand); background: color-mix(in oklab, var(--brand) 14%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--brand) 40%, transparent); }

.cg-reg-tarjeta { position: relative; z-index: 1; padding: 30px; border-radius: 26px; background: var(--rg-tarjeta);
  backdrop-filter: blur(28px) saturate(190%); -webkit-backdrop-filter: blur(28px) saturate(190%);
  border: 1px solid transparent; box-shadow: var(--rg-tarjeta-sombra); isolation: isolate; }
/* El reflejo: una curva de luz en la parte de arriba del vidrio. */
.cg-reg-tarjeta::after { content: ""; position: absolute; left: 1px; right: 1px; top: 1px; height: 46%; border-radius: 25px 25px 60% 60% / 25px 25px 30px 30px;
  background: linear-gradient(180deg, var(--rg-reflejo), transparent); pointer-events: none; z-index: -1; }
@media (max-width: 480px) { .cg-reg-tarjeta { padding: 22px; } }
/* Pantallas bajas (portátiles de 13"): menos aire para que todo entre centrado. */
@media (max-height: 780px) and (min-width: 601px) {
  .cg-reg-centro { gap: 14px; padding-top: 28px; padding-bottom: 20px; }
  .cg-reg-centro .cg-reg-tarjeta { padding: 24px 30px; }
}
/* En el teléfono los controles van en su propia fila (no encima del logo) y
   la línea de estado se queda sólo con «Conexión cifrada». */
@media (max-width: 600px) {
  .cg-reg-ajustes { position: relative; top: auto; right: auto; justify-content: flex-end; padding: max(12px, env(safe-area-inset-top, 0px)) 16px 0; }
  .cg-reg-ajustes + .cg-reg-centro { padding-top: 20px; }
  .cg-reg-estado > span:last-child { display: none; }
}
.cg-reg-esq { position: absolute; width: 22px; height: 22px; border: 0 solid var(--brand); pointer-events: none; }
.cg-reg-esq--a { top: -1px; left: -1px; border-width: 2px 0 0 2px; border-top-left-radius: 26px; }
.cg-reg-esq--b { top: -1px; right: -1px; border-width: 2px 2px 0 0; border-top-right-radius: 26px; }
.cg-reg-esq--c { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; border-bottom-left-radius: 26px; }
.cg-reg-esq--d { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; border-bottom-right-radius: 26px; }

.cg-reg-estado { display: flex; justify-content: space-between; gap: .75rem; margin-bottom: 16px;
  font-family: var(--font-display); font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--rg-suave); }

.cg-reg-pestanas { position: relative; display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 20px; padding: 4px;
  border-radius: 12px; background: var(--rg-hueco); border: 1px solid var(--rg-hueco-borde); }
.cg-reg-pestanas > i { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc(50% - 4px); border-radius: 9px;
  background: var(--brand); box-shadow: 0 6px 18px -6px var(--brand-glow); transition: transform .3s ease; }
.cg-reg-pestanas.is-2 > i { transform: translateX(100%); }
.cg-reg-pestanas button { position: relative; z-index: 1; padding: 9px 6px; font-family: var(--font-display); font-size: .88rem; font-weight: 700;
  color: var(--rg-suave); transition: color .3s; }
.cg-reg-pestanas button[aria-selected="true"] { color: var(--brand-ink); }

.cg-reg-etiqueta { display: block; margin-bottom: .45rem; font-size: .875rem; font-weight: 600; color: var(--rg-medio); }
.cg-reg-campo { width: 100%; height: 50px; padding-left: 2.6rem; padding-right: 1rem; border-radius: 12px; color: var(--rg-ink); font-size: 16px;
  background: var(--rg-campo); border: 1px solid var(--rg-campo-borde); outline: none;
  box-shadow: inset 0 1px 2px rgba(0,0,0,.12), inset 0 -1px 0 rgba(255,255,255,.06);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  transition: border-color .2s, box-shadow .2s, background .2s; }
.cg-reg-campo::placeholder { color: var(--rg-marcador); }
.cg-reg-campo:focus { border-color: var(--brand); background: var(--rg-campo-foco);
  box-shadow: 0 0 0 4px color-mix(in oklab, var(--brand) 18%, transparent); }
.cg-reg-ver { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); padding: 8px 10px; border-radius: 8px;
  font-size: .875rem; font-weight: 600; color: var(--rg-medio); }
.cg-reg-ver:hover { color: var(--rg-ink); }

.cg-reg-fuerza { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-top: 8px; }
.cg-reg-fuerza i { height: 3px; border-radius: 3px; background: var(--rg-pista); transition: background .3s; }
.cg-reg-fuerza[data-n="1"] i:nth-child(-n+1),
.cg-reg-fuerza[data-n="2"] i:nth-child(-n+2) { background: #f5a524; }
.cg-reg-fuerza[data-n="3"] i:nth-child(-n+3),
.cg-reg-fuerza[data-n="4"] i:nth-child(-n+4) { background: #a3c43a; }
.cg-reg-fuerza[data-n="5"] i { background: #22c55e; }
.cg-reg-reglas { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.cg-reg-reglas span { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 9999px; font-size: .75rem;
  color: var(--rg-suave); background: var(--rg-control); border: 1px solid var(--rg-campo-borde); transition: color .2s, border-color .2s, background .2s; }
.cg-reg-reglas span.is-ok { color: var(--rg-ok); border-color: var(--rg-ok-borde); background: var(--rg-ok-fondo); }

.cg-reg-boton { display: inline-flex; width: 100%; height: 52px; align-items: center; justify-content: center; gap: .5rem;
  border-radius: 12px; font-family: var(--font-display); font-weight: 700; font-size: 16px; letter-spacing: .01em; color: var(--brand-ink);
  background: linear-gradient(180deg, color-mix(in oklab, var(--brand) 82%, white), var(--brand));
  box-shadow: 0 12px 30px -12px var(--brand-glow), inset 0 1px 0 rgba(255,255,255,.5); transition: filter .15s; }
.cg-reg-boton:hover { filter: brightness(1.05); }
.cg-reg-boton:disabled { opacity: .6; }
.cg-accion { position: relative; display: flex; margin-inline: auto; transition: width .35s cubic-bezier(.6,0,.3,1), flex-basis .35s cubic-bezier(.6,0,.3,1), border-radius .35s, background .3s, color .3s; }
.cg-accion .cg-accion-txt { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; white-space: nowrap; transition: opacity .2s, transform .3s; }
.cg-accion .cg-accion-giro, .cg-accion .cg-accion-ok { position: absolute; display: grid; place-items: center; opacity: 0; transform: scale(.6); transition: opacity .2s, transform .3s; }
.cg-accion .cg-accion-giro { width: 22px; height: 22px; border-radius: 50%; border: 2.5px solid color-mix(in oklab, var(--brand-ink) 25%, transparent); border-top-color: var(--brand-ink); animation: cgAccionGira .7s linear infinite; }
.cg-accion.is-cargando, .cg-accion.is-listo { width: 52px; flex: 0 0 52px; border-radius: 26px; opacity: 1; }
.cg-accion.is-cargando .cg-accion-txt, .cg-accion.is-listo .cg-accion-txt { opacity: 0; transform: scale(.8); }
.cg-accion.is-cargando .cg-accion-giro { opacity: 1; transform: none; }
.cg-accion.is-listo { background: #22c55e; color: #fff; box-shadow: 0 12px 30px -12px rgba(34,197,94,.6); }
.cg-accion.is-listo .cg-accion-ok { opacity: 1; transform: none; }
@keyframes cgAccionGira { to { transform: rotate(360deg); } }
.cg-reg-boton-sec { display: grid; place-items: center; width: 52px; height: 52px; flex: none; border-radius: 12px; color: var(--rg-ink);
  background: var(--rg-control); border: 1px solid var(--rg-control-borde); }
/* Enlaces sin subrayado (pedido del dueño): se distinguen por el color de la
   marca y el peso. */
.cg-reg-enlace { font-weight: 700; color: var(--brand-text, var(--brand)); text-decoration: none; transition: opacity .15s; }
.cg-reg-enlace:hover { opacity: .8; }
.cg-reg-aviso { padding: 12px; border-radius: 12px; font-size: .85rem; color: var(--rg-medio); background: var(--rg-hueco); border: 1px solid var(--rg-hueco-borde); }

.cg-reg-vivo { width: 6px; height: 6px; border-radius: 9999px; background: #22c55e; box-shadow: 0 0 8px #22c55e; }

@media (prefers-reduced-motion: reduce) {
  .cg-accion, .cg-accion * { transition: none !important; }
  .cg-reg-modo > i, .cg-reg-pestanas > i, .cg-reg-campo, .cg-reg-fuerza i, .cg-reg-reglas span { transition: none !important; }
}
`;
