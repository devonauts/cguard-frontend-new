import i18n from "@/i18n";

/**
 * «Tipo de informador» in words. The column printed the stored value, and the
 * CRM, the apps and the alarm center store different ones for the same thing
 * (`vigilante`/`guard`, `cliente`/`client`), so one list mixed languages.
 */
const KEYS: Record<string, [string, string]> = {
  cliente: ["dispatcher.client", "Cliente"],
  client: ["dispatcher.client", "Cliente"],
  customer: ["dispatcher.client", "Cliente"],
  vigilante: ["dispatcher.guard", "Vigilante"],
  guard: ["dispatcher.guard", "Vigilante"],
  securityguard: ["dispatcher.guard", "Vigilante"],
  supervisor: ["adminOfficeUsers.roleNames.supervisor", "Supervisor"],
};

export function callerTypeLabel(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const value =
    typeof raw === "object"
      ? String((raw as { name?: string; id?: string }).name || (raw as { id?: string }).id || "")
      : String(raw);
  const k = KEYS[value.trim().toLowerCase()];

  return k ? i18n.t(k[0], k[1]) : value;
}

/** A user relation (`createdBy`, `assignedTo`) as a name. */
export function personName(u: unknown): string {
  if (!u || typeof u !== "object") return "";
  const p = u as { fullName?: string; firstName?: string; lastName?: string };

  return (
    (p.fullName && p.fullName.trim()) ||
    [p.firstName, p.lastName].filter(Boolean).join(" ").trim()
  );
}
