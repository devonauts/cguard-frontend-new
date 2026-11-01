import { validateTaxNumberForCountry } from "@/lib/validators/id";

/**
 * A brand is a separate legal company: its commercial name, legal name, tax
 * id and country are required, and the tax id must fit the rule of the
 * brand's country (the mirror of the server's; when in doubt it is accepted).
 *
 * Returns what is missing (`falta`) or wrong (`malo`), field by field.
 */
export function revisarMarca(
  b: { name: string; legalName: string; taxId: string; country: string },
): Partial<Record<"name" | "legalName" | "taxId" | "country", "falta" | "malo">> {
  const e: Partial<
    Record<"name" | "legalName" | "taxId" | "country", "falta" | "malo">
  > = {};

  if (!b.name.trim()) e.name = "falta";
  if (!b.legalName.trim()) e.legalName = "falta";
  if (!b.country.trim()) e.country = "falta";
  if (!b.taxId.trim()) e.taxId = "falta";
  else if (!validateTaxNumberForCountry(b.taxId.trim(), b.country))
    e.taxId = "malo";

  return e;
}
