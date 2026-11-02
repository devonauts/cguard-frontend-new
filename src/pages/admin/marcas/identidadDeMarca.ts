/**
 * How a brand faces ITS clients (Multimarca phase 3): the pure part of the
 * preview «Así ve esta marca su cliente». The server is the one that prints
 * invoices, reports and mails; this mirrors its rules so the preview does
 * not promise something else:
 *
 *   · the principal brand changes nothing (the company prints as today);
 *   · any other brand IS the legal issuer: its legal name, tax id, address
 *     and e-mail replace the company's;
 *   · its invoices have their own series (phase-5 default):
 *     `<invoicePrefix or code>-<company prefix>` — BETA-INV, BETA-CN, BETA-QUO;
 *   · the mail From NAME is `senderName` (else the brand name); the address
 *     stays the platform's.
 */

/** #rrggbb → relative luminance 0 (dark) … 1 (light); null when not a hex colour. */
export function luminancia(hex: string | null | undefined): number | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  const ch = (c: number) => {
    const v = c / 255;

    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * ch((n >> 16) & 255) +
    0.7152 * ch((n >> 8) & 255) +
    0.0722 * ch(n & 255)
  );
}

/** White or dark ink on a coloured band (the same cut the PDF uses). */
export function tintaSobre(hex: string | null | undefined): string {
  const l = luminancia(hex);

  return l !== null && l > 0.45 ? "#0f172a" : "#ffffff";
}

/**
 * The series a sample invoice of the brand would carry. `prefijoEmpresa`
 * is the company's (unknown here → the placeholder the caller passes).
 */
export function serieDeFactura(
  b: { invoicePrefix?: string | null; code?: string | null; isPrincipal?: boolean },
  prefijoEmpresa: string,
): string {
  if (b.isPrincipal) return prefijoEmpresa;
  const propio = String(b.invoicePrefix || "").trim() || String(b.code || "").trim();

  return propio ? `${propio.toUpperCase()}-${prefijoEmpresa}` : prefijoEmpresa;
}

/** A website as people read it: no scheme, no trailing slash. */
export function webLegible(url: string | null | undefined): string {
  return String(url || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

/** Whether a website looks usable (a host with a dot; scheme optional). */
export function webValida(url: string | null | undefined): boolean {
  const s = String(url || "").trim();

  if (!s) return true;

  return /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(s);
}

/** Invoice prefix: letters, digits and dashes, up to 12 (the column size). */
export function prefijoValido(p: string | null | undefined): boolean {
  const s = String(p || "").trim();

  return !s || /^[A-Za-z0-9-]{1,12}$/.test(s);
}
