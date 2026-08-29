import { z } from "zod";
import i18n from "@/i18n";

// Esquema de MÓDULO: se construye al importar el fichero, así que un `t()` suelto
// aquí congelaría el texto en el idioma de arranque. zod acepta una FUNCIÓN en
// `error` y la ejecuta AL VALIDAR: ahí sí sale en el idioma vigente.
const msj = (clave: string, texto: string) => () => i18n.t(clave, texto);

export const vehicleCreateSchema = z.object({
  year: z
    .string()
    .min(4, { error: msj("validation.vehicle.yearInvalid", "Año inválido") })
    .refine((v) => /^\d{4}$/.test(v), { error: msj("validation.vehicle.yearInvalid", "Año inválido") }),
  make: z.string().min(1, { error: msj("validation.vehicle.makeRequired", "Marca requerida") }),
  model: z.string().min(1, { error: msj("validation.vehicle.modelRequired", "Modelo requerido") }),
  color: z.string().min(1, { error: msj("validation.vehicle.colorRequired", "Color requerido") }),
  plate: z.string().min(1, { error: msj("validation.vehicle.plateRequired", "Placa requerida") }),
  initialMileage: z
    .string()
    .min(1, { error: msj("validation.vehicle.mileageRequired", "Kilometraje inicial requerido") })
    .refine((v) => /^\d+$/.test(v), { error: msj("validation.vehicle.digitsOnly", "Solo números") }),
  ownership: z.enum(["propio", "alquilado", "cliente"]).default("propio"),
  vin: z
    .string()
    .min(17, { error: msj("validation.vehicle.vinLength", "VIN inválido (debe tener exactamente 17 caracteres)") })
    .max(17, { error: msj("validation.vehicle.vinLength", "VIN inválido (debe tener exactamente 17 caracteres)") })
    .refine(
      (v) => /^[A-HJ-NPR-Z0-9]{17}$/i.test(v),
      { error: msj("validation.vehicle.vinAlphanumeric", "VIN inválido (debe tener exactamente 17 caracteres alfanuméricos)") },
    ),
  description: z.string().optional(),
  image: z.instanceof(File).optional().or(z.undefined()),
});

export type VehicleCreateSchema = z.infer<typeof vehicleCreateSchema>;
