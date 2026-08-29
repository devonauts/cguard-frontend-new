import { z } from "zod";
import i18n from "@/i18n";

// Esquema de MÓDULO: se construye al importar el fichero, así que un `t()` suelto
// aquí congelaría el texto en el idioma de arranque. zod acepta una FUNCIÓN en
// `error` y la ejecuta AL VALIDAR: ahí sí sale en el idioma vigente.
const msj = (clave: string, texto: string) => () => i18n.t(clave, texto);

export const accessLevels = ["Super Admin", "Admin", "Operador", "Lectura"] as const;

export const newAdminUserSchema = z.object({
    name: z.string().trim().min(1, { error: msj("validation.common.nameRequired", "El nombre es requerido") }),
    email: z.string().trim().email({ error: msj("clients.contacts.errors.invalidEmail", "Correo inválido") }),
    // accessLevel will store the selected role id (dynamic from backend)
    accessLevel: z.string().trim().min(1, { error: msj("validation.adminUser.accessLevelRequired", "Seleccione un nivel") }),
    clientIds: z.array(z.string()).optional(),
    postSiteIds: z.array(z.string()).optional(),
    stationIds: z.array(z.string()).optional(),
});

export type NewAdminUserValues = z.infer<typeof newAdminUserSchema>;
