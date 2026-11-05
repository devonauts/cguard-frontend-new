import { z } from "zod";

import i18n from "@/i18n";

// Esquema de MÓDULO: se construye al importar el fichero, así que un `t()` suelto
// aquí congelaría el texto en el idioma de arranque. zod acepta una FUNCIÓN en
// `error` y la ejecuta AL VALIDAR: ahí sí sale en el idioma vigente.
const msj = (clave: string, texto: string) => () => i18n.t(clave, texto);

/**
 * Flota (2026-11-04): autos, camionetas, motos, bicicletas, scooters. Lo que
 * se exige depende del tipo — una bicicleta no tiene placa ni odómetro — y un
 * vehículo personal necesita a su dueño. El VIN es opcional (muchas motos se
 * registran sin él), pero si se escribe tiene que ser uno de verdad.
 */
export const vehicleCreateSchema = z
  .object({
    vehicleType: z
      .enum(["car", "pickup", "motorcycle", "bicycle", "scooter", "other"])
      .default("car"),
    ownership: z.enum(["company", "rented", "client", "personal"]).default("company"),
    ownerUserId: z.string().optional().default(""),
    status: z.enum(["available", "maintenance", "out_of_service"]).default("available"),
    odometerUnit: z.enum(["km", "mi"]).default("km"),
    assignedPositionId: z.string().optional().default(""),
    registrationExpiresAt: z.string().optional().default(""),
    insuranceExpiresAt: z.string().optional().default(""),
    inspectionExpiresAt: z.string().optional().default(""),
    year: z
      .string()
      .optional()
      .default("")
      .refine((v) => !v || /^\d{4}$/.test(v), {
        error: msj("validation.vehicle.yearInvalid", "Año inválido"),
      }),
    make: z.string().min(1, {
      error: msj("validation.vehicle.makeRequired", "Marca requerida"),
    }),
    model: z.string().min(1, {
      error: msj("validation.vehicle.modelRequired", "Modelo requerido"),
    }),
    color: z.string().optional().default(""),
    plate: z.string().optional().default(""),
    initialMileage: z
      .string()
      .optional()
      .default("")
      .refine((v) => !v || /^\d+(\.\d)?$/.test(v), {
        error: msj("validation.vehicle.digitsOnly", "Solo números"),
      }),
    vin: z
      .string()
      .optional()
      .default("")
      .refine((v) => !v || /^[A-HJ-NPR-Z0-9]{17}$/i.test(v), {
        error: msj(
          "validation.vehicle.vinAlphanumeric",
          "VIN inválido (debe tener exactamente 17 letras o números; las letras I, O y Q no se usan)",
        ),
      }),
    description: z.string().optional(),
    image: z.instanceof(File).optional().or(z.undefined()),
  })
  .refine((v) => v.vehicleType === "bicycle" || !!v.plate?.trim(), {
    path: ["plate"],
    error: msj("validation.vehicle.plateRequired", "Placa requerida"),
  })
  .refine((v) => v.vehicleType === "bicycle" || !!v.initialMileage, {
    path: ["initialMileage"],
    error: msj("validation.vehicle.odometerRequired", "Lectura del odómetro requerida"),
  })
  .refine((v) => v.ownership !== "personal" || !!v.ownerUserId, {
    path: ["ownerUserId"],
    error: msj("validation.vehicle.ownerRequired", "Elige al supervisor dueño del vehículo"),
  });

export type VehicleCreateSchema = z.infer<typeof vehicleCreateSchema>;
