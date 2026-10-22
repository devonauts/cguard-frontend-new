import i18n from "@/i18n";
import {
  createContext, useContext, useEffect, useRef, useState, type ReactNode,
} from "react";

import { restaurarAccentDelUsuario } from "@/lib/acentoDelUsuario";
import { cargarAnaliticaDeMarca } from "@/lib/analiticaDeMarca";
import { TIPO_DE_MENSAJE, tokenDeVistaPrevia } from "@/lib/vistaPrevia";
import { aplicarFuenteDeMarca, esFuenteDeMarca } from "@/lib/fuentesDeMarca";
import { resolveApiBase } from "@/lib/apiBase";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA MARCA DE ESTE ANFITRIÓN
 *
 * El CRM es UN SOLO artefacto que sirve a todos los anfitriones. Lo que cambia
 * entre `app.cguardpro.com` y `alpha.cguardpro.com` no es el paquete: son los
 * datos que este proveedor pide al arrancar.
 *
 * ── ANTES DEL PRIMER PINTADO CON MARCA ────────────────────────────────────
 * La secuencia es: HTML neutro → se pide el contexto → se aplica → se pinta la
 * aplicación. Nunca al revés. Si se pintara primero y se corrigiera después,
 * cada persona que entra por el anfitrión de un socio vería el logotipo de
 * CGuardPro durante unos milisegundos — y ése es exactamente el fallo que un
 * producto de marca blanca no se puede permitir: el cliente del socio
 * descubriría a su proveedor por un parpadeo.
 *
 * Mientras se espera hay un esqueleto NEUTRO, sin logotipo de nadie. No un
 * cargador con la marca de la plataforma.
 *
 * ── UNA SOLA CONDICIONAL ──────────────────────────────────────────────────
 * `scope === 'platform'` aparece UNA vez en todo el CRM, y es aquí dentro:
 * resolver los valores por defecto. Los componentes no preguntan si son un
 * socio o la plataforma — leen `useWhiteLabel()` y pintan lo que salga. Esparcir
 * la pregunta es como acaban apareciendo pantallas que se olvidaron de una rama.
 *
 * ── UN FALLO NUNCA DEJA LA PANTALLA EN BLANCO ─────────────────────────────
 * Red caída, respuesta malformada, 500, tiempo agotado: se pinta la identidad de
 * plataforma y se sigue. Esto es identidad visual, no una dependencia
 * operativa: alguien que sólo quiere fichar tiene que poder entrar aunque el
 * servicio de marca esté roto.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface SoporteDeMarca {
  email: string | null;
  url: string | null;
  phone: string | null;
}

export interface ContextoDeMarca {
  scope: "platform" | "reseller";
  resellerPublicId: string | null;
  platformName: string;
  logoUrl: string | null;
  /** The logo for dark backgrounds; without one, `logoUrl` is used in both themes. */
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  brandHue: number | null;
  brandChroma: number | null;
  /** A key of the closed typeface list (`lib/fuentesDeMarca`); null = platform. */
  fontFamily: string | null;
  loginTagline: string | null;
  support: SoporteDeMarca;
  showPlatformAttribution: boolean;
  /** La medición del SOCIO. En el anfitrión de la plataforma, los dos `null`. */
  analytics: { ga4: string | null; gtm: string | null };
}

/**
 * La identidad de CGuardPro. Es el valor por defecto y el de respaldo: lo que se
 * ve si el servicio no contesta, si contesta mal, o si este anfitrión no es de
 * ningún socio.
 */
export const MARCA_DE_PLATAFORMA: ContextoDeMarca = {
  scope: "platform",
  resellerPublicId: null,
  platformName: "CGuard Pro",
  logoUrl: null,
  logoDarkUrl: null,
  faviconUrl: null,
  brandHue: null,
  brandChroma: null,
  fontFamily: null,
  loginTagline: null,
  support: { email: null, url: null, phone: null },
  showPlatformAttribution: true,
  /* La medición de CGuardPro NO se sirve por esta vía: mandarla aquí la
     cargaría también en el anfitrión de un socio, contando sus visitas en
     nuestra cuenta. */
  analytics: { ga4: null, gtm: null },
};

