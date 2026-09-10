/**
 * The ONE way to turn a client record into the label shown under "Cliente".
 *
 * A `clientAccount` carries two different identities and they are easy to mix up:
 *   - `commercialName` → the COMPANY ("Comercial Ecuador S.A."). Canonical.
 *   - `name` + `lastName` → the PERSON: a denormalized cache of the linked user,
 *     i.e. the legal representative / contact.
 *
 * Screens that rendered `${name} ${lastName}` under a "Cliente" label showed a
 * person where the operator expected a company — nobody recognises the client by
 * their legal rep. Always route client labels through this helper.
 *
 * Falls back to the person's name only when there is no commercialName at all,
 * because an empty cell is worse than an imperfect one.
 */

export interface ClientLike {
  commercialName?: string | null;
  companyName?: string | null; // some endpoints alias it (post-site payloads)
  name?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  displayName?: string | null;
  clientName?: string | null;
  [k: string]: any;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Company name for a client, with a person-name fallback. Never returns null. */
export function clientDisplayName(
  c: ClientLike | null | undefined,
  fallback = "",
): string {
  if (!c) return fallback;

  // 1. The company, under either of the names the API uses for it.
  const company = clean(c.commercialName) || clean(c.companyName);

  if (company) return company;

  // 2. Some endpoints already send a resolved label — trust it before rebuilding
  //    one from the person fields.
  const resolved = clean(c.clientName) || clean(c.displayName);

  if (resolved) return resolved;

  // 3. Last resort: the contact person. Not ideal under a "Cliente" label, but
  //    better than a blank row — and it means commercialName is genuinely unset.
  const person =
    clean(c.fullName) ||
    [clean(c.name), clean(c.lastName)].filter(Boolean).join(" ");

  return person || fallback;
}

/** True when we had to fall back to a person's name (no company on record). */
export function isPersonFallback(c: ClientLike | null | undefined): boolean {
  if (!c) return false;

  return (
    !clean(c.commercialName) &&
    !clean(c.companyName) &&
    !clean(c.clientName) &&
    !clean(c.displayName)
  );
}
