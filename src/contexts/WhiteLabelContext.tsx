import {
  createContext, useContext, useEffect, useRef, useState, type ReactNode,
} from "react";

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
  faviconUrl: string | null;
  brandHue: number | null;
  brandChroma: number | null;
  loginTagline: string | null;
  support: SoporteDeMarca;
  showPlatformAttribution: boolean;
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
  faviconUrl: null,
  brandHue: null,
  brandChroma: null,
  loginTagline: null,
  support: { email: null, url: null, phone: null },
  showPlatformAttribution: true,
};

/** Los recursos de plataforma, para cuando un socio no tiene los suyos. */
const LOGO_DE_PLATAFORMA = "/assets/logo/c-guard-logo.png";
const FAVICON_DE_PLATAFORMA = "/favicon-escudo.ico?v=2";

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
  return ctx.scope === "platform" || ctx.showPlatformAttribution;
}

export const useWhiteLabel = () => useContext(Contexto);

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
    faviconUrl: texto(c.faviconUrl, 2083),
    brandHue: numero(c.brandHue, 0, 360),
    brandChroma: numero(c.brandChroma, 0, 0.4),
    loginTagline: texto(c.loginTagline, 140),
    support: {
      email: texto(s.email, 255),
      url: texto(s.url, 255),
      phone: texto(s.phone, 50),
    },
    // Sólo un `false` explícito la quita. Cualquier otra cosa la deja puesta:
    // una respuesta rara no puede borrar una atribución que es obligatoria.
    showPlatformAttribution: c.showPlatformAttribution !== false,
  };
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

function aplicarMarca(ctx: ContextoDeMarca): void {
  try {
    // Un socio sin nombre publicado deja el título como esté: vale más el que
    // trae el HTML que escribir el nuestro sobre su anfitrión.
    if (ctx.platformName) document.title = ctx.platformName;
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
    }
    if (ctx.brandChroma !== null) {
      document.documentElement.style.setProperty("--brand-c", String(ctx.brandChroma));
    }
  } catch { /* idem */ }

  /* El favicon del socio, o el nuestro SÓLO si se nos permite aparecer. La
     cadena canónica es `favicon → marca → null`; el contexto público no lleva
     la marca compacta, así que aquí es `favicon → null`. Dejar el escudo de
     CGuardPro en la pestaña de un socio sin atribución delata al proveedor en
     el sitio más visible y más permanente que tiene un navegador. */
  const respaldo = puedeUsarArteDePlataforma(ctx) ? FAVICON_DE_PLATAFORMA : null;
  const favicon = ctx.faviconUrl || respaldo;
  if (favicon) aplicarFavicon(favicon);
}

/* ── La petición ─────────────────────────────────────────────────────────── */

const API = (import.meta.env.VITE_API_URL as string | undefined) || "";
const TIEMPO_MAXIMO_MS = 4000;

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
    const r = await fetch(`${API}/platform/context`, {
      signal: control.signal,
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return { ctx: MARCA_DE_PLATAFORMA, degradado: true };

    const crudo = await r.json();
    const ctx = normalizarContexto(crudo);
    /* Que caiga a plataforma NO es degradarse: un anfitrión de plataforma
       responde `platform` y eso es la respuesta correcta, no un fallo. */
    return { ctx, degradado: false };
  } catch {
    return { ctx: MARCA_DE_PLATAFORMA, degradado: true };
  } finally {
    clearTimeout(reloj);
  }
}

/* ── El proveedor ────────────────────────────────────────────────────────── */

/**
 * Un esqueleto sin marca de nadie.
 *
 * Sin logotipo, sin nombre y sin color de producto: sólo la superficie. Un
 * cargador con el escudo de CGuardPro delataría al proveedor en el anfitrión de
 * un socio, que es justo lo que esto evita.
 */
function EsqueletoNeutro() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Cargando"
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
  const [ctx, setCtx] = useState<ContextoDeMarca | null>(null);
  const [degradado, setDegradado] = useState(false);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    (async () => {
      const r = await pedirContexto();
      if (!montado.current) return;
      aplicarMarca(r.ctx);
      setDegradado(r.degradado);
      setCtx(r.ctx);
    })();
    return () => { montado.current = false; };
  }, []);

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
