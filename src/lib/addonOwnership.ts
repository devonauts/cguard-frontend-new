/**
 * Whether the company OWNS an add-on module and whether it switched it off,
 * read from the store list (`GET /tenant/:t/addons`). Pure, so the decision
 * is tested on its own (`addonOwnership.test.ts`); the hook is
 * `useAddonOwnership`.
 *
 *   owned   → the company holds the module (bought, gifted, on trial…).
 *   paused  → owned, but switched off in the store: its screens must offer to
 *             switch it back on (no cost), never to buy it again.
 *   loading → the store answer is still on its way.
 */
export interface AddonOwnership {
  owned: boolean;
  paused: boolean;
  loading: boolean;
}

export interface AddonStoreLike {
  modules?: Array<{ key: string; owned?: boolean; paused?: boolean }> | null;
}

export function addonOwnershipOf(
  store: AddonStoreLike | null | undefined,
  key: string,
  storeLoading = false,
): AddonOwnership {
  const entry = store?.modules?.find((m) => m.key === key);
  const owned = Boolean(entry?.owned);

  return {
    owned,
    // A pause left on a revoked row means nothing: only an owned module is «off».
    paused: owned && Boolean(entry?.paused),
    loading: !store && storeLoading,
  };
}
