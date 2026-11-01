/**
 * Configuración › Computadoras de escritorio.
 *
 * Every computer that wants to run the desktop program asks for approval
 * («this person on this computer»). Admins decide here: the waiting requests
 * with their pairing code (compare it with the one on the person's screen),
 * the approved computers (revoke closes the program there within 30 s and
 * wipes what it kept), and the history. Everyone sees «Mis computadoras».
 * Live: the list follows `desktopDevices:changed` (see `useComputadoras`).
 * Look: the Liquid Glass of the desktop-app pages (`escritorio/vidrio.css`).
 */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  History,
  KeyRound,
  Monitor,
  MonitorCheck,
  MonitorDown,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import SettingsPageShell from "../components/SettingsPageShell";

import { MisComputadoras } from "@/pages/escritorio/EscritorioPage";
import { TarjetaDeComputadora } from "@/pages/escritorio/TarjetaDeComputadora";
import {
  useComputadoras,
  type Computadoras,
} from "@/pages/escritorio/useComputadoras";
import {
  AvisoDeVidrio,
  FondoDeColor,
  SeccionDeVidrio,
} from "@/pages/escritorio/vidrio";
import { SkeletonBlock } from "@/components/kit";
import { Button } from "@/components/ui/button";

function Lista({
  c,
  filas,
  vacio,
}: {
  c: Computadoras;
  filas: Computadoras["grupos"]["pendientes"];
  vacio: string;
}) {
  if (!filas.length)
    return (
      <AvisoDeVidrio icon={<Monitor />} tono="neutral">
        {vacio}
      </AvisoDeVidrio>
    );

  return (
    <div className="space-y-3">
      {filas.map((d) => (
        <TarjetaDeComputadora
          key={d.id}
          c={c}
          d={d}
          esMia={!!c.yo && d.userId === c.yo}
        />
      ))}
    </div>
  );
}

function Contador({ n, tono }: { n: number; tono: "warn" | "ok" }) {
  return (
    <span
      className="lg-row px-3 py-1 text-xs font-bold tabular-nums"
      style={{
        background: `color-mix(in oklab, var(--${tono}) 16%, transparent)`,
        color: `var(--${tono}-text)`,
      }}
    >
      {n}
    </span>
  );
}

export default function ComputadorasPage() {
  const { t } = useTranslation();
  const c = useComputadoras();
  const { pendientes, aprobadas, cerradas } = c.grupos;

  return (
    <SettingsPageShell
      actions={
        <Button asChild size="sm" variant="outline">
          <Link to="/escritorio">
            <MonitorDown /> {t("desktopApp.devices.downloadCta")}
          </Link>
        </Button>
      }
      icon={<Monitor />}
      kind="table"
      subtitle={t("desktopApp.devices.subtitle")}
      title={t("desktopApp.devices.title")}
    >
      <div className="lg-scope space-y-6">
        <FondoDeColor />
        {c.cargando ? (
          <div className="space-y-4">
            <SkeletonBlock className="h-40 w-full rounded-[28px]" />
            <SkeletonBlock className="h-40 w-full rounded-[28px]" />
          </div>
        ) : c.error ? (
          <AvisoDeVidrio
            icon={<AlertTriangle />}
            title={t("desktopApp.devices.loadError")}
            tono="warn"
          >
            <Button
              className="lg-btn lg-btn-glass mt-2"
              size="sm"
              type="button"
              onClick={() => void c.recargar()}
            >
              <RefreshCw /> {t("desktopApp.devices.retry")}
            </Button>
          </AvisoDeVidrio>
        ) : (
          <>
            {c.administra ? (
              <>
                <SeccionDeVidrio
                  action={
                    pendientes.length ? (
                      <Contador n={pendientes.length} tono="warn" />
                    ) : undefined
                  }
                  icon={<KeyRound />}
                  title={t("desktopApp.devices.pendingTitle")}
                >
                  <div className="space-y-3">
                    {pendientes.length ? (
                      <AvisoDeVidrio icon={<ShieldCheck />} tono="info">
                        {t("desktopApp.devices.pendingHint")}
                      </AvisoDeVidrio>
                    ) : null}
                    <Lista
                      c={c}
                      filas={pendientes}
                      vacio={t("desktopApp.devices.pendingEmpty")}
                    />
                  </div>
                </SeccionDeVidrio>
                <SeccionDeVidrio
                  action={
                    aprobadas.length ? (
                      <Contador n={aprobadas.length} tono="ok" />
                    ) : undefined
                  }
                  icon={<MonitorCheck />}
                  title={t("desktopApp.devices.approvedTitle")}
                >
                  <Lista
                    c={c}
                    filas={aprobadas}
                    vacio={t("desktopApp.devices.approvedEmpty")}
                  />
                </SeccionDeVidrio>
                {cerradas.length ? (
                  <SeccionDeVidrio
                    icon={<History />}
                    title={t("desktopApp.devices.closedTitle")}
                  >
                    <Lista c={c} filas={cerradas.slice(0, 50)} vacio="" />
                  </SeccionDeVidrio>
                ) : null}
              </>
            ) : (
              <AvisoDeVidrio icon={<ShieldCheck />} tono="neutral">
                {t("desktopApp.devices.notAdmin")}
              </AvisoDeVidrio>
            )}
            <MisComputadoras c={c} />
          </>
        )}
      </div>
    </SettingsPageShell>
  );
}