/** Los recursos de plataforma, para cuando un socio no tiene los suyos. */
const LOGO_DE_PLATAFORMA = "/assets/logo/c-guard-logo.png";
const FAVICON_DE_PLATAFORMA = "/favicon-escudo.ico?v=2";
/** A transparent 1×1 icon: what a partner's tab shows when they have no art. */
const ICONO_VACIO = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

interface ValorDelContexto extends ContextoDeMarca {
  /**
   * El logotipo a pintar, ya resuelto — o `null` si no hay ninguno que se PUEDA
   * pintar. Ver `puedeUsarArteDePlataforma`.
   */
  logo: string | null;
  /**
   * ¿Se puede recurrir al arte de CGuardPro cuando al socio le falta el suyo?
   *
   * Sólo si es la plataforma, o si el socio conserva la atribución. Con
   * `showPlatformAttribution = false` el respaldo NO puede ser nuestro
   * logotipo ni nuestro favicon: eso convierte un hueco en su configuración en
   * una fuga de nuestra identidad, que es exactamente lo que esa bandera se
   * vendió para impedir. Sin arte propio se pinta el NOMBRE.
   */
  puedeUsarArteDePlataforma: boolean;
  /** `true` mientras se espera. Los consumidores rara vez lo necesitan. */
  cargando: boolean;
  /** El contexto no se pudo leer y se está usando el de plataforma. */
  degradado: boolean;
}

const Contexto = createContext<ValorDelContexto>({
  ...MARCA_DE_PLATAFORMA,
  logo: LOGO_DE_PLATAFORMA,
  puedeUsarArteDePlataforma: true,
  cargando: false,
  degradado: false,
});

/** La regla, en un solo sitio para que las dos mitades no puedan divergir. */
export function puedeUsarArteDePlataforma(ctx: ContextoDeMarca): boolean {
  /* Only the platform. A partner's customers never see our logo, favicon or
     name — not even with `showPlatformAttribution` on (owner's rule,
     2026-09-24): without art of their own, the partner's NAME is shown. */
  return ctx.scope === "platform";
}

export const useWhiteLabel = () => useContext(Contexto);

/**
 * Is this identity a partner's? For the few places that must CHOOSE a
 * destination rather than paint a value — e.g. whose support line to offer —
 * so the scope question still lives only in this file.
 */
export function esMarcaDeSocio(ctx: Pick<ContextoDeMarca, "scope">): boolean {
  return ctx.scope === "reseller";
}

/**
 * El objeto de contexto, para que la capa de identidad EFECTIVA pueda volver a
 * proveerlo con el valor ya contrastado contra la empresa de la sesión.
 *
 * Se exporta esto y no una segunda pareja de hook/proveedor a propósito: los
 * componentes ya leen `useWhiteLabel()`, y darles una fuente distinta sería
 * pedirle a cada pantalla que recuerde cuál de las dos mirar. Hay UNA identidad
 * y la capa de arriba decide cuál es.
 */
export { Contexto as ContextoDeMarcaReact };

/* ── Validación de lo que llega ──────────────────────────────────────────── */

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};

const numero = (v: unknown, min: number, max: number): number | null => {
  /* La FORMA antes que el valor: `Number([])` es 0 y `Number(true)` es 1, así
     que sin esto una respuesta corrupta entraría como un tono válido. */
  if (typeof v !== "number" && typeof v !== "string") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
};

/**
 * Respuesta cruda → contexto utilizable. Nunca lanza.
 *
 * Una respuesta a medias no se pinta a medias: cada campo que no cumpla se
 * sustituye por el de plataforma. Vale más un CRM con la marca de CGuardPro que
 * uno con el tono de un socio y el nombre de otro.
 */
