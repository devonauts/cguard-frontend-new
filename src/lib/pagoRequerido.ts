import i18n from "@/i18n";
import { toast } from "sonner";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LOS 402 DEL COBRO DEL SOCIO — lo mismo para los dos clientes HTTP del CRM
 *
 * El CRM habla con el servidor por dos caminos (`lib/api.ts`, axios, y
 * `services/api/apiService.ts`, fetch). Una empresa de socio pausada recibe 402
 * en TODAS las peticiones salvo las de su página de pago, venga por donde
 * venga, así que la reacción vive aquí una sola vez:
 *
 *   - `company_payment_required`: la EMPRESA no ha pagado a su socio. Lo puede
 *     arreglar ella poniendo su tarjeta → aviso y a Facturación.
 *   - `reseller_payment_required`: quien no paga es el SOCIO. La empresa no
 *     puede hacer nada desde aquí → sólo el aviso, sin mandarla a ningún sitio.
 *
 * Sin bucles: en la propia página de Facturación no se redirige, y tampoco se
 * repite el aviso — la página ya enseña el estado de pausa con todo detalle, y
 * los sondeos de la cabecera lo repetirían cada medio minuto.
 * ════════════════════════════════════════════════════════════════════════════
 */

export const CODIGO_PAGO_DE_EMPRESA = "company_payment_required";
export const CODIGO_PAGO_DEL_SOCIO = "reseller_payment_required";

const RUTA_DE_FACTURACION = "/setting/billing";
const VENTANA_SIN_REPETIR = 3000; // ms

let ultimoAviso: string | null = null;
let ultimoAvisoEn = 0;

function estaEnFacturacion(): boolean {
  try {
    const p = String(window.location.pathname);

    return p.startsWith(RUTA_DE_FACTURACION) || p.startsWith("/billing");
  } catch {
    return false;
  }
}

function avisar(mensaje: string) {
  const ahora = Date.now();

  if (ultimoAviso === mensaje && ahora - ultimoAvisoEn < VENTANA_SIN_REPETIR)
    return;
  ultimoAviso = mensaje;
  ultimoAvisoEn = ahora;
  // El `id` fija un único aviso aunque lo pidan los dos clientes a la vez.
  toast.error(mensaje, { id: `pago-requerido:${mensaje}` });
}

/**
 * Reacciona a un 402 del cobro del socio. Devuelve `true` si el código era uno
 * de los dos (y ya se avisó), para que quien llama no pinte su propio error.
 *
 * `silencioso`: petición de fondo (sondeo). Ni aviso ni salto — igual que con
 * `subscription_required`, no se arranca a nadie de un formulario a medias por
 * una petición que no pidió.
 */
export function manejarPagoRequerido(
  status: number | undefined,
  codigo: string | undefined | null,
  mensaje: string | undefined | null,
  { silencioso = false }: { silencioso?: boolean } = {},
): boolean {
  if (status !== 402) return false;

  if (codigo === CODIGO_PAGO_DEL_SOCIO) {
    if (!silencioso)
      avisar(
        mensaje ||
          i18n.t(
            "ui.pagoRequerido.servicioPausadoPorProveedor",
            "El servicio de esta cuenta está pausado hasta que tu proveedor registre su método de pago.",
          ),
      );

    return true;
  }

  if (codigo !== CODIGO_PAGO_DE_EMPRESA) return false;

  if (silencioso || typeof window === "undefined" || estaEnFacturacion())
    return true;

  avisar(
    mensaje ||
      i18n.t(
        "ui.pagoRequerido.suscripcionPausadaPorFaltaDePago",
        "Tu suscripción está pausada por falta de pago. Añade o actualiza tu tarjeta en Facturación.",
      ),
  );
  try {
    // Mismo patrón que `subscription_required`: primero un evento que el router
    // pueda atender sin recargar; si nadie lo atiende, navegación completa.
    const evt = new CustomEvent("app:company-payment-required", {
      cancelable: true,
    });
    const nadieLoAtendio = window.dispatchEvent(evt);

    if (nadieLoAtendio && !evt.defaultPrevented)
      window.location.assign(RUTA_DE_FACTURACION);
  } catch {
    /* nunca romper la petición por la redirección */
  }

  return true;
}

/** Para las pruebas. */
export function olvidarUltimoAviso() {
  ultimoAviso = null;
  ultimoAvisoEn = 0;
}
