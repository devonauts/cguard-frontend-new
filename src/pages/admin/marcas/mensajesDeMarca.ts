import type { TFunction } from "i18next";

import { mensajeDeAccesoDeMarca } from "@/lib/multimarca/accesoDeMarca";

/**
 * The server's refusals about brands, in plain words. Literal keys (the i18n
 * guard test sees them). Unknown codes get the generic line.
 */
export function mensajeDeMarca(t: TFunction, code: string | null): string {
  // Phase 2: a refusal of the brand access (brand admin) in its own words.
  if (code && code.startsWith("marca_")) return mensajeDeAccesoDeMarca(code);
  switch (code) {
    case "brand_is_principal":
      return t(
        "ui.MarcasPage.errores.esPrincipal",
        "La marca principal no se puede archivar: es la empresa con la que se creó la cuenta.",
      );
    case "brand_has_clients":
      return t(
        "ui.MarcasPage.errores.tieneClientes",
        "Esta marca todavía tiene clientes. Pásalos a otra marca y vuelve a intentarlo.",
      );
    case "brand_slots_exhausted":
      return t(
        "ui.MarcasPage.errores.sinCupos",
        "Ya usas todas las marcas que tienes. Agrega otra para seguir.",
      );
    case "brand_invalid_tax_id":
      return t(
        "ui.MarcasPage.errores.identificadorMalo",
        "El identificador fiscal no es válido para el país elegido.",
      );
    case "brand_missing_field":
      return t(
        "ui.MarcasPage.errores.faltanDatos",
        "Faltan datos obligatorios: nombre, razón social, identificador fiscal y país.",
      );
    // Phase 5: billing texts and hour rates.
    case "brand_text_invalid":
      return t(
        "ui.MarcasPage.errores.textoMalo",
        "Revisa los textos de factura de la marca.",
      );
    case "hour_rate_invalid":
      return t(
        "ui.MarcasPage.errores.tarifaMala",
        "Revisa la tarifa: dos empresas, un importe por hora y la fecha desde la que rige.",
      );
    case "hour_rate_same_brand":
      return t(
        "ui.TarifasEntreMarcas.mismaMarca",
        "La tarifa es entre dos empresas distintas.",
      );
    case "hour_rate_currency_mismatch":
      return t(
        "ui.MarcasPage.errores.tarifaMoneda",
        "Este par de marcas ya tiene tarifas en otra moneda.",
      );
    case "addon_required":
      return t(
        "ui.MarcasPage.errores.sinModulo",
        "El módulo Multimarca no está activo.",
      );
    default:
      return t("ui.MarcasPage.errores.guardar", "No se pudo guardar la marca.");
  }
}
