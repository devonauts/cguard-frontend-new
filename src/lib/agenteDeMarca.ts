import { useEffect, useState } from "react";

import i18n from "@/i18n";
import api from "@/lib/api";
import { esAnfitrionDePlataforma } from "@/lib/apiBase";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUIÉN ES EL ASISTENTE EN ESTA EMPRESA
 *
 * El CRM se sirve también desde el dominio de un socio, con su marca. El
 * asistente es la pieza que más se mira de toda la pantalla, y hasta ahora se
 * llamaba «VigIA» pasara lo que pasara: el nombre de su proveedor, dentro de un
 * producto que al cliente del socio se le vende como propio.
 *
 * ── DE DÓNDE SALE, Y POR QUÉ NO DEL CONTEXTO DE MARCA ─────────────────────
 * Todo lo demás de la marca blanca sale de `useWhiteLabel()`, que se resuelve
 * por el `Host`. Esto NO, y es deliberado: el servidor resuelve la identidad
 * del asistente por la EMPRESA (de qué socio es), porque el mismo nombre firma
 * WhatsApps y correos que salen de un cron, donde no hay anfitrión ninguno.
 * Preguntando aquí por la empresa, la pantalla dice exactamente lo mismo que
 * responde el agente. Dos fuentes para un mismo nombre es una divergencia
 * esperando a ocurrir.
 *
 * ── NUNCA DEJA LA PANTALLA EN BLANCO ──────────────────────────────────────
 * Se devuelve el valor por defecto de inmediato y se reemplaza cuando llega la
 * respuesta. Si la petición falla, se queda el de siempre: un asistente con el
 * nombre equivocado es un problema de marca; un asistente que no se pinta es un
 * producto roto.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface AgenteDeMarca {
  nombre: string;
  /** La frase de la ventana vacía. `null` = la de siempre. */
  saludo: string | null;
  avatarUrl: string | null;
  /** Silhouette key (see `formasDelAgente`). The shield only on our companies. */
  forma: string;
  /** Icon inside the shape (see `formasDelAgente`), or null for initials. */
  icono: string | null;
}

/** Is this one of OUR hosts? Unknown (no `window`) counts as not ours. */
function anfitrionPropio(): boolean {
  try {
    return esAnfitrionDePlataforma(
      window.location.hostname,
      import.meta.env.VITE_API_URL as string | undefined,
    );
  } catch {
    return false;
  }
}

/* Before the answer arrives: the shield only on our own planes. On a partner's
   host the first paint is already the neutral orb, never our shield. */
function formaInicial(): string {
  return anfitrionPropio() ? "escudo" : "orbe";
}

/**
 * El nombre por mercado (decisión del dueño, 2026-10-08): «VigIA» en los
 * países hispanohablantes y «Vigia AI» en el resto. Lo decide el SERVIDOR por
 * el país de la empresa; aquí sólo se adivina para el primer pintado, por el
 * idioma del navegador, y la respuesta lo corrige enseguida.
 */
export const NOMBRE_HISPANO = "VigIA";
export const NOMBRE_GLOBAL = "Vigia AI";

/** The neutral word a partner's host shows until its assistant's name arrives. */
const CLAVE_NOMBRE_NEUTRO = "vigia.nombreNeutro";

function nombreInicial(): string {
  /* On a partner's host our assistant's name must not flash before
     `/assistant/identity` answers: a neutral, localized «Assistant». */
  if (!anfitrionPropio()) {
    const neutro = i18n.t(CLAVE_NOMBRE_NEUTRO, { defaultValue: "Asistente" });
    return typeof neutro === "string" && neutro && neutro !== CLAVE_NOMBRE_NEUTRO
      ? neutro
      : "Asistente";
  }
  try {
    return /^es\b/i.test(navigator.language || "") ? NOMBRE_HISPANO : NOMBRE_GLOBAL;
  } catch {
    return NOMBRE_HISPANO;
  }
}

/** Lo nuestro, y lo que se pinta mientras llega la respuesta. */
export const AGENTE_POR_DEFECTO: AgenteDeMarca = {
  /* A getter, read at paint time: this module loads before the language
     catalog does, so a value fixed at import would be the untranslated
     fallback on a partner's host. */
  get nombre() {
    return nombreInicial();
  },
  saludo: null,
  avatarUrl: null,
  forma: formaInicial(),
  icono: null,
};

const formaValida = (v: unknown): string =>
  typeof v === "string" && /^[a-z]{3,16}$/.test(v)
    ? v
    : AGENTE_POR_DEFECTO.forma;

const CLAVE = "vigia_identidad";

/* Una por sesión y por empresa. El widget se monta dentro del armazón, que se
   vuelve a montar en cada navegación: sin esto, sería una petición por clic. */
let enMemoria: { tid: string; valor: AgenteDeMarca } | null = null;
let enVuelo: Promise<AgenteDeMarca> | null = null;

/** Lo último que se supo, para pintar sin parpadeo antes de que llegue nada. */
export function agenteGuardado(tenantId: string): AgenteDeMarca {
  if (enMemoria && enMemoria.tid === tenantId) return enMemoria.valor;
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return AGENTE_POR_DEFECTO;
    const d = JSON.parse(crudo);
    if (d?.tid !== tenantId) return AGENTE_POR_DEFECTO;
    return {
      nombre:
        typeof d.nombre === "string" && d.nombre
          ? d.nombre
          : AGENTE_POR_DEFECTO.nombre,
      saludo: typeof d.saludo === "string" && d.saludo ? d.saludo : null,
      avatarUrl:
        typeof d.avatarUrl === "string" && d.avatarUrl ? d.avatarUrl : null,
      forma: formaValida(d.forma),
      icono: typeof d.icono === "string" && d.icono ? d.icono : null,
    };
  } catch {
    /* Modo privado, almacenamiento lleno, JSON de otra versión. Cualquiera de
       los tres deja el asistente con su nombre de siempre, que funciona. */
    return AGENTE_POR_DEFECTO;
  }
}

