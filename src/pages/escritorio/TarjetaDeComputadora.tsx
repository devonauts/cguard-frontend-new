/**
 * One desktop computer: who, which machine, its state, and — while it waits —
 * the pairing code, big, so the admin can compare it with the one on the
 * person's screen. Used by the «App de escritorio» page and by Settings.
 */
import type { Accion, Computadoras } from "./useComputadoras";
import type { DesktopDevice } from "@/lib/api/desktopService";

import { useTranslation } from "react-i18next";
import { Check, Laptop, Monitor, ShieldOff, X } from "lucide-react";

import { accionesPermitidas, describirSistema } from "./computadoras";

import { StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { fechaYHora } from "@/lib/horaDeLaEmpresa";

const TONO = {
  pending: "warn",
  approved: "ok",
  rejected: "neutral",
  revoked: "bad",
} as const;
/** The icon plate's tint (a semantic token, never the accent). */
const TINTA = {
  pending: "warn",
  approved: "ok",
  rejected: "info",
  revoked: "bad",
} as const;

export function CodigoDeEmparejamiento({
  codigo,
  grande = false,
}: {
  codigo: string | null;
  grande?: boolean;
}) {
  const { t } = useTranslation();

  if (!codigo) return null;

  return (
    <div className="flex flex-col items-start gap-1">
      <span className="lg-eyebrow">{t("desktopApp.devices.code")}</span>
      <span
        aria-label={t("desktopApp.devices.codeAria", {
          codigo: codigo.split("").join(" "),
        })}
        className={`lg-code tabular-nums ${grande ? "text-2xl" : "text-xl"}`}
      >
        {codigo}
      </span>
    </div>
  );
}

export function TarjetaDeComputadora({
  d,
  c,
  mostrarPersona = true,
  esMia = false,
}: {
  d: DesktopDevice;
  c: Computadoras;
  mostrarPersona?: boolean;
  esMia?: boolean;
}) {
  const { t } = useTranslation();
  const acciones = accionesPermitidas(d, { administra: c.administra, esMia });
  const ocupada = c.ocupado === d.id;
  const Icono = d.platform === "win32" ? Monitor : Laptop;
  const version = d.lastAppVersion || d.appVersion;
  const detalles = [
    describirSistema(d),
    version ? t("desktopApp.devices.version", { version }) : null,
    d.lastIp ? t("desktopApp.devices.ip", { ip: d.lastIp }) : null,
  ].filter(Boolean);
  const cuando =
    d.status === "pending"
      ? t("desktopApp.devices.requestedAt", {
          fecha: fechaYHora(d.requestedAt),
        })
      : d.status === "approved"
        ? d.lastSeenAt
          ? t("desktopApp.devices.lastSeen", {
              fecha: fechaYHora(d.lastSeenAt),
            })
          : t("desktopApp.devices.neverSeen")
        : d.status === "revoked"
          ? t("desktopApp.devices.revokedAt", {
              fecha: fechaYHora(d.revokedAt || d.decidedAt),
            })
          : t("desktopApp.devices.rejectedAt", {
              fecha: fechaYHora(d.decidedAt),
            });

  const boton = (a: Accion) => {
    const comun = {
      disabled: ocupada,
      size: "sm" as const,
      type: "button" as const,
      onClick: () => void c.decidir(a, d),
    };

    if (a === "approve")
      return (
        <Button key={a} className="lg-btn lg-btn-primary" {...comun}>
          <Check /> {t("desktopApp.devices.approve")}
        </Button>
      );
    if (a === "reject")
      return (
        <Button key={a} className="lg-btn" variant="danger-ghost" {...comun}>
          <X /> {t("desktopApp.devices.reject")}
        </Button>
      );

    return (
      <Button key={a} className="lg-btn" variant="danger-ghost" {...comun}>
        <ShieldOff /> {t("desktopApp.devices.revoke")}
      </Button>
    );
  };

  return (
    <div className="lg-row flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{
            background: `color-mix(in oklab, var(--${TINTA[d.status]}) 16%, transparent)`,
            color: `var(--${TINTA[d.status]}-text)`,
          }}
        >
          <Icono className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold">
              {c.equipoDe(d)}
            </span>
            <StatusBadge tone={TONO[d.status]}>
              {t(`desktopApp.devices.status.${d.status}`)}
            </StatusBadge>
          </div>
          {mostrarPersona ? (
            <div className="truncate text-xs" style={{ color: "var(--ink)" }}>
              {c.personaDe(d)}
              {d.userEmail && d.userName ? (
                <span style={{ color: "var(--ink-soft)" }}>
                  {" "}
                  · {d.userEmail}
                </span>
              ) : null}
            </div>
          ) : null}
          {detalles.length ? (
            <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {detalles.join(" · ")}
            </div>
          ) : null}
          <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {cuando}
          </div>
        </div>
      </div>
      {d.status === "pending" ? (
        <CodigoDeEmparejamiento grande codigo={d.pairingCode} />
      ) : null}
      {acciones.length ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {acciones.map(boton)}
        </div>
      ) : null}
    </div>
  );
}
