/**
 * A module the company OWNS but switched off in the store: its screens say so
 * and send to the store to switch it back on (no cost, nothing was deleted),
 * instead of the «buy it» presentation. Not owned → the presentation, as before.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Section, SkeletonCards } from "@/components/kit";
import { useAddonOwnership } from "@/hooks/useAddonOwnership";

/** «<Module> is off»: it is already yours, switch it back on whenever you like. */
export function PausedAddonNotice({ name, icon }: { name: string; icon?: ReactNode }) {
  const { t } = useTranslation();

  return (
    <Section icon={icon} title={t("modulosAdicionales.pausa.pantalla.titulo", { nombre: name })}>
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        {t("modulosAdicionales.pausa.pantalla.desc")}
      </p>
      <div className="cg-acciones mt-4 justify-end">
        <Button asChild variant="brand">
          <Link to="/modulos-adicionales">{t("modulosAdicionales.pausa.pantalla.boton")}</Link>
        </Button>
      </div>
    </Section>
  );
}

/**
 * Wraps a module's presentation: owned but switched off → the «switched off»
 * notice; still asking the store → a skeleton (no flash of «buy it»);
 * otherwise the presentation (`children`).
 */
export function PausedAddonGate({
  moduleKey,
  name,
  icon,
  children,
}: {
  moduleKey: string;
  name: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const { paused, loading } = useAddonOwnership(moduleKey);

  if (loading) return <SkeletonCards count={2} />;
  if (paused) return <PausedAddonNotice icon={icon} name={name} />;

  return <>{children}</>;
}
