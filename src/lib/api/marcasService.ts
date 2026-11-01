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
}

export interface CuposDeMarca {
  /** Brands paid for: 2 with the module + every extra slot bought. */
  paid: number;
  /** Brands in use (not archived). */
  used: number;
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
}

export type DatosDeMarca = Partial<
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
  >
>;

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
  /** Buy extra brand slots: answers exactly like a one-time module purchase. */
  comprarCupos: (quantity = 1): Promise<ResultadoDeCompra> =>
    ApiService.post(`${base()}/slots/purchase`, { quantity }),
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
  const c =
    d?.code ?? d?.reason ?? d?.errorCode ?? d?.error?.code ?? d?.messageCode;

  return typeof c === "string" && c ? c : null;
}

/** Whether a refusal is the module being off (402 `addon_required`). */
export function esSinModulo(e: any): boolean {
  return (
    e?.status === 402 ||
    e?.response?.status === 402 ||
    codigoDeError(e) === "addon_required"
  );
}
