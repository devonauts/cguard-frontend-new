/**
 * Integer cents → «$1,500.00 MXN», «$ 1.500,00 ARS», «S/ 1,500.00 PEN».
 *
 * The punctuation follows the CURRENCY's country, not the screen language: an
 * Argentine company reads «$ 1.500,00»; written the US way it looks like one
 * and a half pesos. And the code always goes after the amount, because «$»
 * alone is a dollar, a Mexican peso and an Argentine peso at once. Same table
 * as the server's lib/money and the partner panel, so the email, the receipt
 * and this screen show the same figure the same way.
 */
const LOCALE_OF_CURRENCY: Record<string, string> = {
  USD: "en-US", MXN: "es-MX", PEN: "es-PE", ARS: "es-AR", PAB: "es-PA",
  COP: "es-CO", CLP: "es-CL", GTQ: "es-GT", CRC: "es-CR", DOP: "es-DO", BRL: "pt-BR",
  BOB: "es-BO", UYU: "es-UY", HNL: "es-HN", NIO: "es-NI", CAD: "en-CA", EUR: "es-ES",
};

export function formatMoney(cents: number | null | undefined, currency = "USD"): string {
  const code = String(currency || "USD").toUpperCase();
  const n = Number(cents);
  if (cents === null || cents === undefined || !Number.isFinite(n)) return `— ${code}`;
  try {
    const text = new Intl.NumberFormat(LOCALE_OF_CURRENCY[code] ?? "en-US", {
      style: "currency", currency: code, currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(Math.trunc(n) / 100);
    return `${text} ${code}`.replace(/[  ]/g, " ");
  } catch {
    return `${(Math.trunc(n) / 100).toFixed(2)} ${code}`;
  }
}
