import { Bike, Car, CarFront, Motorbike, Scooter, Truck, type LucideIcon } from "lucide-react";

import i18n from "@/i18n";
import { localeActual } from "@/lib/localeActual";

/**
 * Flota (2026-11-04): las palabras e iconos de tipos, propiedad, estado,
 * combustible y alertas, compartidos por la lista, el formulario y el diálogo
 * de salida y devolución. Los valores crudos son el contrato con el servidor
 * (services/vehicleUseService).
 */

const t = (clave: string, texto: string) => i18n.t(clave, texto);

export const TIPOS: Array<{ id: string; icon: LucideIcon; key: string; label: string }> = [
  { id: "car", icon: Car, key: "ui.flota.tipo.car", label: "Auto" },
  { id: "pickup", icon: Truck, key: "ui.flota.tipo.pickup", label: "Camioneta" },
  { id: "motorcycle", icon: Motorbike, key: "ui.flota.tipo.motorcycle", label: "Moto" },
  { id: "bicycle", icon: Bike, key: "ui.flota.tipo.bicycle", label: "Bicicleta" },
  { id: "scooter", icon: Scooter, key: "ui.flota.tipo.scooter", label: "Scooter" },
  { id: "other", icon: CarFront, key: "ui.flota.tipo.other", label: "Otro" },
];
export const tipoDe = (id?: string | null) => TIPOS.find((x) => x.id === id) || TIPOS[0];
export const tipoLabel = (id?: string | null) => {
  const x = tipoDe(id);

  return t(x.key, x.label);
};

/** Tipos sin odómetro: el uso se registra sin lecturas. */
export const SIN_ODOMETRO = new Set(["bicycle"]);

export const PROPIEDADES: Array<{ id: string; key: string; label: string }> = [
  { id: "company", key: "ui.flota.propiedad.company", label: "De la empresa" },
  { id: "rented", key: "ui.flota.propiedad.rented", label: "Alquilado" },
  { id: "client", key: "ui.flota.propiedad.client", label: "Del cliente" },
  { id: "personal", key: "ui.flota.propiedad.personal", label: "Personal de un supervisor" },
];
/** Lo viejo (texto libre) a lo de ahora. */
export const propiedadNormal = (v?: string | null) =>
  ({ propio: "company", alquilado: "rented", cliente: "client" } as Record<string, string>)[String(v)] ||
  (PROPIEDADES.some((p) => p.id === v) ? String(v) : "company");
export const propiedadLabel = (v?: string | null) => {
  const p = PROPIEDADES.find((x) => x.id === propiedadNormal(v))!;

  return t(p.key, p.label);
};

export const ESTADOS: Record<string, { key: string; label: string; tone: string }> = {
  available: { key: "ui.flota.estado.available", label: "Disponible", tone: "ok" },
  in_use: { key: "ui.flota.estado.in_use", label: "En uso", tone: "brand" },
  maintenance: { key: "ui.flota.estado.maintenance", label: "En taller", tone: "warn" },
  out_of_service: { key: "ui.flota.estado.out_of_service", label: "Fuera de servicio", tone: "bad" },
};
export const estadoLabel = (v?: string | null) => {
  const e = ESTADOS[String(v)] || ESTADOS.available;

  return t(e.key, e.label);
};
export const estadoTone = (v?: string | null) => (ESTADOS[String(v)] || ESTADOS.available).tone;

export const COMBUSTIBLE: Array<{ id: string; key: string; label: string }> = [
  { id: "empty", key: "ui.flota.combustible.empty", label: "Reserva" },
  { id: "quarter", key: "ui.flota.combustible.quarter", label: "1/4" },
  { id: "half", key: "ui.flota.combustible.half", label: "1/2" },
  { id: "three_quarters", key: "ui.flota.combustible.three_quarters", label: "3/4" },
  { id: "full", key: "ui.flota.combustible.full", label: "Lleno" },
];

export const ALERTAS: Record<string, { key: string; label: string }> = {
  odometer_jump: { key: "ui.flota.alerta.odometer_jump", label: "Salto grande desde la última lectura" },
  distance_implausible: { key: "ui.flota.alerta.distance_implausible", label: "Recorrido demasiado largo" },
  odometer_vs_gps: { key: "ui.flota.alerta.odometer_vs_gps", label: "El odómetro dice mucho más que el GPS" },
};
export const alertaLabel = (v: string) => (ALERTAS[v] ? t(ALERTAS[v].key, ALERTAS[v].label) : v);

/** «12.345,6 km» en el formato del usuario. */
export function lectura(valor: unknown, unidad?: string | null): string {
  const n = Number(valor);

  if (valor === null || valor === undefined || valor === "" || !Number.isFinite(n)) return "—";

  return `${n.toLocaleString(localeActual(), { maximumFractionDigits: 1 })} ${unidad === "mi" ? "mi" : "km"}`;
}
