import type { ResultadoDeCompra } from "@/lib/api/modulosAdicionalesService";

import { ApiService } from "@/services/api/apiService";

/**
 * MULTIMARCA (paid one-time module) — a company that runs two or more
 * security BRANDS, each one a separate legal company with its own clients.
 * Backend: `/api/tenant/:tenantId/brands`, every route behind
 * `requireModulo('multimarca')` (402 `addon_required` without the module).
 */
const tenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t) throw new Error("tenant");

  return t;
};
const base = () => `/tenant/${tenantId()}/brands`;

export interface Marca {
  id: string;
  /** Commercial name (what people call it). */
  name: string;
  code: string | null;
  color: string | null;
  logoUrl: string | null;
  /** Legal identity: legalName, taxId and country are REQUIRED. */
  legalName: string;
  taxId: string;
  /** ISO-2. */
  country: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  establishmentCode: string | null;
  /** The brand the account was created with: exactly one, never archived. */
  isPrincipal: boolean;
  sortOrder: number;
  archivedAt: string | null;
  counts?: { clients: number; people: number };
  // ── Phase 3: how the brand faces ITS clients (invoices, reports, mail). ──
  /** Second colour of the documents (the brand colour is the first). */
  accentColor?: string | null;
  /** Header layout of its PDFs (same values as the company's); null = the company's. */
  pdfTheme?: string | null;
  /** Name in the From of the mails its clients get (the address stays the platform's). */
  senderName?: string | null;
  /** Prefix of its own invoice series; null = `<prefix>-<code>`. */
  invoicePrefix?: string | null;
  website?: string | null;
  /**
   * Phase 5: the brand's OWN texts on its documents. A non-principal brand
   * prints only these (empty = the block is left out, never the company's);
   * the principal falls back to the company's texts.
   */
  billingTexts?: TextosDeFactura;
}

/** A way of paying as the billing settings store it (bank details in `description`). */
export interface MetodoDePago {
  method: string;
  builtin?: boolean;
  label?: string | null;
  enabled: boolean;
  description?: string | null;
  note?: string | null;
}

/** Phase 5 — every company-level text a document prints, per brand. */
export interface TextosDeFactura {
  invoiceTitle: string | null;
  invoiceDefaultNotes: string | null;
  invoiceTerms: string | null;
  invoiceFooter: string | null;
  paymentInstructions: string | null;
  paymentMethods: MetodoDePago[] | null;
  quoteTitle: string | null;
  quoteDefaultIntro: string | null;
  quoteTerms: string | null;
  quoteClosing: string | null;
  quoteFooter: string | null;
  reportFooterText: string | null;
}

/** The free-text keys of `TextosDeFactura` (the list lives in pages/admin/marcas/textosDeMarca). */
export type ClaveDeTexto = Exclude<keyof TextosDeFactura, "paymentMethods">;

export interface CuposDeMarca {
  /** Brands paid for: 2 with the module + every extra slot bought. */
  paid: number;
  /** Brands in use (not archived). */
  used: number;
  /**
   * Phase 4: a refunded slot left more brands in use than paid. The brands
   * are kept; creating or unarchiving one is refused until a slot is bought.
   */
  overLimit?: boolean;
}

export interface ListaDeMarcas {
  brands: Marca[];
  principalId: string | null;
  slots: CuposDeMarca;
  /**
   * One extra brand, in the company's currency (the store rule). `amount` is
   * in cents, like every amount the store sends.
   */
  extraBrandPrice: { amount: number; currency: string } | null;
  /**
   * Phase 2: the brands THIS user is limited to (`tenantUsers.brandAccess`),
   * null = every brand. The list above already holds only those.
   */
  myAccess?: string[] | null;
}


export type DatosDeMarca = Partial<TextosDeFactura> & Partial<
  Pick<
    Marca,
    | "name"
    | "code"
    | "color"
    | "logoUrl"
    | "legalName"
    | "taxId"
    | "country"
    | "address"
    | "email"
    | "phone"
    | "establishmentCode"
    | "sortOrder"
    | "accentColor"
    | "pdfTheme"
    | "senderName"
    | "invoicePrefix"
    | "website"
  >
>;

/** The header layouts a brand's PDFs can use (the company's document styles). */
export const ESTILOS_PDF = ["classic", "band", "minimal"] as const;
export type EstiloPdf = (typeof ESTILOS_PDF)[number];

