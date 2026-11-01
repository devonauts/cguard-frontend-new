import { formatMoney } from "@/lib/formatMoney";

/**
 * A module's amount as the company reads it (Mike, 2026-11-01).
 *
 * The server already sends it in the company's currency (a partner's company
 * in its partner's), and sends nothing for a module that is switched on. Here
 * it only gets written: the currency's own punctuation and its code, because
 * «$» alone is a dollar and a Mexican peso at once; whole amounts without
 * decimals («$925 MXN»).
 */
export function precioDeModulo(
  cents: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (cents === null || cents === undefined) return "";
  const texto = formatMoney(cents, currency || "USD");

  return Number(cents) % 100 === 0
    ? texto.replace(/([.,])00(?= [A-Z]{3}$)/, "")
    : texto;
}

/**
 * The figure for a confirmation that charges: the company's amount and, when
 * the card is charged in another currency, that amount too («$925 MXN ($50 USD)»).
 */
export function precioACobrar(
  cents: number | null | undefined,
  currency: string | null | undefined,
  chargeCents?: number | null,
  chargeCurrency?: string | null,
): string {
  const visto = precioDeModulo(cents, currency);
  const otra =
    chargeCents != null &&
    !!chargeCurrency &&
    String(chargeCurrency).toUpperCase() !==
      String(currency || "").toUpperCase();

  return otra
    ? `${visto} (${precioDeModulo(chargeCents, chargeCurrency)})`
    : visto;
}
