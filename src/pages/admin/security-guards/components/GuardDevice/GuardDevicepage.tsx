import type { GuardDetail } from "../../guardDetailTypes";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Smartphone,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Loader2,
  BellRing,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

import AppLayout from "@/layouts/app-layout";
import GuardsLayout from "@/layouts/GuardsLayout";
import guardDeviceService, { GuardDevice } from "@/lib/api/guardDeviceService";
import {
  PageContainer,
  PageHeader,
  Section,
  IconTile,
  StatusBadge,
  EmptyState,
  SkeletonCards,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { localeActual } from "@/lib/localeActual";

// navKey/title default to the guard layout; a supervisor route can override them
// to render the same device screen under the supervisor sidebar (the device
// endpoint is user-keyed, so it works for any user id).
type Props = { guard?: GuardDetail; navKey?: string; title?: string };

function fmt(dt: string | null): string {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString(localeActual());
  } catch {
    return "—";
  }
}

export default function GuardDevicePage({
  guard,
  navKey = "keep-safe",
  title = "guards.nav.dispositivo",
}: Props) {
  const { id } = useParams();
  const { t } = useTranslation();
  const userId = guard?.userId || guard?.user?.id || (id as string);

  const [devices, setDevices] = useState<GuardDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setDevices(await guardDeviceService.list(userId));
    } catch (e) {
      console.error("load guard devices", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const reset = async (d: GuardDevice) => {
    setResetting(d.id);
    try {
      await guardDeviceService.resetBinding(d.id);
      toast.success(
        t("guards.device.resetDone", {
          defaultValue:
            "Vínculo restablecido. El próximo dispositivo del vigilante quedará vinculado.",
        }),
      );
      await load();
    } catch (e) {
      toast.error(
        t("guards.device.resetError", {
          defaultValue: "No se pudo restablecer el vínculo.",
        }),
      );
    } finally {
      setResetting(null);
    }
  };

  const bound = devices.find((d) => d.isBound) || null;
  const others = devices.filter((d) => !d.isBound);
  const flaggedCount = devices.filter((d) => d.flagged).length;

  return (
    <AppLayout>
      <GuardsLayout navKey={navKey} title={title}>
        <PageContainer>
          <PageHeader
            badges={
              devices.length > 0 || flaggedCount > 0 ? (
                <>
                  {devices.length > 0 && (
                    <StatusBadge dot={false} tone="neutral">
                      <Smartphone className="h-3 w-3" />
                      {t("guards.device.deviceCount", {
                        defaultValue: "{{n}} dispositivo(s)",
                        n: devices.length,
                      })}
                    </StatusBadge>
                  )}
                  {flaggedCount > 0 && (
                    <StatusBadge tone="bad">
                      {t("guards.device.flaggedBadge", {
                        defaultValue: "{{n}} no reconocido(s)",
                        n: flaggedCount,
                      })}
                    </StatusBadge>
                  )}
                </>
              ) : undefined
            }
            icon={<Smartphone />}
            subtitle={t("guards.device.subtitle", {
              defaultValue:
                "El primer dispositivo desde el que el vigilante inicia sesión queda vinculado. Si aparece otro dispositivo, se marca como no reconocido (no se bloquea). Restablece el vínculo si el vigilante cambió de teléfono.",
            })}
            title={t("guards.device.title", {
              defaultValue: "Dispositivo del vigilante",
            })}
          />

          {/* ── BODY ─────────────────────────────────────────────────────────── */}
          {loading ? (
            <SkeletonCards className="sm:grid-cols-1" count={2} />
          ) : devices.length === 0 ? (
            <EmptyState
              description={t("guards.device.empty", {
                defaultValue:
                  "Aún no se ha registrado ningún dispositivo para este vigilante.",
              })}
              icon={<Smartphone />}
              title={t("guards.device.emptyTitle", {
                defaultValue: "Sin dispositivos todavía",
              })}
            />
          ) : (
            <div className="space-y-6">
              {/* Bound device */}
              {bound && (
                <Section
                  icon={<ShieldCheck className="w-4 h-4" />}
                  title={t("guards.device.boundDevice", {
                    defaultValue: "Dispositivo vinculado",
                  })}
                >
                  <DeviceCard
                    device={bound}
                    resetting={resetting === bound.id}
                    t={t}
                    onReset={reset}
                  />
                </Section>
              )}

              {/* Other (unrecognized) devices */}
              {others.length > 0 && (
                <Section
                  icon={<Smartphone className="w-4 h-4" />}
                  title={t("guards.device.otherDevices", {
                    defaultValue: "Otros dispositivos",
                  })}
                >
                  <div className="space-y-3">
                    {others.map((d) => (
                      <DeviceCard
                        key={d.id}
                        device={d}
                        resetting={resetting === d.id}
                        t={t}
                        onReset={reset}
                      />
                    ))}
                  </div>
                </Section>
              )}
            </div>
          )}
        </PageContainer>
      </GuardsLayout>
    </AppLayout>
  );
}

function DeviceCard({
  device,
  onReset,
  resetting,
  t,
}: {
  device: GuardDevice;
  onReset: (d: GuardDevice) => void;
  resetting: boolean;
  t: any;
}) {
  const name =
    [device.manufacturer, device.model].filter(Boolean).join(" ") ||
    device.platform ||
    t("guards.device.unknownDevice", {
      defaultValue: "Dispositivo desconocido",
    });

  return (
    /* Puede repetirse (varios dispositivos) → cristal plano, sin desenfoque. */
    <div
      className="glass-flat p-4 transition"
      style={
        device.flagged
          ? {
              borderColor: "color-mix(in oklab, var(--bad) 32%, transparent)",
              background: "color-mix(in oklab, var(--bad) 6%, transparent)",
            }
          : device.isBound
            ? {
                borderColor: "color-mix(in oklab, var(--ok) 32%, transparent)",
                background: "color-mix(in oklab, var(--ok) 6%, transparent)",
              }
            : undefined
      }
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <IconTile size="sm" tone={device.isBound ? "ok" : "neutral"}>
              <Smartphone />
            </IconTile>
            <span className="font-semibold text-sm truncate">{name}</span>
            {device.isBound && (
              <StatusBadge tone="ok">
                {t("guards.device.bound", { defaultValue: "Vinculado" })}
              </StatusBadge>
            )}
            {device.flagged && (
              <StatusBadge dot={false} tone="bad">
                <AlertTriangle className="h-3 w-3" />
                {t("guards.device.unrecognized", {
                  defaultValue: "No reconocido",
                })}
              </StatusBadge>
            )}
            {device.hasPush && (
              <StatusBadge dot={false} tone="neutral">
                <BellRing className="h-3 w-3" />
                Notificaciones
              </StatusBadge>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
            <Field
              label={t("guards.device.platform", {
                defaultValue: "Plataforma",
              })}
              value={device.platform}
            />
            <Field
              label={t("guards.device.os", { defaultValue: "Sistema" })}
              value={device.osVersion}
            />
            <Field
              label={t("guards.device.appVersion", {
                defaultValue: "Versión app",
              })}
              value={device.appVersion}
            />
            <Field
              icon={<Clock className="h-3 w-3 opacity-60" />}
              label={t("guards.device.lastSeen", { defaultValue: "Visto" })}
              value={fmt(device.lastSeenAt)}
            />
            {device.flagged && (
              <Field
                label={t("guards.device.lastMismatch", {
                  defaultValue: "Última anomalía",
                })}
                value={fmt(device.lastMismatchAt)}
              />
            )}
            <Field mono label="ID" value={device.deviceId} />
          </dl>
        </div>
        <Button
          className="shrink-0"
          disabled={resetting}
          size="sm"
          variant="outline"
          onClick={() => onReset(device)}
        >
          {resetting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          {t("guards.device.reset", { defaultValue: "Restablecer vínculo" })}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  icon,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="cg-eyebrow mb-0.5">{label}</dt>
      <dd
        className={`flex items-center gap-1 truncate text-sm font-medium ${mono ? "font-mono text-[12px]" : ""}`}
      >
        {icon}
        <span className="truncate">{value || "—"}</span>
      </dd>
    </div>
  );
}
