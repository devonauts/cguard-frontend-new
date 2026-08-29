import { z } from "zod";
import i18n from "@/i18n";
import { validateCedulaOrRuc } from "./id";

// Este esquema vive en el módulo: un t() suelto aquí se evaluaría al cargar y
// congelaría el idioma de arranque. Por eso el texto se resuelve TARDE — dentro
// de la función `error`, que zod llama en cada validación.
const msj = (clave: string, texto: string) => () => i18n.t(clave, texto);

/** Mensaje de longitud máxima. Igual que `msj`: es una FUNCIÓN, así que zod la
 *  ejecuta al validar, ya con el idioma del usuario puesto. */
const maxChars = (n: number) => ({
    error: () => i18n.t("validation.postSite.maxChars", { n, defaultValue: "Máximo {{n}} caracteres" }),
});

export const clientSchema = z
    .object({
    name: z
        .string()
        .trim()
        .min(1, { error: msj("validation.client.nameRequired", "Nombre del cliente requerido") })
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
        .min(1, { error: msj("validation.client.emailRequired", "Email requerido") })
        .email({ error: msj("clients.contacts.errors.invalidEmail", "Correo inválido") })
        .max(150, maxChars(150)),
    phoneNumber: z
        .string()
        .trim()
        .min(1, { error: msj("validation.client.phoneRequired", "Teléfono requerido") })
        .max(20, maxChars(20)),
    address: z
        .string()
        .trim()
        .min(1, { error: msj("validation.client.addressRequired", "Dirección requerida") })
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
        .min(1, { error: msj("validation.client.postalCodeRequired", "Código postal requerido") })
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
    latitude: z
        .coerce.string()
        .trim()
        .optional()
        .or(z.literal(""))
        .refine((val) => !val || !Number.isNaN(Number(val)), {
            error: msj("clients.validation.latitude_numeric", "Latitud debe ser numérica"),
        })
        .refine((val) => !val || (Number(val) >= -90 && Number(val) <= 90), {
            error: msj("validation.client.latitudeRange", "Latitud entre -90 y 90"),
        }),
    longitude: z
        .coerce.string()
        .trim()
        .optional()
        .or(z.literal(""))
        .refine((val) => !val || !Number.isNaN(Number(val)), {
            error: msj("clients.validation.longitude_numeric", "Longitud debe ser numérica"),
        })
        .refine((val) => !val || (Number(val) >= -180 && Number(val) <= 180), {
            error: msj("validation.client.longitudeRange", "Longitud entre -180 y 180"),
        }),
    active: z.boolean().optional(),
    commercialName: z
        .string()
        .trim()
        .max(200, maxChars(200))
        .optional()
        .or(z.literal("")),
    contractDate: z
        .string()
        .optional()
        .or(z.literal("")),
    contractEndDate: z.string().optional().or(z.literal("")),
    riskLevel: z.string().optional().or(z.literal("")),
    // Orden de compra (opcional) — clientes públicos/estatales que contratan
    // por orden de compra en lugar de contrato directo.
    purchaseOrder: z.string().max(120).optional().or(z.literal("")),
    code: z.string().trim().max(50, maxChars(50)).optional().or(z.literal("")),
    accountExecutiveId: z.string().optional().or(z.literal("")),
    // Representante legal (persona) — separado de la empresa.
    legalRepFirstName: z.string().trim().max(150).optional().or(z.literal("")),
    legalRepLastName: z.string().trim().max(150).optional().or(z.literal("")),
    legalRepEmail: z.string().trim().max(200).optional().or(z.literal("")),
    legalRepPhone: z.string().trim().max(30).optional().or(z.literal("")),
    legalRepDocument: z.string().trim().max(20).optional().or(z.literal("")),
    // Tipo de persona (Persona Natural / Persona Jurídica)
    personType: z.enum(['PN', 'PJ']).optional(),
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
        if (v == null || v === '') return undefined;
        const arr = Array.isArray(v) ? v : [v];
        const ids = arr
            .map((x: any) => (typeof x === 'string' ? x : (x && (x.id ?? x.value ?? x._id))))
            .filter((x: any) => typeof x === 'string' && x.length > 0);
        return ids.length ? ids : undefined;
    }, z.array(z.string()).optional()),
})
.superRefine((data, ctx) => {
    const personType = data.personType || 'PN';
    const doc = (data.documentNumber || '').toString().trim();
    if (!doc) {
        // Aquí ya estamos DENTRO de la validación: i18n.t() directo es correcto,
        // se resuelve con el idioma vivo.
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['documentNumber'], message: i18n.t('validation.client.documentRequired', 'RUC/Cédula requerido') });
        return;
    }

    const digits = doc.replace(/\D/g, '');
    if (personType === 'PN') {
        // Persona natural: debe ser una cédula válida de 10 dígitos
        if (!validateCedulaOrRuc(digits) || digits.length !== 10) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['documentNumber'], message: i18n.t('clients.validation.cedula_invalid', 'Cédula inválida') });
        }
    } else if (personType === 'PJ') {
        // Persona jurídica: RUC de 13 dígitos que termina en 001 y cuyos primeros 10 conforman una cédula válida
        if (!validateCedulaOrRuc(digits) || digits.length !== 13) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['documentNumber'], message: i18n.t('clients.validation.ruc_invalid', 'RUC inválido (debe terminar en 001 y contener cédula válida)') });
        }
    }
});

export type ClientInput = z.infer<typeof clientSchema>;
