/**
 * A paid add-on module the company does not have answers 402
 * `{ code: "addon_required", addonKey }` (backend `requireModulo`).
 *
 * The session's plan features already hide those screens up front; this event
 * covers a session older than a revocation: the HTTP client announces the
 * refusal and the module gate (`components/modulos/ModuleGate`) swaps the
 * screen for the module's presentation instead of leaving it half-loaded.
 */
export const ADDON_REQUIRED_EVENT = "app:addon-required";

export interface AddonRequiredDetail {
  addonKey: string;
}

/** The module key a 402 `addon_required` body names, or null for any other error. */
export function addonKeyOfRefusal(
  status: number | undefined,
  body: unknown,
): string | null {
  if (status !== 402 || !body || typeof body !== "object") return null;
  const b = body as { code?: unknown; addonKey?: unknown };

  if (
    b.code !== "addon_required" ||
    typeof b.addonKey !== "string" ||
    !b.addonKey
  )
    return null;

  return b.addonKey;
}

/** Tell the open screens that the server refused a module. Never throws. */
export function announceAddonRequired(
  status: number | undefined,
  body: unknown,
): void {
  const addonKey = addonKeyOfRefusal(status, body);

  if (!addonKey || typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<AddonRequiredDetail>(ADDON_REQUIRED_EVENT, {
        detail: { addonKey },
      }),
    );
  } catch {
    /* never break the request */
  }
}
