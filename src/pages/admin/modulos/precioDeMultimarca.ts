import { precioDeModulo } from "./precioDeModulo";

/**
 * MULTIMARCA'S PRICE as the company reads it (contract 2026-11-01): one-time
 * 450 USD that includes TWO brands (the principal + one more), and 50 USD for
 * each further brand.
 *
 * The store sends the module amount already in the company's currency (a
 * partner's company: its partner's, at the day's rate) together with the USD
 * it is really charged. The extra-brand amount is converted with that same
 * rate and the server's rounding (whole units), so both figures read in one
 * currency. If the server ever sends `extraBrandPriceCents`, that one wins.
 */
export const MARCAS_INCLUIDAS = 2;
export const PRECIO_MARCA_EXTRA_USD_CENTS = 5000;

export interface ModuloConPrecio {
  priceCents: number | null;
  currency: string | null | undefined;
  chargePriceCents?: number | null;
  chargeCurrency?: string | null;
  priceHidden?: boolean;
  extraBrandPriceCents?: number | null;
}

/** One extra brand in the company's currency (cents), or null when hidden. */
export function centavosDeMarcaExtra(m: ModuloConPrecio): number | null {
  if (m.priceHidden || m.priceCents == null) return null;
  if (m.extraBrandPriceCents != null) return Number(m.extraBrandPriceCents);
  const moneda = String(m.currency || "USD").toUpperCase();
  const cobro = String(m.chargeCurrency || "USD").toUpperCase();

  if (moneda === "USD" || moneda === cobro) return PRECIO_MARCA_EXTRA_USD_CENTS;
  const usd = Number(m.chargePriceCents);

  if (!Number.isFinite(usd) || usd <= 0) return null;
  const tasa = Number(m.priceCents) / usd;

  // The server's `convertir`: whole units of the company's currency.
  return Math.round((PRECIO_MARCA_EXTRA_USD_CENTS * tasa) / 100) * 100;
}

/**
 * The two figures of the store card: the module («$450 USD») and one extra
 * brand («$50 USD»), both in the company's currency. Null = no amount is
 * shown (the module is already switched on).
 */
export function precioDeMultimarca(
  m: ModuloConPrecio,
): { precio: string; extra: string | null } | null {
  if (m.priceHidden || m.priceCents == null) return null;
  const extra = centavosDeMarcaExtra(m);

  return {
    precio: precioDeModulo(m.priceCents, m.currency),
    extra: extra == null ? null : precioDeModulo(extra, m.currency),
  };
}