export const marcasService = {
  listar: (opts: { archivadas?: boolean } = {}): Promise<ListaDeMarcas> =>
    ApiService.get(`${base()}${opts.archivadas ? "?archived=1" : ""}`),
  crear: (d: DatosDeMarca): Promise<Marca> => ApiService.post(base(), d),
  actualizar: (id: string, d: DatosDeMarca): Promise<Marca> =>
    ApiService.put(`${base()}/${id}`, d),
  archivar: (id: string): Promise<Marca> =>
    ApiService.post(`${base()}/${id}/archive`, {}),
  desarchivar: (id: string): Promise<Marca> =>
    ApiService.post(`${base()}/${id}/unarchive`, {}),
  /** Who is registered in which brand: `{ [userId]: homeBrandId }`. */
  personas: async (): Promise<Record<string, string | null>> => {
    const d: any = await ApiService.get(`${base()}/people`);

    // Contract: the bare map. Tolerate a wrapped one ({ people } / { personas }).
    return (d?.people ?? d?.personas ?? d ?? {}) as Record<string, string | null>;
  },
  /**
   * Phase 3: the brand's logo through the brand route (storage, size and type
   * checks of the company logo). Only for a brand that already exists.
   */
  subirLogo: async (id: string, file: File): Promise<{ logoUrl: string }> => {
    const form = new FormData();

    form.append("file", file);

    return ApiService.post(`${base()}/${id}/logo`, form);
  },
  /**
   * Phase 5: a sample invoice / proposal of the brand drawn by the server
   * with the unsaved form on top (a PDF blob). Tenant admin or the brand's
   * own brand admin.
   */
  vistaPrevia: async (id: string, tipo: "invoice" | "quote", d: DatosDeMarca): Promise<Blob> => {
    // Lazy: `lib/api` reads the session token at import (keeps this module testable).
    const { default: api } = await import("../api");
    const resp = await api.post<Blob>(`${base()}/${id}/preview/${tipo}`, d, {
      responseType: "blob",
      toast: { silentError: true },
    } as never);

    return (resp as { data?: Blob })?.data ?? (resp as unknown as Blob);
  },
  /** Buy extra brand slots: answers exactly like a one-time module purchase. */
  comprarCupos: (quantity = 1): Promise<ResultadoDeCompra> =>
    ApiService.post(`${base()}/slots/purchase`, { quantity }),
};

/**
 * PHASE 2 — which brands each office person sees (`tenantUsers.brandAccess`).
 * `null` = every brand; an array narrows the whole CRM to those brands. A
 * brand admin with an empty list sees nothing (the server fails closed).
 * Admin only.
 */
export const accesoDeMarcaService = {
  listar: async (): Promise<Record<string, string[] | null>> => {
    const d: any = await ApiService.get(`${base()}/access`);

    return (d?.access ?? d ?? {}) as Record<string, string[] | null>;
  },
  fijar: (
    userId: string,
    brandAccess: string[] | null,
  ): Promise<{ userId: string; brandAccess: string[] | null }> =>
    ApiService.put(`${base()}/access/${userId}`, { brandAccess }),
};

/** PHASE 4 — hours people of one brand worked at sites of another. */
export interface ParDeHoras {
  employerBrandId: string;
  siteBrandId: string;
  hours: number;
  people: number;
  shifts: number;
  /** Phase 5: what the site brand owes the employer brand (rated hours only); null = no rate at all. */
  amountCents?: number | null;
  currency?: string | null;
  /** Hours of the pair without a rate in effect. */
  unratedHours?: number;
}

export interface FilaDeHoras {
  userId: string;
  name: string;
  employerBrandId: string;
  siteBrandId: string;
  clientAccountId: string | null;
  clientName: string | null;
  postSiteId: string | null;
  siteName: string | null;
  hours: number;
  shifts: number;
  /** Phase 5: the hour rate applied; null = «Sin tarifa». */
  rateCents?: number | null;
  amountCents?: number | null;
  currency?: string | null;
}

export interface HorasEntreMarcas {
  from: string;
  to: string;
  matrix: ParDeHoras[];
  rows: FilaDeHoras[];
  /**
   * Every brand the ids above refer to (the server sends them all: a brand
   * admin's list of brands holds only theirs, the other side of a pair too).
   */
  brands?: Array<{ id: string; name: string; code: string | null; color: string | null; isPrincipal: boolean }>;
}

export interface FiltroDeHoras {
  from: string;
  to: string;
  employerBrandId?: string | null;
  siteBrandId?: string | null;
  /** Include same-brand pairs (X = Y). */
  all?: boolean;
}

