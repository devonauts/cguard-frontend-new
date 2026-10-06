import { z } from "zod";

import {
  resolveCountryCode,
  taxIdLabelFor,
  personIdLabelFor,
  validateTaxNumberForCountry,
  validatePersonIdForCountry,
} from "./id";

import i18n from "@/i18n";

// Este esquema vive en el módulo: un t() suelto aquí se evaluaría al cargar y
// congelaría el idioma de arranque. Por eso el texto se resuelve TARDE — dentro
// de la función `error`, que zod llama en cada validación.
const msj = (clave: string, texto: string) => () => i18n.t(clave, texto);

/** Mensaje de longitud máxima. Igual que `msj`: es una FUNCIÓN, así que zod la
 *  ejecuta al validar, ya con el idioma del usuario puesto. */
const maxChars = (n: number) => ({
  error: () =>
    i18n.t("validation.postSite.maxChars", {
      n,
      defaultValue: "Máximo {{n}} caracteres",
    }),
});

/**
 * El esquema del alta de cliente, medido con la vara del país.
 *
 * ── POR QUÉ ES UNA FÁBRICA Y NO UNA CONSTANTE ──────────────────────────────
 * Hasta hoy era una constante y validaba SIEMPRE con la regla ecuatoriana:
 * persona natural = cédula de 10 dígitos con módulo 10, persona jurídica = RUC
 * de 13. La plataforma opera en Estados Unidos, América Latina y Europa, así
 * que eso significaba que una agencia polaca veía la etiqueta «NIP firmy»,
 * escribía su NIP de diez dígitos y recibía «RUC inválido (debe terminar en
 * 001…)». El formulario era imposible de enviar fuera de Ecuador — y el backend
 * no tenía nada que ver: `lib/validators/taxId.ts` ya validaba por país desde
 * agosto. El bloqueo era enteramente de esta pantalla.
 *
 * ── DE DÓNDE SALE EL PAÍS ──────────────────────────────────────────────────
 * Del propio cliente (`data.country`, que está en la sección de dirección) y,
 * mientras esté vacío —el documento se teclea ANTES que la dirección—, del país
 * de la empresa que da el alta, que es el que la fábrica recibe. Si no hay
 * ninguno de los dos, se aplica la comprobación genérica de sensatez: ante la
 * duda se acepta, que es la regla del resto de validadores.
 */