export function normalizarContexto(crudo: unknown): ContextoDeMarca {
  if (!crudo || typeof crudo !== "object") return MARCA_DE_PLATAFORMA;
  const c = crudo as Record<string, any>;

  // El único sitio de todo el CRM donde se pregunta esto.
  if (c.scope !== "reseller") return MARCA_DE_PLATAFORMA;

  const s = (c.support && typeof c.support === "object" ? c.support : {}) as Record<string, any>;

  return {
    scope: "reseller",
    resellerPublicId: texto(c.resellerPublicId, 32),
    /* ── UN ANFITRIÓN DE SOCIO NUNCA SE LLAMA «CGuard Pro» ────────────────
       Esto era `?? MARCA_DE_PLATAFORMA.platformName`, y deshacía en el
       navegador la misma fuga que el servidor ya cierra: el resolutor cae al
       nombre comercial del socio y, si no hubiera ninguno, manda cadena vacía
       A PROPÓSITO. Volver a rellenarla aquí con nuestro nombre le enseña
       nuestra marca al cliente de un socio que paga por no verla — y en la
       pantalla de acceso, que es donde más se mira.
       Un anfitrión que YA resolvió a un socio es suyo: si no trae nombre, se
       queda sin nombre. Una cabecera sin texto es un defecto del socio; una
       que diga «CGuard Pro» sobre su anfitrión es un defecto nuestro. */
    platformName: texto(c.platformName, 60) ?? "",
    logoUrl: texto(c.logoUrl, 2083),
    logoDarkUrl: texto(c.logoDarkUrl, 2083),
    faviconUrl: texto(c.faviconUrl, 2083),
    brandHue: numero(c.brandHue, 0, 360),
    brandChroma: numero(c.brandChroma, 0, 0.4),
    fontFamily: esFuenteDeMarca(c.fontFamily) ? c.fontFamily : null,
    loginTagline: texto(c.loginTagline, 140),
    support: {
      email: texto(s.email, 255),
      url: texto(s.url, 255),
      phone: texto(s.phone, 50),
    },
    // Sólo un `false` explícito la quita. Cualquier otra cosa la deja puesta:
    // una respuesta rara no puede borrar una atribución que es obligatoria.
    showPlatformAttribution: c.showPlatformAttribution !== false,
    /* ── LA MEDICIÓN, VALIDADA OTRA VEZ AQUÍ ──────────────────────────────
       El servidor ya sólo guarda identificadores con forma de Google, pero
       este valor acaba dentro de la URL de un `<script>`: se vuelve a
       comprobar antes de usarlo. Un respaldo de más en el camino de un script
       cuesta una línea; el fallo que evita, no. */
    analytics: {
      ga4: idDeMedicion(c?.analytics?.ga4, /^G-[A-Z0-9]{6,18}$/),
      gtm: idDeMedicion(c?.analytics?.gtm, /^GTM-[A-Z0-9]{5,12}$/),
    },
  };
}

/** Un identificador de Google, o nada. Nunca lo que venga. */
function idDeMedicion(valor: unknown, patron: RegExp): string | null {
  const v = typeof valor === "string" ? valor.trim().toUpperCase() : "";
  return v && patron.test(v) ? v : null;
}

/* ── Aplicar la marca al documento ───────────────────────────────────────── */

function aplicarFavicon(url: string): void {
  try {
    const enlaces = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
    if (!enlaces.length) {
      const nuevo = document.createElement("link");
      nuevo.rel = "icon";
      nuevo.href = url;
      document.head.appendChild(nuevo);
      return;
    }
    // The home-screen icon too: the page ships ours by default.
    if (url !== FAVICON_DE_PLATAFORMA) {
      document.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]').forEach((l) => { l.href = url; });
    }
    enlaces.forEach((l) => {
      l.href = url;
      // El `sizes`/`type` del icono de plataforma no describe el del socio.
      l.removeAttribute("sizes");
      l.removeAttribute("type");
    });
  } catch {
    /* Un documento sin cabeza no puede impedir que la aplicación arranque. */
  }
}