export function consultaDeHoras(
  f: FiltroDeHoras,
  format?: "csv" | "xlsx" | "pdf",
): string {
  const q = new URLSearchParams({ from: f.from, to: f.to });

  if (f.employerBrandId) q.set("employerBrandId", f.employerBrandId);
  if (f.siteBrandId) q.set("siteBrandId", f.siteBrandId);
  if (f.all) q.set("all", "1");
  if (format) q.set("format", format);

  return q.toString();
}

export const horasEntreMarcasService = {
  leer: (f: FiltroDeHoras): Promise<HorasEntreMarcas> =>
    ApiService.get(`${base()}/cross-hours?${consultaDeHoras(f)}`),
  /**
   * The same report as a file (csv, xlsx or pdf) built by the server, in the
   * reader's language: the URL for `descargarInforme`.
   */
  urlDeDescarga: (f: FiltroDeHoras, format: "csv" | "xlsx" | "pdf"): string =>
    `${base()}/cross-hours?${consultaDeHoras(f, format)}`,
};

/**
 * PHASE 5 — the hour rate between two brands: what the SITE brand owes the
 * EMPLOYER brand per hour, effective from a date (the rate in effect on each
 * shift's date applies). Read: whoever reads the report. Write: tenant admin.
 */
export interface TarifaEntreMarcas {
  id: string;
  employerBrandId: string;
  siteBrandId: string;
  rateCents: number;
  currency: string;
  effectiveFrom: string;
  createdById?: string | null;
  updatedAt?: string | null;
}

export interface CambioDeTarifa {
  employerBrandId: string;
  siteBrandId: string;
  /** null = remove the entry of that date. */
  rateCents: number | null;
  currency?: string | null;
  effectiveFrom: string;
}

export const tarifasEntreMarcasService = {
  leer: (): Promise<{ rates: TarifaEntreMarcas[]; currency: string }> =>
    ApiService.get(`${base()}/hour-rates`),
  guardar: (rates: CambioDeTarifa[]): Promise<{ rates: TarifaEntreMarcas[]; currency: string }> =>
    ApiService.put(`${base()}/hour-rates`, { rates }),
};

/** The brand workspace saved in the account (the top-bar choice). */
export const espacioDeMarcaService = {
  leer: (): Promise<{ marca: string | null }> =>
    ApiService.get(`${base()}/workspace`),
  fijar: (marca: string): Promise<{ marca: string | null }> =>
    ApiService.put(`${base()}/workspace`, { marca }),
};

/**
 * A person's registration brand («Empresa en la que se registró»): the brand
 * whose payroll pays them. Written on the person (tenantUser) record.
 */
export function fijarMarcaDeRegistro(
  userId: string,
  homeBrandId: string | null,
): Promise<unknown> {
  return ApiService.patch(`/tenant/${tenantId()}/user/${userId}`, {
    homeBrandId,
  });
}

/**
 * The brand logo goes up exactly like the company logo (settings → company
 * profile): upload credentials for the `settingsLogos` storage, POST the file,
 * and keep its public URL as `logoUrl`.
 */
export async function subirLogoDeMarca(file: File): Promise<string> {
  const filename = file.name;
  const creds: any = await ApiService.get(
    `/tenant/${tenantId()}/file/credentials?filename=${encodeURIComponent(
      filename,
    )}&storageId=settingsLogos`,
  );
  const uploadUrl = creds?.uploadCredentials?.url;

  if (!uploadUrl) throw new Error("upload_url");
  const form = new FormData();

  form.append("filename", filename);
  form.append("file", file);
  const r = await fetch(uploadUrl, { method: "POST", body: form });

  if (!r.ok) throw new Error(`upload_${r.status}`);
  const url = creds?.uploadCredentials?.publicUrl || creds?.publicUrl || null;

  if (!url) throw new Error("upload_url");

  return String(url);
}

/**
 * The machine code of a refusal (`brand_slots_exhausted`, `brand_has_clients`…),
 * wherever the server put it: `code`, `reason` or `messageCode`.
 */
export function codigoDeError(e: any): string | null {
  const d = e?.data ?? e?.response?.data ?? null;
  // The first STRING among them: route gates answer `{ code: 403, reason:
  // 'marca_pago' }`, and a numeric `code` must not hide the reason.
  for (const c of [d?.code, d?.reason, d?.errorCode, d?.error?.code, d?.messageCode]) {
    if (typeof c === "string" && c) return c;
  }

  return null;
}

/** Whether a refusal is the module being off (402 `addon_required`). */
export function esSinModulo(e: any): boolean {
  return (
    e?.status === 402 ||
    e?.response?.status === 402 ||
    codigoDeError(e) === "addon_required"
  );
}
