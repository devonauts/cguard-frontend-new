/**
 * «TEXTOS DE FACTURA» of a brand (Multimarca phase 5) — the pure part.
 *
 * Mike, 2026-11-02: payment instructions, bank details, the invoice footer and
 * every other company-level text on invoices, quotes, their e-mails and the
 * client reports are PER BRAND. The server decides what prints:
 *   · a non-principal brand prints ONLY its own texts; an empty one is left
 *     out (never the principal's);
 *   · the principal brand prints its own text, else the company's.
 * Payment methods: a brand with its own list offers it (with its bank
 * details); one without offers the company's methods bare, without details.
 */
import type { ClaveDeTexto, DatosDeMarca, Marca, MetodoDePago } from "@/lib/api/marcasService";

/** Every free text a brand document prints (same names as the server's brand columns). */
export const CLAVES_DE_TEXTO: readonly ClaveDeTexto[] = [
  "invoiceTitle",
  "invoiceDefaultNotes",
  "invoiceTerms",
  "invoiceFooter",
  "paymentInstructions",
  "quoteTitle",
  "quoteDefaultIntro",
  "quoteTerms",
  "quoteClosing",
  "quoteFooter",
  "reportFooterText",
];

/** The six built-in ways of paying (same keys as the billing settings). */
export const METODOS_BASE = ["transfer", "directDeposit", "wire", "check", "card", "cash"] as const;
export type MetodoBase = (typeof METODOS_BASE)[number];

export type TextosBorrador = Record<ClaveDeTexto, string> & { metodos: MetodoDePago[] };

/** Same limits as the server (titles are one line). */
export const LIMITES_DE_TEXTO: Record<ClaveDeTexto, number> = {
  invoiceTitle: 40,
  invoiceDefaultNotes: 4000,
  invoiceTerms: 4000,
  invoiceFooter: 4000,
  paymentInstructions: 4000,
  quoteTitle: 40,
  quoteDefaultIntro: 4000,
  quoteTerms: 12000,
  quoteClosing: 4000,
  quoteFooter: 4000,
  reportFooterText: 2000,
};

/** The form's starting point from a brand (empty strings for no text). */
export function textosDe(m: Pick<Marca, "billingTexts"> | null | undefined): TextosBorrador {
  const bt = m?.billingTexts;
  const out = {} as TextosBorrador;

  for (const k of CLAVES_DE_TEXTO) out[k] = String(bt?.[k] ?? "");
  const propios = Array.isArray(bt?.paymentMethods) ? bt!.paymentMethods! : [];

  // Every built-in in its canonical order, then the brand's own extra ones.
  out.metodos = [
    ...METODOS_BASE.map(
      (method) =>
        propios.find((x) => x.method === method) ?? {
          method,
          builtin: true,
          label: null,
          enabled: false,
          description: null,
          note: null,
        },
    ),
    ...propios.filter((x) => !(METODOS_BASE as readonly string[]).includes(x.method)),
  ];

  return out;
}

/** Does the brand have any way of paying of its own (one ticked, or written details)? */
export function tieneMetodosPropios(metodos: MetodoDePago[]): boolean {
  return metodos.some((m) => m.enabled || String(m.description || "").trim() || String(m.note || "").trim());
}

/**
 * The texts as the server takes them: trimmed to the limits, one-line titles,
 * empty = null; the methods only when the brand set any (else null: no list of
 * its own).
 */
export function datosDeTextos(b: TextosBorrador): Partial<DatosDeMarca> {
  const out: Partial<DatosDeMarca> = {};

  for (const k of CLAVES_DE_TEXTO) {
    const lim = LIMITES_DE_TEXTO[k];
    const v = lim <= 40 ? b[k].replace(/\s+/g, " ").trim() : b[k];

    (out as any)[k] = v.trim() ? v.slice(0, lim) : null;
  }
  out.paymentMethods = tieneMetodosPropios(b.metodos)
    ? b.metodos.map((m) => ({
        method: m.method,
        builtin: m.builtin !== false && !String(m.method).startsWith("c_"),
        label: m.label ?? null,
        enabled: !!m.enabled,
        description: String(m.description || "").trim() || null,
        note: String(m.note || "").trim() || null,
      }))
    : null;

  return out;
}

/** How many texts the brand has written (for the section's summary). */
export function cuantosTextos(b: TextosBorrador): number {
  return CLAVES_DE_TEXTO.filter((k) => b[k].trim()).length + (tieneMetodosPropios(b.metodos) ? 1 : 0);
}