/** Lo pregunta al servidor. Nunca lanza. */
export async function cargarAgente(tenantId: string): Promise<AgenteDeMarca> {
  if (!tenantId) return AGENTE_POR_DEFECTO;
  if (enMemoria && enMemoria.tid === tenantId) return enMemoria.valor;
  if (enVuelo) return enVuelo;

  enVuelo = (async () => {
    try {
      const resp: any = await api.get(
        `/tenant/${tenantId}/assistant/identity`,
        {
          toast: { silentError: true },
        } as any,
      );
      const d = resp && resp.data !== undefined ? resp.data : resp;
      const valor: AgenteDeMarca = {
        nombre:
          typeof d?.nombre === "string" && d.nombre
            ? d.nombre
            : AGENTE_POR_DEFECTO.nombre,
        saludo: typeof d?.saludo === "string" && d.saludo ? d.saludo : null,
        avatarUrl:
          typeof d?.avatarUrl === "string" && d.avatarUrl ? d.avatarUrl : null,
        forma: formaValida(d?.forma),
        icono: typeof d?.icono === "string" && d.icono ? d.icono : null,
      };
      enMemoria = { tid: tenantId, valor };
      for (const o of oyentes) o(valor);
      try {
        localStorage.setItem(
          CLAVE,
          JSON.stringify({ tid: tenantId, ...valor }),
        );
      } catch {
        /* sin almacenamiento se vive: es sólo para no parpadear */
      }
      return valor;
    } catch {
      return AGENTE_POR_DEFECTO;
    } finally {
      enVuelo = null;
    }
  })();

  return enVuelo;
}

/**
 * Lo que cabe dentro del escudo de la burbuja cerrada.
 *
 * El escudo mide 48 unidades de ancho y la palabra va a 11 px: «VigIA» entra
 * justo, y ahí terminaba la historia mientras el nombre era siempre el nuestro.
 * Un socio puede llamarlo «Sentinel Inteligencia Operativa», y eso no se
 * encoge: se convierte en una mancha gris de dos píxeles de alto.
 *
 * Así que hasta seis caracteres se escribe el nombre entero, y a partir de ahí
 * se hacen siglas. Recortar con puntos suspensivos —«Sentin…»— se lee como un
 * error de la aplicación; «SIO» se lee como una marca.
 */
export function siglaDelAgente(nombre: string): string {
  const limpio = (nombre || "").trim().replace(/\s+/g, " ");
  if (!limpio) return AGENTE_POR_DEFECTO.nombre;
  if (limpio.length <= 6) return limpio;

  /* «Vigia AI» se lee «Vigia», no «VA»: la coletilla AI/IA se cae cuando lo
     que queda cabe entero. «Sentinel IA» sigue siendo «SI». */
  const sinCola = limpio.replace(/\s+(AI|IA)$/i, "");
  if (sinCola !== limpio && sinCola.length <= 6) return sinCola;

  const palabras = limpio.split(" ").filter(Boolean);
  if (palabras.length > 1) {
    return palabras
      .slice(0, 3)
      .map((p) => p[0])
      .join("")
      .toUpperCase();
  }
  /* Una sola palabra larga: sus tres primeras letras, con la caja que tenga.
     «SEN» en versalitas se lee peor que «Sen» cuando el nombre era «Sentinel». */
  return limpio.slice(0, 3);
}

/* ── Quien quiera enterarse ───────────────────────────────────────────────
   El nombre lo escriben también pantallas que NO son el widget —los ajustes,
   el panel de notificaciones, el monedero—, y todas se montan antes de que
   llegue la respuesta. Sin aviso, cada una pintaría «VigIA» hasta que el
   usuario navegara a otra parte. */
const oyentes = new Set<(a: AgenteDeMarca) => void>();

/**
 * El asistente de esta empresa, para pintarlo en cualquier pantalla.
 *
 * Devuelve lo último que se supo de inmediato —sin parpadeo— y se vuelve a
 * pintar cuando llega la respuesta. NO pide nada: de eso se encarga el widget,
 * que está montado siempre. Una pantalla de ajustes no tiene por qué provocar
 * una petición para escribir una etiqueta.
 */
export function useAgente(): AgenteDeMarca {
  const [valor, setValor] = useState<AgenteDeMarca>(() =>
    agenteGuardado(tenantActual()),
  );
  useEffect(() => {
    oyentes.add(setValor);
    return () => {
      oyentes.delete(setValor);
    };
  }, []);
  return valor;
}

function tenantActual(): string {
  try {
    return localStorage.getItem("tenantId") || "";
  } catch {
    return "";
  }
}

/** Al cambiar de empresa o al cerrar sesión. */
export function olvidarAgente(): void {
  enMemoria = null;
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* da igual */
  }
  for (const o of oyentes) o(AGENTE_POR_DEFECTO);
}

export default {
  cargarAgente,
  agenteGuardado,
  olvidarAgente,
  siglaDelAgente,
  useAgente,
  AGENTE_POR_DEFECTO,
};
