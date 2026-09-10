import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Radio,
  Play,
  Square,
  Loader2,
  Settings2,
  AlertTriangle,
  RefreshCw,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

import AppLayout from "@/layouts/app-layout";
import {
  PageContainer,
  PageHeader,
  Section,
  EmptyState,
  StatusBadge,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { radioCheckService } from "@/lib/api/radioCheckService";
import { useFileUrl } from "@/lib/fileUrl";
import { useRadioRealtime } from "@/components/radio/RadioRealtimeProvider";
import RadioLiveChannelPanel from "@/components/radio/RadioLiveChannelPanel";
import RadioCoveragePanel from "@/components/radio/RadioCoveragePanel";

const statusBadge: Record<
  string,
  { label: string; labelKey: string; cls: string }
> = {
  responded: {
    label: "Respondió",
    labelKey: "ui.RadioDispatch.status.responded",
    cls: "bg-emerald-500/15 text-emerald-600",
  },
  no_response: {
    label: "Sin respuesta",
    labelKey: "ui.RadioDispatch.status.no_response",
    cls: "bg-red-500/15 text-red-600",
  },
  notified: {
    label: "Llamando…",
    labelKey: "ui.RadioDispatch.status.notified",
    cls: "bg-amber-500/15 text-amber-600",
  },
  pending: {
    label: "En cola",
    labelKey: "ui.RadioDispatch.status.pending",
    cls: "bg-zinc-500/15 text-zinc-500",
  },
  skipped: {
    label: "Sin vigilante",
    labelKey: "ui.RadioDispatch.status.skipped",
    cls: "bg-zinc-500/10 text-zinc-400",
  },
};
const classChip: Record<
  string,
  { label: string; labelKey: string; cls: string }
> = {
  incident: {
    label: "Incidente",
    labelKey: "ui.RadioDispatch.class.incident",
    cls: "bg-red-500/15 text-red-600",
  },
  novedad: {
    label: "Novedad",
    labelKey: "ui.RadioDispatch.class.novedad",
    cls: "bg-amber-500/15 text-amber-600",
  },
  sin_novedad: {
    label: "Sin novedad",
    labelKey: "ui.RadioDispatch.class.sin_novedad",
    cls: "bg-emerald-500/15 text-emerald-600",
  },
};

/**
 * Audio player for a radio-check clip. The entry's `audioUrl` is a raw
 * privateUrl, so resolve a token-based download URL via `useFileUrl`. Extracted
 * as a component because entries are rendered inside a `.map()` (hooks can't be
 * called in a callback).
 */
function RadioAudio({ audioUrl }: { audioUrl?: string | null }) {
  const src = useFileUrl(audioUrl ?? null);

  return (
    <audio
      controls
      className="h-8 w-full max-w-xs"
      preload="none"
      src={src || undefined}
    />
  );
}

export default function RadioDispatch() {
  const { t } = useTranslation();
  const { version, connected } = useRadioRealtime();
  const [data, setData] = useState<any>(null);
  const [running, setRunning] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const c = await radioCheckService.getConsole();

      setData(c);
      if (c?.runningSessionId) {
        const s = await radioCheckService
          .getSession(c.runningSessionId)
          .catch(() => null);

        setRunning(s?.session || null);
        setEntries(s?.entries || []);
      } else {
        setRunning(null);
        setEntries([]);
      }
    } catch (e: any) {
      if (e?.response?.status === 403)
        toast.error(t("ui.RadioDispatch.noTienesPermisoParaEl"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    radioCheckService
      .getSettings()
      .then(setSettings)
      .catch(() => {});
  }, [refresh]);
  useEffect(() => {
    const id = setInterval(refresh, 20000);

    return () => clearInterval(id);
  }, [refresh]);
  useEffect(() => {
    if (version > 0) refresh();
  }, [version, refresh]);
  // Tick every second while a pase is running to drive the report countdown.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);

    return () => clearInterval(id);
  }, [running]);

  const start = async (scope: "all" | "station", stationId?: string) => {
    setBusy(true);
    try {
      await radioCheckService.start(scope, stationId);
      toast.success("Pase iniciado");
      await refresh();
    } catch {
      toast.error(t("ui.RadioDispatch.noSePudoIniciar"));
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!running) return;
    setBusy(true);
    try {
      await radioCheckService.cancelSession(running.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const escalate = async (entryId: string) => {
    try {
      await radioCheckService.escalate(entryId);
      toast.success(t("ui.RadioDispatch.marcadoComoIncidente"));
      await refresh();
    } catch {
      /* ignore */
    }
  };
  const saveSettings = async () => {
    try {
      const s = await radioCheckService.saveSettings(settings);

      setSettings(s);
      toast.success(t("comun.configuracionGuardada"));
    } catch {
      toast.error(t("comun.noSePudoGuardar"));
    }
  };

  const stations = data?.stations || [];
  const total = running?.totalStations || 0;
  const done = (running?.respondedCount || 0) + (running?.noResponseCount || 0);
  // Merge running-session entries (richer: transcript/audio) over the console rows.
  const entryByStation: Record<string, any> = {};

  entries.forEach((e) => {
    entryByStation[e.stationId] = e;
  });

  // Report countdown: all stations share the same 60s deadline (simultaneous
  // window). Take the latest still-open timeout among notified entries.
  const deadlineMs = entries.reduce((max, e) => {
    if (e?.status === "notified" && e?.timeoutAt) {
      const t = new Date(e.timeoutAt).getTime();

      return t > max ? t : max;
    }

    return max;
  }, 0);
  const remainingSec = deadlineMs
    ? Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000))
    : null;
  const countdown =
    remainingSec != null
      ? `${String(Math.floor(remainingSec / 60)).padStart(2, "0")}:${String(remainingSec % 60).padStart(2, "0")}`
      : null;

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          actions={
            <>
              <Button
                size="icon"
                title="Actualizar"
                variant="outline"
                onClick={refresh}
              >
                <RefreshCw size={16} />
              </Button>
              <Button
                size="icon"
                title={t("ui.RadioDispatch.configuracion", "Configuración")}
                variant="outline"
                onClick={() => setShowSettings((v) => !v)}
              >
                <Settings2 size={16} />
              </Button>
              {running ? (
                <Button disabled={busy} variant="outline" onClick={cancel}>
                  {busy ? (
                    <Loader2 className="animate-spin" size={15} />
                  ) : (
                    <Square size={14} />
                  )}{" "}
                  Cancelar
                </Button>
              ) : (
                <Button
                  disabled={busy || !stations.length}
                  variant="brand"
                  onClick={() => start("all")}
                >
                  {busy ? (
                    <Loader2 className="animate-spin" size={15} />
                  ) : (
                    <Play size={15} />
                  )}{" "}
                  Iniciar pase
                </Button>
              )}
            </>
          }
          badges={
            <StatusBadge tone={connected ? "green" : "slate"}>
              {connected ? "En tiempo real" : "Reconectando…"}
            </StatusBadge>
          }
          icon={<Radio />}
          subtitle={t("ui.RadioDispatch.coordinaElPaseDeNovedades")}
          title="Radio · Pase de novedades"
        />

        {showSettings && settings && (
          <Section
            icon={<Settings2 />}
            title={t("ui.RadioDispatch.paseAutomatico", "Pase automático")}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={!!settings.enabled}
                  type="checkbox"
                  onChange={(e) =>
                    setSettings({ ...settings, enabled: e.target.checked })
                  }
                />{" "}
                Activado
              </label>
              <label className="text-sm">
                Intervalo (min)
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5"
                  min={1}
                  type="number"
                  value={settings.intervalMinutes ?? 35}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      intervalMinutes: +e.target.value,
                    })
                  }
                />
              </label>
              <label className="text-sm">
                {t("ui.RadioDispatch.esperaPuestoSeg")}
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5"
                  min={30}
                  type="number"
                  value={settings.perStationTimeoutSeconds ?? 180}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      perStationTimeoutSeconds: +e.target.value,
                    })
                  }
                />
              </label>
              <label className="text-sm">
                {t("comun.horaInicio")}
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5"
                  type="time"
                  value={settings.activeHoursStart ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      activeHoursStart: e.target.value || null,
                    })
                  }
                />
              </label>
              <label className="text-sm">
                {t("comun.horaFin")}
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5"
                  type="time"
                  value={settings.activeHoursEnd ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      activeHoursEnd: e.target.value || null,
                    })
                  }
                />
              </label>
            </div>
            <label className="mt-3 block text-sm">
              {t("ui.RadioDispatch.mensajeAlPuesto")}
              <textarea
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                rows={2}
                value={settings.promptText ?? ""}
                onChange={(e) =>
                  setSettings({ ...settings, promptText: e.target.value })
                }
              />
            </label>
            <Button
              className="mt-3"
              size="sm"
              variant="brand"
              onClick={saveSettings}
            >
              {t("actions.save")}
            </Button>
          </Section>
        )}

        {running && (
          <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="font-semibold">
                {done >= total ? "Finalizando…" : "Reportes entrantes"} ·{" "}
                {running.respondedCount || 0}/{total} recibidos
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {countdown && (
                  <span
                    className={`rounded-lg px-3 py-1 font-mono text-lg font-bold tabular-nums ${
                      (remainingSec ?? 0) > 0
                        ? "bg-amber-500/20 text-amber-700"
                        : "bg-red-500/15 text-red-600"
                    }`}
                    title={t("ui.RadioDispatch.tiempoRestanteParaCompletarEl")}
                  >
                    {(remainingSec ?? 0) > 0
                      ? `⏱ ${countdown}`
                      : "Tiempo agotado"}
                  </span>
                )}
                <span className="text-muted-foreground">
                  {running.respondedCount || 0} respondieron ·{" "}
                  {running.noResponseCount || 0} sin respuesta
                </span>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{
                  width: `${total ? Math.round((done / total) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        <div className="mb-5">
          <RadioLiveChannelPanel />
        </div>
        {/* Debajo del canal en vivo a propósito: primero se ve el canal, y
          justo después a quién le toca estar en él y no está. */}
        <div className="mb-5">
          <RadioCoveragePanel />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            {stations.map((s: any) => {
              const e = entryByStation[s.stationId] || s.latest;
              const st = e?.status as string | undefined;
              const badge = st ? statusBadge[st] : null;
              const cc = e?.classification ? classChip[e.classification] : null;

              return (
                <div key={s.stationId} className="cg-card cg-card-hover p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{s.stationName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {(s.onDutyGuards || []).join(", ") ||
                          t(
                            "ui.RadioDispatch.sinVigilanteEnTurno",
                            "Sin vigilante en turno",
                          )}
                      </p>
                    </div>
                    {cc && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cc.cls}`}
                      >
                        {t(cc.labelKey, cc.label)}
                      </span>
                    )}
                    {badge && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}
                      >
                        {t(badge.labelKey, badge.label)}
                      </span>
                    )}
                    <Button
                      className="shrink-0"
                      disabled={busy || !!running}
                      size="icon"
                      title={t("ui.RadioDispatch.llamarAEstePuesto")}
                      variant="outline"
                      onClick={() => start("station", s.stationId)}
                    >
                      <Play size={13} />
                    </Button>
                  </div>
                  {e &&
                    (e.transcript ||
                      e.transcriptStatus === "pending" ||
                      e.hasAudio) && (
                      <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                        {e.transcript ? (
                          <p className="text-sm">{e.transcript}</p>
                        ) : e.transcriptStatus === "pending" ? (
                          <p className="text-xs italic text-muted-foreground">
                            Transcribiendo…
                          </p>
                        ) : null}
                        {e.hasAudio && e.audioUrl !== undefined && (
                          <RadioAudio audioUrl={e.audioUrl} />
                        )}
                        {st === "responded" &&
                          e.classification !== "incident" && (
                            <button
                              className="flex items-center gap-1 text-[11px] text-red-600 hover:underline"
                              onClick={() => escalate(e.entryId || e.id)}
                            >
                              <AlertTriangle size={12} />{" "}
                              {t("ui.RadioDispatch.marcarComoIncidente")}
                            </button>
                          )}
                      </div>
                    )}
                </div>
              );
            })}
            {!stations.length && (
              <EmptyState
                icon={<Radio />}
                title={t("ui.RadioDispatch.noHayPuestosConfigurados")}
              />
            )}
          </div>
        )}

        <RecentSessions />
      </PageContainer>
    </AppLayout>
  );
}

