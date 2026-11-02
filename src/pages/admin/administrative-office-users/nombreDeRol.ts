/**
 * A role as people read it: «dispatcher» → «Despachador». Built-in roles are
 * stored by their slug (the role rows' `name` is the slug too), so showing the
 * stored value printed the internal key. Custom roles keep their own name.
 */
type Traducir = (key: string, opts: { defaultValue: string }) => string;

const ROLES_CONOCIDOS: Record<string, string> = {
  admin: "admin",
  administrativeassistant: "administrativeAssistant",
  administrativesupervisor: "administrativeSupervisor",
  branchmanager: "branchManager",
  clientaccountmanager: "clientAccountManager",
  dispatcher: "dispatcher",
  hrmanager: "hrManager",
  operationsmanager: "operationsManager",
  secretary: "secretary",
  securitysupervisor: "securitySupervisor",
  supervisor: "supervisor",
};

export function nombreDeRol(slug: string, t: Traducir): string {
  const valor = String(slug || "").trim();
  const clave = ROLES_CONOCIDOS[valor.toLowerCase()];

  return clave
    ? t(`adminOfficeUsers.roleNames.${clave}`, { defaultValue: valor })
    : valor;
}

/** The role reference the API returns (slug or object) as a readable name. */
export function nombreDeRolRef(
  r: string | { name?: string | null; slug?: string | null; id?: string | null } | null | undefined,
  t: Traducir,
): string | null {
  if (!r) return null;
  if (typeof r === "string") return nombreDeRol(r, t);
  const slug = r.slug || r.name || r.id || "";

  return slug ? nombreDeRol(String(slug), t) : null;
}
