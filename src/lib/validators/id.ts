export function digitsOnly(value: string) {
  return (value || "").replace(/\D/g, "");
}

// Valida cédula ecuatoriana (10 dígitos)
export function validateEcuadorCedula(cedula: string) {
  const ced = digitsOnly(cedula);

  if (!/^[0-9]{10}$/.test(ced)) return false;

  const province = Number(ced.substring(0, 2));

  if (province < 1 || province > 24) return false;

  const digits = ced.split("").map((d) => Number(d));
  const verifier = digits[9];

  let acc = 0;

  for (let i = 0; i < 9; i++) {
    let val = digits[i];

    if (i % 2 === 0) {
      val = val * 2;
      if (val > 9) val -= 9;
    }
    acc += val;
  }
  const nextTen = Math.ceil(acc / 10) * 10;
  let check = nextTen - acc;

  if (check === 10) check = 0;

  return check === verifier;
}

// Valida RUC ecuatoriano que termina en 001 (13 dígitos)
// Persona natural usa cédula base, persona jurídica usa algoritmo especial con tercer dígito 9.
export function validateEcuadorRucJuridica(ruc: string) {
  const r = digitsOnly(ruc);

  if (!/^[0-9]{13}$/.test(r)) return false;
  if (r[2] !== "9") return false;
  if (!r.endsWith("001")) return false;

  const digits = r.split("").map((d) => Number(d));
  const coefficients = [4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;

  for (let i = 0; i < 9; i++) {
    sum += digits[i] * coefficients[i];
  }

  const mod = sum % 11;
  let verifier = 11 - mod;

  if (verifier === 11) verifier = 0;
  if (verifier === 10) return false;

  return verifier === digits[9];
}

export function validateEcuadorRuc(ruc: string) {
  // Practical requirement: a RUC is 13 numeric digits. We deliberately do NOT
  // enforce the '001' establishment suffix, the 3rd-digit type, or the
  // check-digit — those reject legitimate RUCs: public-sector RUCs (3rd digit
  // 6), branch establishments ending in 002/003…, and valid numbers issued by
  // the SRI that don't pass the modulus check. 13 digits is the rule.
  return /^[0-9]{13}$/.test(digitsOnly(ruc));
}

// Valida que sea cédula (10) o RUC (13 con 001). Si es RUC, valida los primeros 10.
export function validateCedulaOrRuc(value: string) {
  const v = (value || "").toString().trim();
  const d = digitsOnly(v);

  if (d.length === 10) return validateEcuadorCedula(d);
  if (d.length === 13) return validateEcuadorRuc(d);

  return false;
}

export default validateCedulaOrRuc;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * IDENTIFICADORES POR PAÍS — Y PERMISIVOS CUANDO NO SE SABE
 *
 * Espejo de `backend/src/lib/validators/taxId.ts` y de
 * `backend/src/lib/validators/personId.ts`. Si cambias una regla aquí, cámbiala
 * allí: el frontend sólo adelanta el mensaje, quien decide es el backend, y que
 * discrepen produce el peor error de todos — un formulario que te deja enviar y
 * un servidor que te rechaza sin decirte por qué.
 *
 * ── EL FALLO DE 2026-09-01 (resuelto entonces) ─────────────────────────────
 * El país se detectaba con `country.includes('ec')`, `includes('co')`,
 * `includes('es')`… sobre el NOMBRE del país. Eso no es una comprobación, es
 * una lotería: «Greece» contiene «ec», «Mexico» y «Costa Rica» contienen «co»,
 * «United States» contiene «es». Se arregló con comparación exacta o por
 * prefijo, que es la que sigue vigente aquí.
 *
 * ── EL FALLO DE HOY ────────────────────────────────────────────────────────
 * Aquel arreglo dejó el mapa de países en CUATRO —EC, MX, CO, PE— y todo lo
 * demás cayendo en el genérico. Para el identificador fiscal daba igual, porque
 * el genérico acepta. Pero el ALTA DE CLIENTE no usaba nada de esto: validaba
 * siempre con la regla ecuatoriana, así que a una agencia polaca le exigía
 * trece dígitos terminados en 001 debajo de una etiqueta que decía «NIP firmy».
 * El formulario era, literalmente, imposible de enviar fuera de Ecuador.
 *
 * Se cierra ensanchando el mapa a los mercados donde de verdad hay clientes
 * —América, Europa y Estados Unidos— y separando dos cosas que estaban
 * mezcladas:
 *
 *   · RECONOCER el país (`resolveCountryCode`) — cuantos más, mejor: sirve para
 *     poner la etiqueta correcta y la ayuda correcta.
 *   · EXIGIR una forma (`FORMAS_FISCALES`) — sólo donde la conocemos y donde
 *     ser estrictos no deja a nadie fuera.
 *
 * Reconocer un país NO implica exigirle una forma: Malta se resuelve a 'MT' y
 * su identificador sigue pasando por la comprobación genérica.
 *
 * ── LA REGLA DE DISEÑO, QUE NO CAMBIA ──────────────────────────────────────
 * **Ante la duda, se acepta.** Un identificador fiscal no es una credencial;
 * validarlo atrapa erratas, no cierra puertas. Rechazar un formato que no
 * conocemos convierte cada país nuevo en un bloqueo total.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Código ISO 3166-1 alfa-2, o `null` si no reconocemos el país. */
export type CodigoPais = string | null;

/**
 * Nombres de país tal como llegan: del geocodificador de Google (que devuelve el
 * nombre en el idioma de la sesión), tecleados a mano, o ya como código ISO.
 *
 * Comparación EXACTA o por PREFIJO — nunca `includes`, que es lo que provocó la
 * lotería. Cada país lista sus formas en los idiomas del producto: un tenant
 * alemán ve «Deutschland» y uno inglés «Germany», y los dos tienen que resolver.
 */
const NOMBRES_DE_PAIS: Array<[RegExp, string]> = [
  // ── América ──────────────────────────────────────────────────────────────
  [/^ecuador/, "EC"],
  [/^(mexico|méxico)/, "MX"],
  [/^colombia/, "CO"],
  [/^(peru|perú)/, "PE"],
  [
    /^(estados unidos|united states|usa|ee\.? ?uu|vereinigte staaten|états-unis|stati uniti|stany zjednoczone|verenigde staten)/,
    "US",
  ],
  [/^(canada|canadá|kanada)/, "CA"],
  [/^(brasil|brazil|brasile|brazylia|brazilië)/, "BR"],
  [/^argentina/, "AR"],
  [/^chile/, "CL"],
  [/^uruguay/, "UY"],
  [/^paraguay/, "PY"],
  [/^bolivia/, "BO"],
  [/^(venezuela)/, "VE"],
  [/^(costa rica)/, "CR"],
  [/^(panama|panamá)/, "PA"],
  [/^guatemala/, "GT"],
  [/^(republica dominicana|república dominicana|dominican republic)/, "DO"],
  [/^(el salvador)/, "SV"],
  [/^honduras/, "HN"],
  [/^nicaragua/, "NI"],
  // ── Europa ───────────────────────────────────────────────────────────────
  [/^(espana|españa|spain|spanien|espagne|spagna|hiszpania)/, "ES"],
  [/^portugal/, "PT"],
  [/^(france|francia|frankreich|frankrijk|francja)/, "FR"],
  [/^(deutschland|germany|alemania|allemagne|germania|niemcy|duitsland)/, "DE"],
  [/^(italia|italy|italien|italie|włochy|wlochy|italië)/, "IT"],
  [
    /^(nederland|netherlands|holanda|paises bajos|países bajos|niederlande|pays-bas|paesi bassi|holandia)/,
    "NL",
  ],
  [/^(polska|poland|polonia|polen|pologne)/, "PL"],
  [/^(belgica|bélgica|belgium|belgique|belgie|belgië|belgien)/, "BE"],
  [/^(austria|österreich|osterreich|autriche|austriche)/, "AT"],
  [/^(suiza|switzerland|schweiz|suisse|svizzera|szwajcaria|zwitserland)/, "CH"],
  [
    /^(reino unido|united kingdom|great britain|gran bretaña|inglaterra|england)/,
    "GB",
  ],
  [/^(irlanda|ireland|irland|irlande)/, "IE"],
];

/**
 * Código de país a partir del nombre o del propio código ISO.
 *
 * Un valor de DOS letras se toma tal cual como ISO: es lo que guardan los
 * selectores de país y lo que devolverá la columna el día que se migre.
 */
export function resolveCountryCode(country?: string): CodigoPais {
  const p = (country || "").toString().trim().toLowerCase();

  if (!p) return null;
  if (/^[a-z]{2}$/.test(p)) return p.toUpperCase();
  for (const [re, iso] of NOMBRES_DE_PAIS) if (re.test(p)) return iso;

  return null;
}

/** Quita lo que la gente teclea como separador y sube a mayúsculas. */
const limpio = (v: string) => (v || "").replace(/[\s.\-/]/g, "").toUpperCase();

/**
 * Número de IVA europeo con el prefijo del país delante («ESB12345674»).
 *
 * Se acepta en TODA Europa además de la forma nacional, porque es como muchas
 * empresas tienen escrito el dato en su propia facturación, y rechazarlo
 * obligaría a reescribirlo justo aquí y en ningún otro sitio.
 */
const esIvaEuropeo = (v: string) => /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(limpio(v));

/**
 * La FORMA del identificador fiscal en los países que modelamos.
 *
 * Son comprobaciones de forma, nunca de dígito verificador: sus algoritmos
 * cambian con los años y un número legítimo antiguo puede no cuadrar. Validar
 * la forma atrapa la errata de tecleo sin bloquear a nadie, que es todo lo que
 * se busca. Ecuador es la excepción —conserva su módulo 10— porque es la regla
 * que ya estaba y la que su mercado espera.
 *
 * Un país que NO esté aquí pasa por `pareceIdentificadorFiscal`. Añadir uno es
 * añadir una línea; quitarlo no rompe nada.
 */
const FORMAS_FISCALES: Record<string, (v: string) => boolean> = {
  // ── América ──────────────────────────────────────────────────────────────
  EC: (v) => validateCedulaOrRuc(v), // cédula 10 o RUC 13
  MX: (v) => /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(limpio(v)), // RFC
  CO: (v) => /^\d{8,10}\d?$/.test(limpio(v)), // NIT + DV opcional
  PE: (v) => /^(10|15|17|20)\d{9}$/.test(limpio(v)), // RUC
  US: (v) => /^\d{9}$/.test(limpio(v)), // EIN
  CA: (v) => /^\d{9}([A-Z]{2}\d{4})?$/.test(limpio(v)), // BN, con programa opcional
  BR: (v) => /^(\d{11}|\d{14})$/.test(limpio(v)), // CPF o CNPJ
  AR: (v) => /^\d{11}$/.test(limpio(v)), // CUIT
  CL: (v) => /^\d{7,8}[0-9K]$/.test(limpio(v)), // RUT con DV
  UY: (v) => /^\d{12}$/.test(limpio(v)), // RUT
  PY: (v) => /^\d{6,9}\d?$/.test(limpio(v)), // RUC + DV
  BO: (v) => /^\d{7,13}$/.test(limpio(v)), // NIT
  VE: (v) => /^[JGVEP]\d{8,9}$/.test(limpio(v)), // RIF
  CR: (v) => /^\d{9,12}$/.test(limpio(v)), // cédula jurídica
  PA: (v) => /^[A-Z0-9]{5,20}$/.test(limpio(v)), // RUC, muy variable
  GT: (v) => /^\d{6,9}[0-9K]$/.test(limpio(v)), // NIT con DV
  DO: (v) => /^(\d{9}|\d{11})$/.test(limpio(v)), // RNC o cédula
  SV: (v) => /^\d{9,14}$/.test(limpio(v)), // NIT
  HN: (v) => /^\d{13,14}$/.test(limpio(v)), // RTN
  NI: (v) => /^[A-Z0-9]{13,14}$/.test(limpio(v)), // RUC
  // ── Europa: forma nacional O número de IVA con prefijo ───────────────────
  ES: (v) =>
    /^([A-Z]\d{7}[A-Z0-9]|\d{8}[A-Z])$/.test(limpio(v)) || esIvaEuropeo(v), // CIF/NIF
  PT: (v) => /^\d{9}$/.test(limpio(v)) || esIvaEuropeo(v), // NIF
  FR: (v) => /^(\d{9}|\d{14})$/.test(limpio(v)) || esIvaEuropeo(v), // SIREN o SIRET
  DE: (v) => /^\d{10,13}$/.test(limpio(v)) || esIvaEuropeo(v), // Steuernummer
  IT: (v) => /^\d{11}$/.test(limpio(v)) || esIvaEuropeo(v), // partita IVA
  NL: (v) => /^(\d{8}|\d{9}B\d{2})$/.test(limpio(v)) || esIvaEuropeo(v), // KvK o btw
  PL: (v) => /^\d{10}$/.test(limpio(v)) || esIvaEuropeo(v), // NIP
  BE: (v) => /^0?\d{9}$/.test(limpio(v)) || esIvaEuropeo(v), // ondernemingsnummer
  AT: (v) => /^U\d{8}$/.test(limpio(v)) || esIvaEuropeo(v), // UID
  CH: (v) => /^CHE\d{9}$/.test(limpio(v)) || /^\d{9}$/.test(limpio(v)), // IDE/UID
  GB: (v) => /^(\d{9}|\d{12})$/.test(limpio(v)) || esIvaEuropeo(v), // VAT
  IE: (v) => /^\d{7}[A-Z]{1,2}$/.test(limpio(v)) || esIvaEuropeo(v), // VAT
};

/**
 * País que no modelamos. La única pregunta es «¿esto parece un identificador
 * fiscal, o es un campo pegado por error?». Se quitan los separadores y se
 * exige que queden entre 5 y 20 caracteres ALFANUMÉRICOS — letras incluidas.
 *
 * El rango no es decorativo, el mundo real vive dentro: NIF portugués 9, EIN
 * estadounidense 9, VAT británico 9, CUIT argentino 11, CNPJ brasileño 14,
 * GSTIN indio 15, y hasta 20 donde numeran largo. Se cuentan alfanuméricos y no
 * caracteres para que un identificador de 20 dígitos escrito con separadores no
 * se caiga por longitud.
 */
export function looksLikeReasonableTaxId(value: string) {
  const v = (value || "").replace(/[\s.\-/]/g, "");

  return /^[A-Za-z0-9ÑñÁÉÍÓÚáéíóú&]{5,20}$/.test(v);
}

/** ¿Es aceptable este identificador fiscal para una empresa de este país? */
export function validateTaxNumberForCountry(
  taxNumber: string | undefined,
  country?: string,
) {
  const v = (taxNumber || "").toString().trim();

  if (!v) return false;
  const forma = FORMAS_FISCALES[resolveCountryCode(country) || ""];

  return forma ? forma(v) : looksLikeReasonableTaxId(v);
}

/**
 * Cómo se llama el documento fiscal en ese país, para no decirle «RUC» a un
 * alemán. `null` cuando no lo sabemos: quien pinta la etiqueta pone entonces un
 * genérico traducido («Identificador fiscal»), que es correcto en todas partes.
 */
export function taxIdLabelFor(country?: string): string | null {
  switch (resolveCountryCode(country)) {
    case "EC":
    case "PE":
    case "PY":
    case "PA":
    case "NI":
      return "RUC";
    case "MX":
      return "RFC";
    case "CO":
    case "BO":
    case "GT":
    case "SV":
      return "NIT";
    case "US":
      return "EIN";
    case "CA":
      return "BN";
    case "BR":
      return "CNPJ";
    case "AR":
      return "CUIT";
    case "CL":
    case "UY":
      return "RUT";
    case "VE":
      return "RIF";
    case "DO":
      return "RNC";
    case "HN":
      return "RTN";
    case "ES":
      return "NIF/CIF";
    case "PT":
      return "NIF";
    case "FR":
      return "SIREN";
    case "DE":
      return "Steuernummer";
    case "IT":
      return "Partita IVA";
    case "NL":
      return "Btw-nummer";
    case "PL":
      return "NIP";
    case "BE":
      return "Ondernemingsnummer";
    case "AT":
      return "UID";
    case "CH":
      return "UID";
    case "GB":
    case "IE":
      return "VAT number";
    default:
      return null;
  }
}

/**
 * Ejemplo de la forma que se espera, para el marcador del campo. Vale más que
 * una explicación: quien ve «10 dígitos» sabe qué teclear sin leer una frase.
 */
export function taxIdHintFor(country?: string): string | null {
  switch (resolveCountryCode(country)) {
    case "EC":
      return "1792146739001";
    case "MX":
      return "ABC010203XY1";
    case "CO":
      return "900123456-7";
    case "PE":
      return "20123456789";
    case "US":
      return "12-3456789";
    case "BR":
      return "12.345.678/0001-95";
    case "AR":
      return "30-12345678-9";
    case "CL":
      return "76123456-7";
    case "ES":
      return "B12345674";
    case "PT":
      return "501234567";
    case "FR":
      return "123456789";
    case "DE":
      return "DE123456789";
    case "IT":
      return "12345678901";
    case "NL":
      return "NL123456789B01";
    case "PL":
      return "1234567890";
    case "GB":
      return "GB123456789";
    default:
      return null;
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DOCUMENTO DE UNA PERSONA — el otro campo que sólo hablaba ecuatoriano
 *
 * Espejo reducido de `backend/src/lib/validators/personId.ts`: aquí sólo hace
 * falta saber si la forma es plausible y cómo se llama el documento en ese
 * país, para que el alta de un cliente PERSONA no exija una cédula ecuatoriana
 * a un autónomo de Lyon.
 * ════════════════════════════════════════════════════════════════════════════
 */
const FORMAS_PERSONALES: Record<
  string,
  { etiqueta: string; forma: (v: string) => boolean }
> = {
  EC: {
    etiqueta: "Cédula",
    forma: (v) => validateEcuadorCedula(digitsOnly(v)),
  },
  PE: { etiqueta: "DNI", forma: (v) => /^\d{8}$/.test(limpio(v)) },
  CO: { etiqueta: "Cédula", forma: (v) => /^\d{6,10}$/.test(limpio(v)) },
  MX: {
    etiqueta: "CURP",
    forma: (v) =>
      /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(limpio(v)) ||
      /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(limpio(v)),
  },
  AR: { etiqueta: "DNI", forma: (v) => /^\d{7,8}$/.test(limpio(v)) },
  CL: { etiqueta: "RUT", forma: (v) => /^\d{7,8}[0-9K]$/.test(limpio(v)) },
  BR: { etiqueta: "CPF", forma: (v) => /^\d{11}$/.test(limpio(v)) },
  ES: {
    etiqueta: "DNI/NIE",
    forma: (v) => /^(\d{8}[A-Z]|[XYZ]\d{7}[A-Z])$/.test(limpio(v)),
  },
  PT: {
    etiqueta: "Cartão de Cidadão",
    forma: (v) => /^\d{8}[A-Z0-9]{0,4}$/.test(limpio(v)),
  },
  IT: {
    etiqueta: "Codice Fiscale",
    forma: (v) => /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(limpio(v)),
  },
  PL: { etiqueta: "PESEL", forma: (v) => /^\d{11}$/.test(limpio(v)) },
  NL: { etiqueta: "BSN", forma: (v) => /^\d{8,9}$/.test(limpio(v)) },
  DE: {
    etiqueta: "Personalausweis",
    forma: (v) => /^[A-Z0-9]{9,10}$/.test(limpio(v)),
  },
  FR: {
    etiqueta: "Carte d'identité",
    forma: (v) => /^[A-Z0-9]{9,12}$/.test(limpio(v)),
  },
};

/**
 * País que no modelamos, o extranjero con pasaporte: entre 4 y 30 alfanuméricos
 * cubre de sobra el mundo real, y es lo mismo que acepta el backend.
 */
export function looksLikeReasonablePersonId(value: string) {
  return /^[A-Z0-9ÑÁÉÍÓÚ]{4,30}$/.test(limpio(value));
}

/**
 * ¿Es plausible este documento para una persona de este país?
 *
 * Se acepta TAMBIÉN la forma genérica aunque el país esté modelado: en este
 * sector es corriente que la persona sea extranjera donde trabaja —un
 * venezolano con carné de extranjería en Perú, un ucraniano con pasaporte en
 * Polonia— y su documento no tiene por qué seguir la forma local.
 */
export function validatePersonIdForCountry(
  document: string | undefined,
  country?: string,
) {
  const v = (document || "").toString().trim();

  if (!v) return false;
  const modelo = FORMAS_PERSONALES[resolveCountryCode(country) || ""];

  if (modelo && modelo.forma(v)) return true;

  return looksLikeReasonablePersonId(v);
}

/** Cómo llamar al documento de una persona en ese país. `null` si no lo sabemos. */
export function personIdLabelFor(country?: string): string | null {
  const modelo = FORMAS_PERSONALES[resolveCountryCode(country) || ""];

  return modelo ? modelo.etiqueta : null;
}

/**
 * Teléfono, con la regla del país cuando la conocemos.
 *
 * Arrastraba el MISMO fallo que el identificador fiscal: el país se detectaba
 * con `includes` sobre su nombre, así que «Mexico» contiene «co» y a un móvil
 * mexicano se le exigía el formato colombiano (10 dígitos empezando por 3), y
 * «Greece» contiene «ec», así que a un griego se le exigía el ecuatoriano. El
 * teléfono es obligatorio en el alta: eso no era un mensaje feo, era no poder
 * registrarse. Ahora el país se resuelve con `resolveCountryCode`.
 *
 * Ojo con ensanchar esto: sólo llevan regla propia los cuatro países donde el
 * plan de numeración es estable y conocido. Para el resto vale la sensatez de
 * la ITU, y es lo correcto — un fijo alemán y un móvil alemán no tienen la
 * misma longitud, y exigir una sola forma volvería a dejar gente fuera.
 */
export function validatePhoneForCountry(
  phone: string | undefined,
  country?: string,
) {
  const p = (phone || "").toString().trim();

  if (!p) return false;
  const d = digitsOnly(p);

  // E.164 internacional sin país declarado: se acepta con manga ancha.
  if (p.startsWith("+") && !country) {
    return d.length >= 7 && d.length <= 15;
  }

  switch (resolveCountryCode(country)) {
    case "EC": {
      // Móvil: 9 dígitos empezando por 9, o 10 empezando por 09.
      let local = d;

      if (local.startsWith("593")) local = local.slice(3);
      if (local.length === 9 && local.startsWith("9")) return true;
      if (local.length === 10 && local.startsWith("09")) return true;

      return false;
    }
    case "PE": {
      // Móvil: 9 dígitos empezando por 9.
      let local = d;

      if (local.startsWith("51")) local = local.slice(2);
      if (local.startsWith("0")) local = local.slice(1);

      return local.length === 9 && local.startsWith("9");
    }
    case "CO": {
      // Móvil: 10 dígitos empezando por 3.
      let local = d;

      if (local.startsWith("57")) local = local.slice(2);
      if (local.startsWith("0")) local = local.slice(1);

      return local.length === 10 && local.startsWith("3");
    }
    case "MX": {
      // 10 dígitos nacionales; se tolera el 52 (y el viejo 1 de móvil) delante.
      let local = d;

      if (local.startsWith("52")) local = local.slice(2);
      if (local.startsWith("1") && local.length === 11) local = local.slice(1);

      return local.length === 10;
    }
    default:
      // País que no modelamos: sólo sensatez. La ITU tope el número nacional en
      // 15 dígitos, y los planes más cortos del mundo bajan a 7.
      return d.length >= 7 && d.length <= 15;
  }
}