export function aplicarMarca(ctx: ContextoDeMarca): void {
  // The partner's typeface, or the platform's back (null removes it).
  aplicarFuenteDeMarca(ctx.scope === "reseller" ? ctx.fontFamily : null);
  /* ── SE APLICA Y SE DESHACE ─────────────────────────────────────────────
     Esto ya no corre una sola vez al arrancar. Cuando se sabe de qué empresa
     es la sesión, la identidad puede CAMBIAR de socio a plataforma —una
     empresa directa entrando por el anfitrión de un socio, o la empresa de A
     bajo el anfitrión de B—, y entonces no basta con pintar lo nuevo: hay que
     quitar lo viejo. Un `--brand-h` que se queda, o un favicon que no se
     repone, es marca de un socio sobreviviendo en una pantalla que ya no es
     suya. Por eso cada rama tiene su contraria explícita. */
  try {
    // Un socio sin nombre publicado deja el título como esté: vale más el que
    // trae el HTML que escribir el nuestro sobre su anfitrión.
    if (ctx.platformName) {
      document.title = ctx.platformName;
      /* Para `usePageTitle`, que lo lee de aquí: lo llaman pantallas que no
         siempre cuelgan del proveedor. */
      document.documentElement.dataset.nombreDeMarca = ctx.platformName;
    } else {
      delete document.documentElement.dataset.nombreDeMarca;
    }
  } catch { /* idem */ }

  /* El tono y el croma, las MISMAS dos variables que usa el acento del usuario
     (ver `AccentContext`). Aquí se ponen como punto de partida del anfitrión:
     antes de entrar no hay usuario, así que lo que se ve es la marca del socio.
     Cuando alguien inicia sesión, su acento personal —que es una preferencia de
     cuenta— vuelve a mandar. Ese orden es el correcto: la marca identifica el
     producto, el acento es de quien lo usa. */
  try {
    if (ctx.brandHue !== null) {
      document.documentElement.style.setProperty("--brand-h", String(ctx.brandHue));
      /* ── LA MARCA DEL VECINO NO PUEDE PISARLA EL ACENTO DE FÁBRICA ────────
         `AccentContext` escribe estas dos variables con el acento del usuario,
         y cuando no hay ninguno guardado escribe el DE FÁBRICA (tono 88). Sin
         esta marca, ese valor por defecto pisaba el tono del socio en la
         pantalla de acceso — donde todavía no hay usuario que pueda tener una
         preferencia—, y el CRM del socio salía con el verde de CGuardPro.
         Esto NO le quita el acento a nadie: quien ha elegido uno lo conserva.
         Sólo dice «aquí ya hay un tono de anfitrión, no lo tapes con el de
         fábrica». En un anfitrión de plataforma la marca no se pone y el acento
         por defecto se aplica igual que siempre. */
      document.documentElement.dataset.marcaDeAnfitrion = "1";
    } else {
      /* Sin tono propio se DEVUELVE el control: se quita la propiedad en línea
         para que mande otra vez el valor de `tokens.css`, y se retira la marca
         para que el acento de fábrica vuelva a poder aplicarse. */
      document.documentElement.style.removeProperty("--brand-h");
      delete document.documentElement.dataset.marcaDeAnfitrion;
      /* …y si esta persona TIENE acento elegido, se le devuelve. Quitar la
         propiedad a secas borraba su color: este efecto corre DESPUÉS del de
         `AccentContext` cuando la apariencia llega de la cuenta (medido con
         marca de tiempo en un navegador limpio: el acento a los 361 ms, este
         borrado a los 443), así que quien entraba desde otro equipo veía el CRM
         de fábrica con su elección bien guardada en la base. Soltar el mando no
         es borrar lo de otro. */
      restaurarAccentDelUsuario();
    }
    if (ctx.brandChroma !== null) {
      document.documentElement.style.setProperty("--brand-c", String(ctx.brandChroma));
    } else {
      document.documentElement.style.removeProperty("--brand-c");
      restaurarAccentDelUsuario();
    }
  } catch { /* idem */ }

  /* El favicon del socio, o el nuestro SÓLO si se nos permite aparecer. La
     cadena canónica es `favicon → marca → null`; el contexto público no lleva
     la marca compacta, así que aquí es `favicon → null`. Dejar el escudo de
     CGuardPro en la pestaña de un socio sin atribución delata al proveedor en
     el sitio más visible y más permanente que tiene un navegador. */
  const respaldo = puedeUsarArteDePlataforma(ctx) ? FAVICON_DE_PLATAFORMA : null;
  /* A partner without a favicon: their logo; without that either, an empty
     icon — the page's static shield must not stay in their tab. */
  const delSocio = ctx.scope === "reseller" ? (ctx.logoUrl || ICONO_VACIO) : null;
  const favicon = ctx.faviconUrl || delSocio || respaldo;
  if (favicon) aplicarFavicon(favicon);
  /* The home-screen icon of a partner with art: rendered square by the server
     (`/api/platform/icon/180`), so iOS does not fill a transparent logo
     with black. */
  if (esMarcaDeSocio(ctx) && (ctx.faviconUrl || ctx.logoUrl)) {
    try {
      document.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]').forEach((l) => {
        l.href = "/api/platform/icon/180";
      });
    } catch { /* idem */ }
  }
}

