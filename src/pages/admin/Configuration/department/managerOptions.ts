/**
 * The people who can be «Responsable» of a department: the company's own team.
 *
 * The list came straight from GET /tenant/:id/user, which also returns the
 * client-portal accounts («Cliente de Guayaquil S.a.») and could repeat a
 * person; two different people with the same name were indistinguishable.
 */
type UserLike = {
  id?: string;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  roles?: unknown;
  role?: unknown;
  /** The list endpoint nests the membership (and its roles) here. */
  tenants?: Array<{ roles?: unknown }> | null;
};

export type ManagerOption = { id: string; name: string };

const CLIENT_ONLY_ROLES = new Set(["customer"]);

function rolesOf(u: UserLike): string[] {
  let raw: unknown = u.roles ?? u.role ?? u.tenants?.[0]?.roles;

  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      raw = JSON.parse(raw);
    } catch {
      /* keep the string */
    }
  }
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

  return list
    .map((r: any) => (typeof r === "string" ? r : r?.name || r?.role || ""))
    .map((r) => String(r).trim().toLowerCase())
    .filter(Boolean);
}

function displayName(u: UserLike): string {
  return (
    String(u.fullName || "").trim() ||
    [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
    String(u.email || "").trim() ||
    "—"
  );
}

export function managerOptions(users: UserLike[]): ManagerOption[] {
  const seen = new Set<string>();
  const people: Array<{ id: string; name: string; email: string }> = [];

  for (const u of users || []) {
    const id = String(u?.id || "");

    if (!id || seen.has(id)) continue;
    const roles = rolesOf(u);

    // A client account is not part of the team; unknown roles stay listed.
    if (roles.length && roles.every((r) => CLIENT_ONLY_ROLES.has(r))) continue;
    seen.add(id);
    people.push({ id, name: displayName(u), email: String(u.email || "").trim() });
  }

  const count = new Map<string, number>();

  for (const p of people) count.set(p.name, (count.get(p.name) || 0) + 1);

  return people
    .map((p) => ({
      id: p.id,
      name: (count.get(p.name) || 0) > 1 && p.email ? `${p.name} (${p.email})` : p.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
