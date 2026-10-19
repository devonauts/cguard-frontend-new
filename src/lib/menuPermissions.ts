/**
 * Which menu entries the signed-in user can actually open.
 *
 * Every entry of `sidebar-menu.json` may declare `permission`: the backend
 * permission id(s) that its page's main data needs (any one is enough). The
 * menu used to show every section to every office role, so a secretary
 * opened Nómina or «Caras registradas» and got an empty screen or «check your
 * connection» — the backend had answered 403 (QA-82). The ids are the
 * backend's own (`src/security/permissions.ts`), checked with the same
 * `hasAny` the pages use, which reads the permissions the profile returned
 * for this tenant — so a role edited in Configuración › Roles is honoured.
 *
 * Fails open: while the permission list is not loaded (or came back empty)
 * nothing is hidden. Hiding the whole menu over a slow profile would be worse
 * than a 403, and the backend enforces access either way.
 */

/** Held by every staff role in the default catalog. None of them → the list
 *  is not loaded yet, so the menu must not be filtered on it. */
const BASELINE = ["userRead", "stationRead", "businessInfoRead"];

export type EntryWithPermission = { permission?: string[] };

export function makeMenuGate(hasAny: (perms: string[]) => boolean) {
  const known = hasAny(BASELINE);

  return (entry: EntryWithPermission): boolean =>
    !known || !entry.permission?.length || hasAny(entry.permission);
}