/* ── La petición ─────────────────────────────────────────────────────────── */

const API = (resolveApiBase() as string | undefined) || "";
const TIEMPO_MAXIMO_MS = 4000;

/**
 * ── ESTA PETICIÓN VA AL MISMO ORIGEN, Y ES TODO EL ASUNTO ─────────────────
 * El resolutor decide la marca por el `Host` de la petición, y con razón: es el
 * único dato que no escribe el cliente. Pero el CRM habla con una API de
 * anfitrión FIJO (`VITE_API_URL` = `https://api.cguardpro.com/api`), así que
 * esta petición llegaba con `Host: api.cguardpro.com` —un anfitrión de
 * plataforma— y el servidor respondía «plataforma» CORRECTAMENTE. El anfitrión
 * por el que navega la persona se perdía por el camino.
 *
 * Resultado: la marca blanca no podía funcionar NUNCA en el navegador, por bien
 * que estuviera el servidor. No se vio antes porque comprobarlo con `curl -H
 * "Host: ..."` pone a mano justo el dato que el navegador no manda.
 *
 * Por eso ESTA petición —y sólo ésta— va al mismo origen: es la única cuyo
 * propósito es preguntar «¿de quién es el anfitrión en el que estoy?». El resto
 * del CRM sigue hablando con la API de siempre.
 *
 * El respaldo existe para los envoltorios que NO son un sitio web: el CRM de
 * escritorio sirve desde `app://crm` y las apps móviles desde
 * `capacitor://localhost`, y ahí el mismo origen no es nadie. Todos ésos son
 * plataforma, que es lo que responde el anfitrión fijo.
 */
function urlsDelContexto(): string[] {
  /* The partner's login preview reads the DRAFT through a signed token; the
     Host still decides everything else. */
  const token = tokenDeVistaPrevia();
  const sufijo = token ? `/preview?token=${encodeURIComponent(token)}` : "";
  const mismoOrigen = "/api/platform/context" + sufijo;
  const fijo = `${API}/platform/context` + sufijo;
  try {
    const esWeb = /^https?:$/.test(window.location.protocol);
    const esEscritorio = !!(window as any).cguardDesktop;
    if (esWeb && !esEscritorio) return [mismoOrigen, fijo];
  } catch { /* sin `window`: sólo el fijo */ }
  return [fijo];
}

/* ── What `index.html` already did ────────────────────────────────────────
   The inline script in `index.html` runs before the bundle. On a host that is
   not ours it starts `/api/platform/context` right away and reads the
   partner's last-known brand from this browser. Before, the request only left
   once the whole bundle had downloaded and run (6.3 s into a cold load on
   portal.entecdigital.mx, 2026-10-22), and the partner's logo after that. */

interface MarcaTemprana {
  /** The inline script's verdict: is this one of OUR hosts? */
  ours: boolean;
  /** The partner's last-known brand on this host, raw (validate before use). */
  cached: unknown;
  /** The brand request the HTML already started, or null. */
  request: Promise<unknown> | null;
}

function marcaTemprana(): MarcaTemprana | null {
  try {
    const m = (window as any).__cgMarca;
    return m && typeof m === "object" ? (m as MarcaTemprana) : null;
  } catch {
    return null;
  }
}

/** The request the HTML started, taken ONCE (a second caller asks again). */
function tomarPeticionTemprana(): Promise<unknown> | null {
  const m = marcaTemprana();
  if (!m?.request) return null;
  const p = m.request;
  m.request = null;
  return p;
}

const CLAVE_GUARDADA = "cg-marca:";

function claveDeEsteAnfitrion(): string | null {
  try {
    const h = String(window.location.hostname || "").toLowerCase();
    return h ? CLAVE_GUARDADA + h : null;
  } catch {
    return null;
  }
}

/**
 * The partner's last-known brand on THIS host, validated like a fresh answer.
 * `null` on our own hosts, in preview mode, or when nothing is stored.
 *
 * It is a warm start, never the authority: the fresh answer replaces it as
 * soon as it arrives. It lives in this origin's storage, so a partner's brand
 * can only ever come back on the host that served it.
 */
