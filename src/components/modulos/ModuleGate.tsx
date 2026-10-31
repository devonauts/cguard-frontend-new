/**
 * THE TWO "CENTER" MODULES — Monitoring Center (`monitoring_center`, alarm
 * panels and their signals) and Video Surveillance (`video_surveillance`).
 *
 * Both are paid one-time add-ons. Without one, its screens show what the
 * module does and a button to the add-on store instead of loading (no request
 * is made, so no red error appears). The Emergency Center (/alarm/queue and
 * /alarm/case/:id: panic buttons, SOS and their cases) is NOT part of either
 * module and is never wrapped here.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Cctv, Siren } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, Section } from "@/components/kit";
import BotonDemo from "@/components/modulos/demo/BotonDemo";
import { PausedAddonGate } from "@/components/modulos/PausedAddon";
import { useEntitlement } from "@/hooks/useEntitlement";
import {
  ADDON_REQUIRED_EVENT,
  ADDONS_CHANGED_EVENT,
  type AddonRequiredDetail,
} from "@/lib/addonRequired";

export const MONITORING_CENTER = "monitoring_center";
export const VIDEO_SURVEILLANCE = "video_surveillance";

export type CenterModuleKey =
  typeof MONITORING_CENTER | typeof VIDEO_SURVEILLANCE;

/**
 * Whether the company has the module: the session's entitlement says so up
 * front, and a 402 `addon_required` for this key (a session older than a
 * revocation) turns it off until the company's modules change again
 * (`ADDONS_CHANGED_EVENT`: switched back on, gifted…).
 */
export function useHasModule(key: CenterModuleKey): boolean {
  const entitled = useEntitlement(key);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    const onRefusal = (ev: Event) => {
      if ((ev as CustomEvent<AddonRequiredDetail>).detail?.addonKey === key)
        setRefused(true);
    };

    // The modules changed (switched back on, gifted…): trust the fresh session again.
    const onChange = () => setRefused(false);

    window.addEventListener(ADDON_REQUIRED_EVENT, onRefusal);
    window.addEventListener(ADDONS_CHANGED_EVENT, onChange);

    return () => {
      window.removeEventListener(ADDON_REQUIRED_EVENT, onRefusal);
      window.removeEventListener(ADDONS_CHANGED_EVENT, onChange);
    };
  }, [key]);

  return entitled && !refused;
}

/** The copy of each module's presentation (literal keys, so the i18n test sees them). */
function useModuleCopy(key: CenterModuleKey) {
  const { t } = useTranslation();

  if (key === MONITORING_CENTER) {
    return {
      icon: <Siren />,
      name: t(
        "modulosAdicionales.centrales.monitoreo.nombre",
        "Central de Monitoreo",
      ),
      title: t(
        "modulosAdicionales.centrales.monitoreo.titulo",
        "El módulo Central de Monitoreo no está activo",
      ),
      description: t(
        "modulosAdicionales.centrales.monitoreo.desc",
        "Con la Central de Monitoreo recibes las señales de los paneles de alarma de tus clientes y las atiendes como una central receptora. El Centro de Emergencias (botones de pánico y SOS) sigue incluido sin este módulo.",
      ),
      steps: [
        t(
          "modulosAdicionales.centrales.monitoreo.paso1",
          "Das de alta los paneles de alarma de cada cliente, con sus zonas, contactos y horarios de apertura y cierre.",
        ),
        t(
          "modulosAdicionales.centrales.monitoreo.paso2",
          "Cada señal llega en vivo y, si es una alarma, abre un caso con su plan de acción, las llamadas de verificación y el despacho.",
        ),
        t(
          "modulosAdicionales.centrales.monitoreo.paso3",
          "Mides las falsas alarmas y los tiempos de respuesta, y exportas la auditoría de cada caso.",
        ),
      ],
    };
  }

  return {
    icon: <Cctv />,
    name: t("modulosAdicionales.centrales.video.nombre", "Videovigilancia"),
    title: t(
      "modulosAdicionales.centrales.video.titulo",
      "El módulo Videovigilancia no está activo",
    ),
    description: t(
      "modulosAdicionales.centrales.video.desc",
      "Con Videovigilancia conectas las cámaras, DVR y NVR de tus clientes y las ves en vivo desde aquí, junto a la operación de tus vigilantes.",
    ),
    steps: [
      t(
        "modulosAdicionales.centrales.video.paso1",
        "Conectas los grabadores y las cámaras de cada puesto, directamente o desde un sitio remoto.",
      ),
      t(
        "modulosAdicionales.centrales.video.paso2",
        "Ves las cámaras en vivo, mueves las PTZ y registras los eventos de video.",
      ),
      t(
        "modulosAdicionales.centrales.video.paso3",
        "Recortas clips, los compartes con el cliente por un enlace y los conviertes en incidentes o en un despacho al supervisor.",
      ),
    ],
  };
}

/**
 * Without the module: what it does, in three steps, and where to get it.
 * Owned but switched off: how to switch it back on instead (no demo, no steps).
 */
export function ModulePresentation({
  moduleKey,
}: {
  moduleKey: CenterModuleKey;
}) {
  const { t } = useTranslation();
  const copy = useModuleCopy(moduleKey);

  return (
    <PausedAddonGate icon={copy.icon} moduleKey={moduleKey} name={copy.name}>
      <Section icon={copy.icon} title={copy.title}>
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {copy.description}
        </p>
        <ol className="mt-4 space-y-2">
          {copy.steps.map((step, i) => (
            <li key={i} className="glass-flat flex items-start gap-3 p-3 text-sm">
              <span
                className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums"
                style={{
                  background: "var(--brand-wash)",
                  color: "var(--brand-text)",
                }}
              >
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="cg-acciones mt-4 items-center justify-end">
          {/* Renders nothing until the store registers this module's demo. */}
          <BotonDemo clave={moduleKey} nombre={copy.name} />
          <Button asChild variant="brand">
            <Link to="/modulos-adicionales">
              {t(
                "modulosAdicionales.centrales.activar",
                "Activar en Módulos adicionales",
              )}
            </Link>
          </Button>
        </div>
      </Section>
    </PausedAddonGate>
  );
}

/**
 * Wraps a full page of the module (route level): with the module, the page;
 * without it, the app layout with the module's presentation.
 */
export default function ModuleGate({
  moduleKey,
  children,
}: {
  moduleKey: CenterModuleKey;
  children: ReactNode;
}) {
  const has = useHasModule(moduleKey);
  const copy = useModuleCopy(moduleKey);

  if (has) return <>{children}</>;

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader icon={copy.icon} title={copy.name} />
        <ModulePresentation moduleKey={moduleKey} />
      </PageContainer>
    </AppLayout>
  );
}
