import { useAuth } from "@/contexts/AuthContext";
import {
  hasFeature,
  getPlanFeatures,
  type FeatureKey,
} from "@/lib/entitlements";

/**
 * Whether the current tenant's plan entitles it to `feature`. Fail-open: returns
 * true when the plan feature list is unknown (older session / unconfigured
 * catalog), so gating only hides a feature when the backend explicitly omits it.
 */
export function useEntitlement(feature: FeatureKey | string): boolean {
  const { user } = useAuth();

  return hasFeature(user, feature);
}

/** The full resolved feature list for the current tenant (or null = all). */
export function usePlanFeatures(): string[] | null {
  const { user } = useAuth();

  return getPlanFeatures(user);
}