export const crearEsquemaCliente = (paisDeLaEmpresa?: string) =>
  z
    .object({
      name: z
        .string()
        .trim()
        .min(1, {
          error: msj(
            "validation.client.nameRequired",
            "Nombre del cliente requerido",
          ),
        })
        .max(200, maxChars(200)),
      lastName: z
        .string()
        .trim()
        .max(200, maxChars(200))
        .optional()
        .or(z.literal("")),
      email: z
        .string()
        .trim()
        .min(1, {
          error: msj("validation.client.emailRequired", "Email requerido"),
        })
        .email({
          error: msj("clients.contacts.errors.invalidEmail", "Correo inválido"),
        })
        .max(150, maxChars(150)),
      phoneNumber: z
        .string()
        .trim()
        .min(1, {
          error: msj("validation.client.phoneRequired", "Teléfono requerido"),
        })
        .max(20, maxChars(20)),
      address: z
        .string()
        .trim()
        .min(1, {
          error: msj(
            "validation.client.addressRequired",
            "Dirección requerida",
          ),
        })
        .max(200, maxChars(200)),
      addressLine2: z
        .string()
        .trim()
        .max(200, maxChars(200))
        .optional()
        .or(z.literal("")),
      postalCode: z
        .string()
        .trim()
        .min(1, {
          error: msj(
            "validation.client.postalCodeRequired",
            "Código postal requerido",
          ),
        })
        .max(20, maxChars(20)),
      city: z
        .string()
        .trim()
        .max(100, maxChars(100))
        .optional()
        .or(z.literal("")),
      country: z
        .string()
        .trim()
        .max(100, maxChars(100))
        .optional()
        .or(z.literal("")),
      faxNumber: z
        .string()
        .trim()
        .max(20, maxChars(20))
        .optional()
        .or(z.literal("")),
      website: z
        .string()
        .trim()
        .url({ error: msj("validation.client.websiteInvalid", "URL inválida") })
        .max(255, maxChars(255))
        .optional()
        .or(z.literal("")),
      latitude: z.coerce
        .string()
        .trim()
        .optional()
        .or(z.literal(""))
        .refine((val) => !val || !Number.isNaN(Number(val)), {
          error: msj(
            "clients.validation.latitude_numeric",
            "Latitud debe ser numérica",
          ),
        })
        .refine((val) => !val || (Number(val) >= -90 && Number(val) <= 90), {
          error: msj(
            "validation.client.latitudeRange",
            "Latitud entre -90 y 90",
          ),
        }),
      longitude: z.coerce
        .string()
        .trim()
        .optional()
        .or(z.literal(""))
        .refine((val) => !val || !Number.isNaN(Number(val)), {
          error: msj(
            "clients.validation.longitude_numeric",
            "Longitud debe ser numérica",
          ),
        })
        .refine((val) => !val || (Number(val) >= -180 && Number(val) <= 180), {
          error: msj(
            "validation.client.longitudeRange",
            "Longitud entre -180 y 180",
          ),
        }),
      active: z.boolean().optional(),
      commercialName: z
        .string()
        .trim()
        .max(200, maxChars(200))
        .optional()
        .or(z.literal("")),
      contractDate: z.string().optional().or(z.literal("")),
      contractEndDate: z.string().optional().or(z.literal("")),
      riskLevel: z.string().optional().or(z.literal("")),
      // Orden de compra (opcional) — clientes públicos/estatales que contratan
      // por orden de compra en lugar de contrato directo.
      purchaseOrder: z.string().max(120).optional().or(z.literal("")),
      code: z
        .string()
        .trim()
        .max(50, maxChars(50))
        .optional()
        .or(z.literal("")),
      accountExecutiveId: z.string().optional().or(z.literal("")),
      // Representante legal (persona) — separado de la empresa.
      legalRepFirstName: z
        .string()
        .trim()
        .max(150)
        .optional()
        .or(z.literal("")),
      legalRepLastName: z.string().trim().max(150).optional().or(z.literal("")),
      legalRepEmail: z.string().trim().max(200).optional().or(z.literal("")),
      legalRepPhone: z.string().trim().max(30).optional().or(z.literal("")),
      legalRepDocument: z.string().trim().max(20).optional().or(z.literal("")),
      // Tipo de persona (Persona Natural / Persona Jurídica)
      personType: z.enum(["PN", "PJ"]).optional(),
      // RUC o Cédula: opcional
      documentNumber: z
        .string()
        .trim()
        .max(50, maxChars(50))
        .optional()
        .or(z.literal("")),
      // Coerce ANY incoming shape (a single string, category objects, or an array
      // with stray nullish entries) into a clean string[] before validating, so a
      // selected sector can never trip "Invalid input".
      categoryIds: z.preprocess((v) => {
        if (v == null || v === "") return undefined;
        const arr = Array.isArray(v) ? v : [v];
        const ids = arr
          .map((x: any) =>
            typeof x === "string" ? x : x && (x.id ?? x.value ?? x._id),
          )
          .filter((x: any) => typeof x === "string" && x.length > 0);

        return ids.length ? ids : undefined;
      }, z.array(z.string()).optional()),
    })
    .superRefine((data, ctx) => {
      const personType = data.personType || "PN";
      const doc = (data.documentNumber || "").toString().trim();

      /* PERSONA NATURAL: el contacto ES la persona. Su teléfono y su correo
         personales son obligatorios y son los del cliente (el formulario los
         copia a email/phoneNumber), así que no se pregunta dos veces. */
      if (personType === "PN") {
        // «+52» solo es el prefijo que deja el selector de país, no un teléfono.
        if (
          (data.legalRepPhone || "").toString().replace(/\D/g, "").length < 7
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["legalRepPhone"],
            message: i18n.t(
              "validation.client.phoneRequired",
              "Teléfono requerido",
            ),
          });
        }
        const correo = (data.legalRepEmail || "").toString().trim();

        if (!correo) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["legalRepEmail"],
            message: i18n.t(
              "validation.client.emailRequired",
              "Email requerido",
            ),
          });
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["legalRepEmail"],
            message: i18n.t(
              "clients.contacts.errors.invalidEmail",
              "Correo inválido",
            ),
          });
        }
      }
      // El país del cliente manda; mientras no esté escrito, el de la empresa.
      const pais =
        (data.country || "").toString().trim() || paisDeLaEmpresa || "";

      if (!doc) {
        // Aquí ya estamos DENTRO de la validación: i18n.t() directo es correcto,
        // se resuelve con el idioma vivo.
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["documentNumber"],
          message: i18n.t(
            "validation.client.documentRequired",
            "Identificación requerida",
          ),
        });

        return;
      }

      // El nombre del documento en ESE país entra en el mensaje: «NIP inválido»
      // le dice algo a un polaco; «RUC inválido», nada.
      const nombre =
        personType === "PJ" ? taxIdLabelFor(pais) : personIdLabelFor(pais);
      const valido =
        personType === "PJ"
          ? validateTaxNumberForCountry(doc, pais)
          : validatePersonIdForCountry(doc, pais);

      if (!valido) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["documentNumber"],
          message: nombre
            ? i18n.t("clients.validation.document_invalid_named", {
                documento: nombre,
                defaultValue: "{{documento}} inválido",
              })
            : i18n.t(
                "clients.validation.document_invalid",
                "Identificación inválida",
              ),
        });
      }
    });

/**
 * El esquema sin país, para quien sólo necesita el TIPO. Deriva de la fábrica
 * para que no puedan separarse: un segundo esquema copiado a mano es
 * exactamente cómo el frontend y el backend acabaron discrepando.
 */
export const clientSchema = crearEsquemaCliente();

/** Países cuyo `resolveCountryCode` reconocemos, por si la pantalla quiere
 *  saber si puede prometer una forma concreta o tiene que hablar en genérico. */
export const paisReconocido = (pais?: string) =>
  resolveCountryCode(pais) !== null;

export type ClientInput = z.infer<typeof clientSchema>;
