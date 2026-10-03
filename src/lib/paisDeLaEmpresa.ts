/**
 * ────────────────────────────────────────────────────────────────────────────
 * EL PAÍS DE LA EMPRESA MANDA EN SUS DATOS
 *
 * Pedido del dueño (2026-10-03), con el enfoque global: «Razón social» y «RUC»
 * son palabras de Ecuador. Una empresa de Texas busca su «Legal business name»
 * y su EIN; una de Alemania, su «Firmenname» y su Steuernummer. Así que el
 * asistente pregunta el país PRIMERO, y de él salen:
 *
 *   - la lista de países, con su nombre en el idioma de quien la lee
 *     (`Intl.DisplayNames`, sin tablas propias que se queden viejas);
 *   - cómo se llama allí la razón social y el identificador fiscal;
 *   - la zona horaria, sacada de las COORDENADAS (de la dirección, o del centro
 *     del país mientras no hay dirección), no de un nombre de país: Estados
 *     Unidos, México o Brasil tienen varias.
 *
 * La etiqueta va en el idioma de la pantalla. Si ese idioma no es el del país,
 * se añade entre paréntesis el término local («Tax ID (RFC)»), que es el que
 * la persona tiene escrito en sus papeles.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { getCountries } from "libphonenumber-js";
import tzLookup from "@photostructure/tz-lookup";

import { taxIdLabelFor } from "@/lib/validators/id";

export type PaisOpcion = { code: string; nombre: string; bandera: string };

/** 🇲🇽 a partir de «MX». */
export function bandera(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

/** Nombre del país en el idioma pedido; el código si el navegador no sabe. */
export function nombreDePais(code: string, idioma: string): string {
  try {
    return (
      new Intl.DisplayNames([idioma], { type: "region" }).of(
        code.toUpperCase(),
      ) || code
    );
  } catch {
    return code;
  }
}

/** Todos los países, en el idioma de quien los lee y ordenados por nombre. */
export function listaDePaises(idioma: string): PaisOpcion[] {
  const col = (() => {
    try {
      return new Intl.Collator(idioma);
    } catch {
      return new Intl.Collator();
    }
  })();

  return (getCountries() as string[])
    .map((code) => ({
      code,
      nombre: nombreDePais(code, idioma),
      bandera: bandera(code),
    }))
    .sort((a, b) => col.compare(a.nombre, b.nombre));
}

/** El idioma en que el país escribe sus papeles, si es uno de los nuestros. */
const IDIOMA_DEL_PAIS: Record<string, string> = {
  ...Object.fromEntries(
    [
      "EC", "MX", "CO", "PE", "AR", "CL", "UY", "PY", "BO", "VE", "CR", "PA",
      "GT", "DO", "SV", "HN", "NI", "ES", "PR", "CU",
    ].map((c) => [c, "es"]),
  ),
  BR: "pt",
  PT: "pt",
  AO: "pt",
  MZ: "pt",
  ...Object.fromEntries(
    ["US", "GB", "IE", "CA", "AU", "NZ", "ZA", "IN", "SG", "PH", "NG", "KE"].map(
      (c) => [c, "en"],
    ),
  ),
  FR: "fr",
  LU: "fr",
  MC: "fr",
  DE: "de",
  AT: "de",
  IT: "it",
  SM: "it",
  NL: "nl",
  PL: "pl",
};

/** Cómo se llama la razón social en el idioma del país. */
const RAZON_SOCIAL_LOCAL: Record<string, string> = {
  es: "Razón social",
  pt: "Razão social",
  en: "Legal business name",
  fr: "Raison sociale",
  de: "Firmenname laut Handelsregister",
  it: "Ragione sociale",
  nl: "Statutaire naam",
  pl: "Pełna nazwa firmy",
};

const RAZON_SOCIAL_POR_PAIS: Record<string, string> = {
  PT: "Denominação social",
  GB: "Registered company name",
  IE: "Registered company name",
};

/** Quita el paréntesis cuando el término local ya es lo que se lee. */
function conTerminoLocal(
  generico: string,
  local: string | null,
  idiomaPantalla: string,
  idiomaPais?: string,
): string {
  if (!local) return generico;
  if (idiomaPais && idiomaPantalla.slice(0, 2) === idiomaPais) return local;

  return `${generico} (${local})`;
}

export type TerminosFiscales = {
  /** Etiqueta del nombre legal, ya en el idioma de la pantalla. */
  razonSocial: string;
  /** Etiqueta del identificador fiscal, ya en el idioma de la pantalla. */
  idFiscal: string;
  /** El término local a secas («RFC», «Razón social»), para textos cortos. */
  razonSocialLocal: string | null;
  idFiscalLocal: string | null;
};

/**
 * Las dos etiquetas fiscales para un país, en el idioma de la pantalla.
 * `generico` trae los dos textos neutros ya traducidos.
 */
export function terminosFiscales(
  pais: string | null | undefined,
  idiomaPantalla: string,
  generico: { razonSocial: string; idFiscal: string },
): TerminosFiscales {
  const code = (pais || "").toUpperCase();
  const idiomaPais = IDIOMA_DEL_PAIS[code];
  const razonLocal =
    RAZON_SOCIAL_POR_PAIS[code] ||
    (idiomaPais ? RAZON_SOCIAL_LOCAL[idiomaPais] : null) ||
    null;
  const fiscalLocal = code ? taxIdLabelFor(code) : null;

  return {
    razonSocial: conTerminoLocal(
      generico.razonSocial,
      razonLocal,
      idiomaPantalla,
      idiomaPais,
    ),
    // El acrónimo fiscal se entiende en cualquier idioma: va siempre, con el
    // genérico delante sólo si la pantalla no está en el idioma del país.
    idFiscal: conTerminoLocal(
      generico.idFiscal,
      fiscalLocal,
      idiomaPantalla,
      idiomaPais,
    ),
    razonSocialLocal: razonLocal,
    idFiscalLocal: fiscalLocal,
  };
}

/** Zona horaria IANA de unas coordenadas; `null` si no son válidas. */
export function zonaPorCoordenadas(
  lat: number | string | null | undefined,
  lng: number | string | null | undefined,
): string | null {
  const la = typeof lat === "string" ? parseFloat(lat) : lat;
  const lo = typeof lng === "string" ? parseFloat(lng) : lng;

  if (
    la == null ||
    lo == null ||
    !Number.isFinite(la) ||
    !Number.isFinite(lo) ||
    Math.abs(la) > 90 ||
    Math.abs(lo) > 180
  )
    return null;
  try {
    return tzLookup(la, lo) || null;
  } catch {
    return null;
  }
}