export function marcaGuardada(): ContextoDeMarca | null {
  if (tokenDeVistaPrevia()) return null;
  const m = marcaTemprana();
  if (m?.ours) return null;
  let crudo: unknown = m?.cached ?? null;
  if (!crudo) {
    try {
      const clave = claveDeEsteAnfitrion();
      const g = clave ? JSON.parse(localStorage.getItem(clave) || "null") : null;
      crudo = g && g.v === 1 ? g.ctx : null;
    } catch {
      crudo = null;
    }
  }
  if (!crudo) return null;
  const ctx = normalizarContexto(crudo);
  /* Only a partner's brand is worth keeping: the platform's is the default
     and needs no cache. A stored value that no longer reads as a partner's is
     ignored. */
  return ctx.resellerPublicId ? ctx : null;
}

/** Remember (or forget) this host's brand for the next cold load. */
export function recordarMarca(ctx: ContextoDeMarca): void {
  if (tokenDeVistaPrevia()) return; // a draft is not the published brand
  try {
    const clave = claveDeEsteAnfitrion();
    if (!clave) return;
    if (ctx.resellerPublicId) {
      localStorage.setItem(clave, JSON.stringify({ v: 1, at: Date.now(), ctx }));
    } else {
      localStorage.removeItem(clave);
    }
  } catch {
    /* Private mode or full storage: the next load just starts cold. */
  }
}

/**
 * Pide el contexto. Nunca lanza y nunca se queda colgada.
 *
 * El tiempo máximo es corto A PROPÓSITO. Esto bloquea el primer pintado, así que
 * un servicio lento no puede convertirse en una pantalla en blanco de quince
 * segundos: a los cuatro se sigue con la marca de plataforma, que es
 * exactamente lo que se veía antes de que existiera todo esto.
 */
export async function pedirContexto(): Promise<{ ctx: ContextoDeMarca; degradado: boolean }> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);

  try {
    /* The request `index.html` already started, under the same time budget. */
    const temprana = tokenDeVistaPrevia() ? null : tomarPeticionTemprana();
    if (temprana) {
      const crudo = await Promise.race([
        temprana,
        new Promise<null>((resolve) => {
          control.signal.addEventListener("abort", () => resolve(null));
        }),
      ]);
      if (crudo && typeof crudo === "object") {
        return { ctx: normalizarContexto(crudo), degradado: false };
      }
    }
    /* Se prueban en orden bajo UN SOLO presupuesto de tiempo: el mismo origen
       primero, y el anfitrión fijo sólo si aquél no está (escritorio, móvil, o
       un despliegue sin `/api` delante). */
    for (const url of urlsDelContexto()) {
      try {
        const r = await fetch(url, {
          signal: control.signal,
          credentials: "omit",
          headers: { Accept: "application/json" },
        });
        if (!r.ok) continue;
        const crudo = await r.json();
        /* Que caiga a plataforma NO es degradarse: un anfitrión de plataforma
           responde `platform` y eso es la respuesta correcta, no un fallo. */
        return { ctx: normalizarContexto(crudo), degradado: false };
      } catch {
        if (control.signal.aborted) break;
        /* Este camino no está; se prueba el siguiente. */
      }
    }
    return { ctx: respaldoSinRed(), degradado: true };
  } catch {
    return { ctx: respaldoSinRed(), degradado: true };
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * What to paint when the brand service cannot be reached.
 *
 * Still the platform as the last resort — someone who only wants to punch in
 * must be able to sign in — but a partner's host whose brand this browser has
 * already seen keeps THAT brand. A slow mobile network on a partner's login
 * used to show our logo exactly when the partner could least explain it.
 */
export function respaldoSinRed(): ContextoDeMarca {
  return marcaGuardada() ?? MARCA_DE_PLATAFORMA;
}

/* ── El proveedor ────────────────────────────────────────────────────────── */

/**
 * Un esqueleto sin marca de nadie.
 *
 * Sin logotipo, sin nombre y sin color de producto: sólo la superficie. Un
 * cargador con el escudo de CGuardPro delataría al proveedor en el anfitrión de
 * un socio, que es justo lo que esto evita.
 */
export function EsqueletoNeutro() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={i18n.t("ui.App.cargando", "Cargando")}
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        /* El lienzo del sistema, no un color inventado. Ver `tokens.css`. */
        background: "var(--canvas, #0b0d12)",
      }}
    >
      {/* `animate-spin` es de Tailwind y ya está en el paquete. Antes esto
          inyectaba su propio `@keyframes` en un `<style>`: funcionaba, pero
          metía CSS en el documento desde un componente de marca — justo la
          forma que la fase 6 prohíbe, aunque aquí la cadena fuera fija. Una
          regla que se cumple «salvo cuando no importa» no es una regla. */}
      <span
        aria-hidden="true"
        className="animate-spin"
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "2px solid currentColor",
          borderTopColor: "transparent",
          opacity: 0.35,
        }}
      />
    </div>
  );
}

