import type {
  CobroDelSocioActivo,
  ResultadoDelCobro,
} from "@/lib/api/partnerBillingService";

/**
 * Las decisiones de la pantalla «le pago a mi proveedor», sin React: qué aviso
 * se enseña, qué botón de tarjeta, si se ofrece pagar ya. Se prueban solas en
 * `cobroDelSocio.test.ts`.
 */

export type TonoDelAviso = "info" | "ok" | "warn" | "bad" | "neutral";

/** Tono semántico del estado — nunca el acento: «en pausa» es rojo aunque la marca sea roja. */
export const TONO_DEL_ESTADO: Record<string, TonoDelAviso> = {
  trialing: "info",
  active: "ok",
  past_due: "warn",
  paused: "bad",
  exempt: "neutral",
};

export const TONO_DEL_RECIBO: Record<string, TonoDelAviso> = {
  paid: "ok",
  open: "warn",
  void: "neutral",
};

/**
 * Sólo Stripe tiene hoy formulario de tarjeta. Con otra pasarela se dice con
 * su nombre que todavía no se puede, en vez de enseñar un botón que no hace nada.
 */
export function pasarelaConFormulario(d: CobroDelSocioActivo): boolean {
  return d.gateway?.provider === "stripe" && !!d.gateway?.publicKey;
}

/** `add` sin tarjeta, `replace` con ella, `unsupported` si la pasarela aún no tiene formulario. */
export function accionDeTarjeta(
  d: CobroDelSocioActivo,
): "add" | "replace" | "unsupported" {
  if (!pasarelaConFormulario(d)) return "unsupported";

  return d.card ? "replace" : "add";
}

/**
 * «Pagar ahora» sólo cuando hay algo que pagar Y una tarjeta con la que
 * pagarlo. Sin tarjeta, el botón de añadirla ya cobra lo pendiente al guardarla
 * (el servidor lo intenta en el acto), así que un segundo botón sobraría.
 */
export function puedePagarAhora(d: CobroDelSocioActivo): boolean {
  return (
    d.amountDueCents > 0 &&
    d.status !== "exempt" &&
    !!d.card &&
    pasarelaConFormulario(d)
  );
}

/** Lo que cuesta cada mes, desglosado. */
export function desgloseDelPlan(d: CobroDelSocioActivo) {
  const porUsuarios = (d.price?.perUserCents || 0) * (d.seatsNow || 0);

  return {
    porUsuarios,
    cuotaMensual: d.price?.monthlyFeeCents || 0,
    totalMensual: porUsuarios + (d.price?.monthlyFeeCents || 0),
  };
}

/**
 * Una fecha del servidor puede venir como día civil (`YYYY-MM-DD`: el aniversario,
 * el fin del ciclo) o como instante ISO. Cada una se pinta con su función de
 * `horaDeLaEmpresa`; aquí sólo se distingue cuál es.
 */
export function esDiaCivil(v: string | null | undefined): boolean {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Resumen de un cobro recién intentado, para el aviso. */
export function resumenDelCobro(r: ResultadoDelCobro | null | undefined): {
  cobradas: number;
  motivos: string[];
  requiereAccion: boolean;
} {
  return {
    cobradas: r?.cobradas?.length || 0,
    motivos: (r?.fallidas || [])
      .map((f) => [f.number, f.motivo].filter(Boolean).join(": "))
      .filter(Boolean),
    requiereAccion: !!r?.requiereAccion?.clientSecret,
  };
}
