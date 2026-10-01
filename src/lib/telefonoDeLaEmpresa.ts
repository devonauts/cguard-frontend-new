/**
 * EL TELÉFONO SE ESCRIBE COMO EN EL PAÍS DE LA EMPRESA.
 *
 * Varias pantallas enseñaban un ejemplo de teléfono escrito a mano —«+593 99…»,
 * «+593 123456789»— y una empresa de México o de EE. UU. leía el prefijo de
 * Ecuador en sus formularios (queja de clientes, 2026-09-30). Aquí se resuelve
 * UNA vez qué país manda y qué ejemplo enseñar, con la misma librería que usa
 * el campo de teléfono (`PhoneInput`), para que el ejemplo y el campo digan lo
 * mismo.
 *
 * Orden: el país de la empresa (se guarda al entrar, ver app-layout) → el del
 * dispositivo o navegador → y sólo si no se sabe nada, Ecuador.
 */
import {
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  type CountryCode,
} from "libphonenumber-js";
import examples from "libphonenumber-js/mobile/examples";

import { getTenantCountry } from "@/utils/tenantLocation";
import { paisConocido } from "@/lib/paisDelVisitante";

const RESPALDO: CountryCode = "EC";

function valido(c: string | null | undefined): CountryCode | null {
  const v = String(c || "").trim().toUpperCase();

  return (getCountries() as string[]).includes(v) ? (v as CountryCode) : null;
}

/** El país con el que escribir teléfonos en esta empresa. */
export function paisDeLaEmpresa(): CountryCode {
  return valido(getTenantCountry()) ?? valido(paisConocido()) ?? RESPALDO;
}

/** «+52», «+1», «+593»… del país de la empresa (o del que se pida). */
export function prefijoDeLaEmpresa(pais?: string | null): string {
  const p = valido(pais) ?? paisDeLaEmpresa();

  return `+${getCountryCallingCode(p)}`;
}

/** Un móvil de ejemplo en formato internacional: «+52 222 123 4567». */
export function ejemploDeTelefono(pais?: string | null): string {
  const p = valido(pais) ?? paisDeLaEmpresa();

  try {
    return getExampleNumber(p, examples as any)?.formatInternational() ?? prefijoDeLaEmpresa(p);
  } catch {
    return prefijoDeLaEmpresa(p);
  }
}