export function WhiteLabelProvider({ children }: { children: ReactNode }) {
  /* A partner's host this browser already knows paints ITS brand from the
     first frame (stale-while-revalidate); everyone else waits on the neutral
     skeleton exactly as before. */
  const [ctx, setCtx] = useState<ContextoDeMarca | null>(() => {
    const guardada = marcaGuardada();
    if (guardada) aplicarMarca(guardada);
    return guardada;
  });
  const [degradado, setDegradado] = useState(false);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    (async () => {
      const r = await pedirContexto();
      if (!montado.current) return;
      /* Only an answer from the server is remembered; a fallback is not. */
      if (!r.degradado) recordarMarca(r.ctx);
      aplicarMarca(r.ctx);
      /* La medición del socio, en cuanto se sabe de quién es este anfitrión.
         Antes no: cargarla con el contexto de plataforma metería las visitas
         de nuestro CRM en la cuenta de un socio. */
      cargarAnaliticaDeMarca(r.ctx.analytics);
      setDegradado(r.degradado);
      setCtx(r.ctx);
    })();
    return () => { montado.current = false; };
  }, []);

  /* Preview mode: the partner's panel sends what they are changing right now
     (colour, name, tagline) so both iframes follow the sliders live. Only from
     the page that embeds this one, and only these fields. A message that
     arrives before the identity has loaded is kept and applied on load. */
  const pendiente = useRef<Record<string, unknown> | null>(null);
  const aplicarMensaje = (prev: ContextoDeMarca, d: Record<string, unknown>): ContextoDeMarca => {
    const siguiente = normalizarContexto({
      ...prev,
      scope: "reseller",
      brandHue: d.brandHue ?? prev.brandHue,
      brandChroma: d.brandChroma ?? prev.brandChroma,
      platformName: typeof d.platformName === "string" ? d.platformName : prev.platformName,
      loginTagline: d.loginTagline === undefined ? prev.loginTagline : d.loginTagline,
      fontFamily: d.fontFamily === undefined ? prev.fontFamily : d.fontFamily,
    });
    aplicarMarca(siguiente);
    return siguiente;
  };

  useEffect(() => {
    if (!tokenDeVistaPrevia()) return;
    const alRecibir = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || d.tipo !== TIPO_DE_MENSAJE) return;
      setCtx((prev) => {
        if (!prev) { pendiente.current = d; return prev; }
        return aplicarMensaje(prev, d);
      });
    };
    window.addEventListener("message", alRecibir);
    return () => window.removeEventListener("message", alRecibir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Once the identity is in: apply what arrived early, then tell the panel
     this page is ready (it answers with the current draft values). */
  const listo = ctx !== null;
  useEffect(() => {
    if (!listo || !tokenDeVistaPrevia()) return;
    if (pendiente.current) {
      const d = pendiente.current;
      pendiente.current = null;
      setCtx((prev) => (prev ? aplicarMensaje(prev, d) : prev));
    }
    try { window.parent.postMessage({ tipo: `${TIPO_DE_MENSAJE}:lista` }, "*"); } catch { /* not embedded */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo]);

  // Todavía no hay respuesta: esqueleto neutro, nunca la marca de nadie.
  if (!ctx) return <EsqueletoNeutro />;

  const permitido = puedeUsarArteDePlataforma(ctx);
  const valor: ValorDelContexto = {
    ...ctx,
    logo: ctx.logoUrl || (permitido ? LOGO_DE_PLATAFORMA : null),
    puedeUsarArteDePlataforma: permitido,
    cargando: false,
    degradado,
  };

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export default WhiteLabelProvider;
