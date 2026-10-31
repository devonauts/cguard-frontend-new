import type { ReactNode } from "react";
import type { FeatureKey } from "@/lib/entitlements";

import { useEntitlement } from "@/hooks/useEntitlement";

/**
 * Renders children only when the current tenant's plan includes `feature`.
 * Fail-open (see useEntitlement): shows children when entitlements are unknown.
 *
 * Usage:
 *   <FeatureGate feature="rondas">
 *     <RondasMenuItem />
 *   </FeatureGate>
 *
 * Or with an upsell fallback:
 *   <FeatureGate feature="radio" fallback={<UpgradePrompt feature="radio" />}>
 *     <VideoModule />
 *   </FeatureGate>
 */
export default function FeatureGate({
  feature,
  children,
  fallback = null,
}: {
  feature: FeatureKey | string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const allowed = useEntitlement(feature);

  return <>{allowed ? children : fallback}</>;
}
