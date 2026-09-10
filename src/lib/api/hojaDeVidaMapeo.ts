import {
  BLOOD_TYPES,
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  ACADEMIC_INSTRUCTION_OPTIONS,
} from "@/lib/validators/create-profile.schema";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DE LO QUE DICE EL PAPEL A LO QUE ACEPTA EL FORMULARIO.
 *
 * Funciones PURAS: entra lo que el servidor leyó del CV, sale lo que el
 * formulario de «Crear perfil» puede tragar. Sin red y sin estado, a propósito
 * — es la parte con reglas de verdad («¿"Bachiller" es Secundaria?») y así se
 * puede probar sola, sin levantar medio CRM.
 *
 * ── POR QUÉ EL MAPEO VIVE AQUÍ Y NO EN EL SERVIDOR ─────────────────────────
 * Porque las listas cerradas —«Masculino/Femenino», «Soltero/Casado/…»— son de
 * este formulario y pueden cambiar sin que el servidor se entere. El servidor
 * devuelve lo que decía el papel («masculino», «M», «Casado (2 hijos)») y es
 * esta capa la que decide si eso cabe en una opción.
 *
 * REGLA: si no encaja con seguridad, se deja VACÍO. Un desplegable relleno con
 * la opción equivocada se guarda sin que nadie lo mire; uno vacío obliga a
 * elegir. Rellenar mal es peor que no rellenar.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Lo que devuelve el servidor, tal cual. */
export interface DatosHojaDeVida {
  fullName: string | null;
  governmentId: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  gender: string | null;
  maritalStatus: string | null;
  bloodType: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  academicInstruction: string | null;
  guardCredentials: string | null;
  skills: string[];
  languages: string[];
}

export interface LecturaHojaDeVida {
  datos: DatosHojaDeVida;
  /** Por dónde se leyó: texto del PDF, OCR del proveedor, o visión. */
  via: "texto" | "archivo" | "imagen";
  paginas: number | null;
  /** Lo que no se pudo leer y habrá que completar a mano. */
  faltantes: string[];
  billing?: unknown;
}

const limpia = (v: string | null | undefined): string =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    // Sin tildes: «Unión libre» y «union libre» son lo mismo, y un CV escrito
    // en un teclado sin acentos no debería perder el dato por eso.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Masculino / Femenino, o vacío. */
export function mapeaGenero(
  v: string | null,
): (typeof GENDER_OPTIONS)[number] | undefined {
  const s = limpia(v);

  if (!s) return undefined;
  if (/^(m|masculino|hombre|male|varon)$/.test(s)) return "Masculino";
  if (/^(f|femenino|mujer|female)$/.test(s)) return "Femenino";

  return undefined;
}

export function mapeaEstadoCivil(
  v: string | null,
): (typeof MARITAL_STATUS_OPTIONS)[number] | undefined {
  const s = limpia(v);

  if (!s) return undefined;
  // `includes` y no igualdad: un CV pone «Casado, 2 hijos» o «Estado civil:
  // soltero» y ninguno de los dos es una opción exacta.
  if (s.includes("union libre") || s.includes("convivien"))
    return "Unión libre";
  if (s.includes("divorciad")) return "Divorciado";
  if (s.includes("casad")) return "Casado";
  if (s.includes("solter")) return "Soltero";

  return undefined;
}

export function mapeaTipoSangre(
  v: string | null,
): (typeof BLOOD_TYPES)[number] | undefined {
  const s = String(v ?? "")
    .toUpperCase()
    .replace(/\s|RH/g, "");
  const m = /^(A|B|AB|O)([+-])$/.exec(s);

  if (!m) return undefined;

  return `${m[1]}${m[2]}` as (typeof BLOOD_TYPES)[number];
}

/**
 * La instrucción académica es la más difícil: el CV cuenta una historia
 * («Bachiller en Ciencias Sociales, Tecnólogo en Seguridad Industrial») y el
 * formulario quiere UNA palabra. Se busca el nivel MÁS ALTO mencionado, que es
 * el que interesa, y ante la duda se deja vacío.
 */
export function mapeaInstruccion(
  v: string | null,
): (typeof ACADEMIC_INSTRUCTION_OPTIONS)[number] | undefined {
  const s = limpia(v);

  if (!s) return undefined;
  if (/universi|tecnolog|ingenier|licenciad|superior|posgrado|maestr/.test(s))
    return "Universitaria";
  if (/secundar|bachiller|colegio|preparator/.test(s)) return "Secundaria";
  if (/primaria|basica|escuela/.test(s)) return "Primaria";
  if (/especial/.test(s)) return "Especial";

  return undefined;
}

/**
 * Parte un nombre completo en nombre / segundo nombre / apellidos.
 *
 * En Latinoamérica lo normal son DOS apellidos, así que con cuatro palabras se
 * asume «nombre nombre apellido apellido». No siempre acierta —hay nombres
 * compuestos y apellidos de dos palabras— y por eso el resultado cae en un
 * formulario que se ve y se corrige, no directo a la base.
 */
export function parteNombre(completo: string | null): {
  firstName: string;
  middleName: string;
  lastName: string;
} {
  const partes = String(completo ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (partes.length === 0)
    return { firstName: "", middleName: "", lastName: "" };
  if (partes.length === 1)
    return { firstName: partes[0], middleName: "", lastName: "" };
  if (partes.length === 2)
    return { firstName: partes[0], middleName: "", lastName: partes[1] };
  if (partes.length === 3)
    return {
      firstName: partes[0],
      middleName: "",
      lastName: partes.slice(1).join(" "),
    };

  return {
    firstName: partes[0],
    middleName: partes[1],
    lastName: partes.slice(2).join(" "),
  };
}

/** Los valores listos para volcar en el formulario de «Crear perfil». */
export interface CamposFormulario {
  firstName: string;
  middleName: string;
  lastName: string;
  identificationNumber: string;
  birthDate: string;
  birthPlace: string;
  gender?: (typeof GENDER_OPTIONS)[number];
  maritalStatus?: (typeof MARITAL_STATUS_OPTIONS)[number];
  bloodType?: (typeof BLOOD_TYPES)[number];
  academicInstruction?: (typeof ACADEMIC_INSTRUCTION_OPTIONS)[number];
  guardCredentials: string;
  email: string;
  phone: string;
  homeAddress: string;
}

/**
 * Traduce la lectura al formulario.
 *
 * Las habilidades y los idiomas no tienen campo propio en el alta, así que en
 * vez de tirarlos se anexan a las credenciales: es información que el CV traía
 * y que alguien escribió a mano, y perderla en la traducción sería justo lo que
 * esta función existe para evitar.
 */
export function aCamposDelFormulario(d: DatosHojaDeVida): CamposFormulario {
  const nombre = parteNombre(d.fullName);
  const extras: string[] = [];

  if (d.guardCredentials) extras.push(d.guardCredentials);
  if (d.skills?.length) extras.push(`Habilidades: ${d.skills.join(", ")}`);
  if (d.languages?.length) extras.push(`Idiomas: ${d.languages.join(", ")}`);

  return {
    ...nombre,
    identificationNumber: d.governmentId || "",
    birthDate: d.birthDate || "",
    birthPlace: d.birthPlace || "",
    gender: mapeaGenero(d.gender),
    maritalStatus: mapeaEstadoCivil(d.maritalStatus),
    bloodType: mapeaTipoSangre(d.bloodType),
    academicInstruction: mapeaInstruccion(d.academicInstruction),
    guardCredentials: extras.join("\n"),
    email: d.email || "",
    phone: d.phone || "",
    homeAddress: d.address || "",
  };
}
