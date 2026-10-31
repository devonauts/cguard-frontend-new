import { z } from "zod";

import i18n from "@/i18n";

// Esquema de MÓDULO: se construye al importar, así que aquí NO se puede llamar a
// `t()` con el texto ya resuelto — quedaría congelado en el idioma de arranque.
// zod acepta una FUNCIÓN en `error`, y esa función corre al validar: ahí sí se
// traduce, con el idioma que esté activo en ese momento.
const msg = (clave: string, porDefecto: string) => () =>
  i18n.t(clave, porDefecto);

/** Mensaje de longitud máxima: FUNCIÓN, evaluada por zod al validar. */
const maxChars = (n: number) => ({
  error: () =>
    i18n.t("validation.postSite.maxChars", {
      n,
      defaultValue: "Máximo {{n}} caracteres",
    }),
});

const e164 = /^\+[1-9]\d{7,14}$/;

/** An optional select: a real option, an empty string (cleared) or nothing. */
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.union([z.enum(values), z.literal("")]).optional();

// Nombre/Apellido: permitir letras Unicode, espacios, apóstrofe y guiones. No números.
const nameRegex = /^[\p{L} '\-]+$/u;

export const BLOOD_TYPES = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;
export type BloodType = (typeof BLOOD_TYPES)[number];

export const GENDER_OPTIONS = ["Masculino", "Femenino"] as const;
export type Gender = (typeof GENDER_OPTIONS)[number];

export const MARITAL_STATUS_OPTIONS = [
  "Soltero",
  "Casado",
  "Unión libre",
  "Divorciado",
] as const;
export type MaritalStatus = (typeof MARITAL_STATUS_OPTIONS)[number];

export const ACADEMIC_INSTRUCTION_OPTIONS = [
  "Primaria",
  "Secundaria",
  "Universidad",
  "Universitaria",
  "Especial",
] as const;
export type AcademicInstruction = (typeof ACADEMIC_INSTRUCTION_OPTIONS)[number];

export const createProfileSchema = z.object({
  // ── Personal info ──────────────────────────────────────────────────────
  firstName: z
    .string()
    .trim()
    .min(1, {
      error: msg("validation.common.nameRequired", "El nombre es requerido"),
    })
    .regex(nameRegex, {
      error: msg(
        "validation.common.nameInvalid",
        "El nombre no debe contener números ni caracteres inválidos",
      ),
    }),
  middleName: z
    .string()
    .trim()
    .regex(nameRegex, {
      error: msg(
        "validation.common.middleNameInvalid",
        "El segundo nombre no debe contener números ni caracteres inválidos",
      ),
    })
    .optional()
    .or(z.literal("")),
  lastName: z
    .string()
    .trim()
    .min(1, {
      error: msg(
        "validation.common.lastNameRequired",
        "El apellido es requerido",
      ),
    })
    .regex(nameRegex, {
      error: msg(
        "validation.common.lastNameInvalid",
        "El apellido no debe contener números ni caracteres inválidos",
      ),
    }),

  // Only names and the ID number are required to add a person (audit
  // 2026-10-31): the rest of the profile can be completed later.
  gender: optionalEnum(GENDER_OPTIONS),

  birthDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, {
      error: msg("validation.common.dateFormat", "Formato YYYY-MM-DD"),
    })
    .optional()
    .or(z.literal("")),

  birthPlace: z
    .string()
    .trim()
    .max(50, maxChars(50))
    .optional()
    .or(z.literal("")),

  maritalStatus: optionalEnum(MARITAL_STATUS_OPTIONS),

  academicInstruction: optionalEnum(ACADEMIC_INSTRUCTION_OPTIONS),

  hiringContractDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, {
      error: msg("validation.common.dateFormat", "Formato YYYY-MM-DD"),
    })
    .optional()
    .or(z.literal("")),

  guardCredentials: z
    .string()
    .trim()
    .max(255, maxChars(255))
    .optional()
    .or(z.literal("")),

  // ── Contact ────────────────────────────────────────────────────────────
  // El correo es obligatorio SALVO con «Sin correo (sólo usuario)»: esa regla
  // cruza dos campos y vive en `exigirCorreoSalvoSinCorreo` (abajo).
  email: z
    .string()
    .trim()
    .email({
      error: msg("validation.common.emailInvalid", "Ingrese un correo válido"),
    })
    .optional()
    .or(z.literal("")),
  /** Alta sin correo: la persona entra sólo con su usuario (alias). */
  sinCorreo: z.boolean().optional(),
  /** El usuario para entrar que eligió la empresa (lo valida el servidor). */
  username: z.string().trim().max(32, maxChars(32)).optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .regex(e164, {
      error: msg(
        "validation.common.phoneE164",
        "Use formato e.g. +12015550123",
      ),
    })
    .optional()
    .or(z.literal("")),

  // ── Address ─────────────────────────────────────────────────────────────
  homeAddress: z.string().trim().optional().or(z.literal("")),
  homeAddressLat: z.number().optional(),
  homeAddressLng: z.number().optional(),

  // ── Identity ───────────────────────────────────────────────────────────
  identificationNumber: z
    .string()
    .trim()
    .min(1, {
      error: msg(
        "validation.profile.identificationRequired",
        "El número de cédula/identificación es requerido",
      ),
    })
    .max(30, maxChars(30)),
  // Sin `error` propio, Zod escupe su texto de fábrica —«Invalid option: expected
  // one of "A+"|"A-"…»— y eso es lo que veía el usuario en pantalla.
  bloodType: optionalEnum(BLOOD_TYPES),

  // ── Assignments ────────────────────────────────────────────────────────
  clientId: z.array(z.string().trim()).optional(),
  stationId: z.array(z.string().trim()).optional(),

  // ── Password (optional on create — invite flow sets it) ────────────────
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
});

export type CreateProfileValues = z.infer<typeof createProfileSchema>;

/**
 * Correo obligatorio salvo «Sin correo (sólo usuario)». Va como refinamiento
 * aparte —y no dentro del objeto— porque zod 4 no deja hacer `.omit()` /
 * `.extend()` sobre un objeto con refinamientos, y el alta de supervisor parte
 * de este mismo esquema:
 *
 *   createProfileSchema.superRefine(exigirCorreoSalvoSinCorreo)
 */
export function exigirCorreoSalvoSinCorreo(
  v: { email?: string; sinCorreo?: boolean },
  ctx: z.RefinementCtx,
) {
  if (!v.sinCorreo && !String(v.email || "").trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["email"],
      message: i18n.t(
        "validation.common.emailRequiredOrNoEmail",
        "Escribe su correo o marca «Sin correo (sólo usuario)»",
      ),
    });
  }
}

/** El esquema del alta de vigilante («Crear perfil»), con la regla del correo. */
export const createProfileFormSchema = createProfileSchema.superRefine(
  exigirCorreoSalvoSinCorreo,
);
