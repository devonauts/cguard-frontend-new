import type { TFunction } from "i18next";

import { mensajeDeMarca } from "./mensajesDeMarca";

/**
 * The server's refusals about a brand's SMS / WhatsApp senders (phase 5), in
 * plain words. Literal keys (the i18n guard test sees them). Anything else
 * goes to the brand messages.
 */
export function mensajeDeRemitente(t: TFunction, code: string | null): string {
  switch (code) {
    case "brand_sender_no_sms_account":
      return t(
        "ui.RemitentesDeMarca.errores.sinCuentaSms",
        "La empresa aún no tiene cuenta de SMS. Créala en Configuración › SMS.",
      );
    case "brand_sender_number_unknown":
      return t(
        "ui.RemitentesDeMarca.errores.numeroAjeno",
        "Ese número no pertenece a la empresa.",
      );
    case "brand_sender_is_company_number":
      return t(
        "ui.RemitentesDeMarca.errores.esDeLaEmpresa",
        "Ese es el número de la empresa: para usarlo, deja la marca sin número propio.",
      );
    case "brand_sender_number_taken":
      return t(
        "ui.RemitentesDeMarca.errores.ocupado",
        "Ese número ya lo usa otra marca.",
      );
    case "brand_sender_no_company_whatsapp":
      return t(
        "ui.RemitentesDeMarca.errores.sinWaEmpresa",
        "La empresa aún no tiene su WhatsApp Business conectado.",
      );
    case "brand_sender_phone_required":
      return t(
        "ui.RemitentesDeMarca.faltaTelefono",
        "Escribe el teléfono al que enviar la prueba.",
      );
    case "NO_SUBACCOUNT":
    case "TWILIO_NOT_CONFIGURED":
      return t(
        "ui.RemitentesDeMarca.errores.sinCuentaSms",
        "La empresa aún no tiene cuenta de SMS. Créala en Configuración › SMS.",
      );
    case "INSUFFICIENT_BALANCE":
      return t(
        "ui.RemitentesDeMarca.errores.sinSaldo",
        "No hay saldo suficiente para comprar el número.",
      );
    default:
      return code === null ||
        code.startsWith("marca_") ||
        code.startsWith("brand_") ||
        code === "addon_required"
        ? mensajeDeMarca(t, code)
        : t(
            "ui.RemitentesDeMarca.errores.generico",
            "No se pudo completar. Inténtalo de nuevo.",
          );
  }
}