function RecentSessions() {
  const { t } = useTranslation();
  const { version } = useRadioRealtime();
  const [rows, setRows] = useState<any[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    radioCheckService
      .listSessions(10)
      .then((r) => setRows(r?.rows || []))
      .catch(() => {});
  }, [version]);
  const open = async (id: string) => {
    if (openId === id) {
      setOpenId(null);

      return;
    }
    setOpenId(id);
    const d = await radioCheckService.getSession(id).catch(() => null);

    setDetail(d);
  };

  if (!rows.length) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <FileText size={15} /> Pases recientes
      </h2>
      <div className="space-y-2">
        {rows.map((s) => (
          <div key={s.id} className="cg-card cg-card-hover">
            <button
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 p-3 text-left"
              onClick={() => open(s.id)}
            >
              <span className="text-xs text-muted-foreground">
                {new Date(s.startedAt).toLocaleString()}
              </span>
              <span className="text-xs">
                {s.mode === "auto"
                  ? t("ui.RadioDispatch.automatico", "Automático")
                  : t("ui.RadioDispatch.manual", "Manual")}
              </span>
              <span className="flex-1" />
              <span className="text-xs text-emerald-600">
                {s.respondedCount || 0}✓
              </span>
              <span className="text-xs text-red-600">
                {s.noResponseCount || 0}✕
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.status === "completed" ? "bg-emerald-500/15 text-emerald-600" : s.status === "running" ? "bg-amber-500/15 text-amber-600" : "bg-zinc-500/15 text-zinc-500"}`}
              >
                {s.status}
              </span>
            </button>
            {openId === s.id && detail?.session?.id === s.id && (
              <div className="border-t border-border p-3 text-sm">
                {detail.session.summary ? (
                  <p className="whitespace-pre-wrap">
                    {detail.session.summary}
                  </p>
                ) : (
                  <p className="text-xs italic text-muted-foreground">
                    {detail.session.summaryStatus === "skipped"
                      ? t(
                          "ui.RadioDispatch.resumenNoDisponibleSinClaveDeIa",
                          "Resumen no disponible (sin clave de IA).",
                        )
                      : t(
                          "ui.RadioDispatch.generandoResumen",
                          "Generando resumen…",
                        )}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
