import { useCallback, useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import { Radio, Play, Square, Loader2, Settings2, AlertTriangle, RefreshCw, FileText } from "lucide-react";
import { toast } from "sonner";
import AppLayout from "@/layouts/app-layout";
import { PageContainer, PageHeader, Section, EmptyState, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { radioCheckService } from "@/lib/api/radioCheckService";
import { useFileUrl } from "@/lib/fileUrl";
import { useRadioRealtime } from "@/components/radio/RadioRealtimeProvider";
import RadioLiveChannelPanel from "@/components/radio/RadioLiveChannelPanel";

const statusBadge: Record<string, { label: string; cls: string }> = {
  responded: { label: "Respondió", cls: "bg-emerald-500/15 text-emerald-600" },
  no_response: { label: "Sin respuesta", cls: "bg-red-500/15 text-red-600" },
  notified: { label: "Llamando…", cls: "bg-amber-500/15 text-amber-600" },
  pending: { label: "En cola", cls: "bg-zinc-500/15 text-zinc-500" },
  skipped: { label: "Sin vigilante", cls: "bg-zinc-500/10 text-zinc-400" },
};
const classChip: Record<string, { label: string; cls: string }> = {
  incident: { label: "Incidente", cls: "bg-red-500/15 text-red-600" },
  novedad: { label: "Novedad", cls: "bg-amber-500/15 text-amber-600" },
  sin_novedad: { label: "Sin novedad", cls: "bg-emerald-500/15 text-emerald-600" },
};

/**
 * Audio player for a radio-check clip. The entry's `audioUrl` is a raw
 * privateUrl, so resolve a token-based download URL via `useFileUrl`. Extracted
 * as a component because entries are rendered inside a `.map()` (hooks can't be
 * called in a callback).
 */
function RadioAudio({ audioUrl }: { audioUrl?: string | null }) {
  const src = useFileUrl(audioUrl ?? null);
  return <audio controls preload="none" src={src || undefined} className="h-8 w-full max-w-xs" />;
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
        const s = await radioCheckService.getSession(c.runningSessionId).catch(() => null);
        setRunning(s?.session || null);
        setEntries(s?.entries || []);
      } else { setRunning(null); setEntries([]); }
    } catch (e: any) {
      if (e?.response?.status === 403) toast.error("No tienes permiso para el módulo de radio.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); radioCheckService.getSettings().then(setSettings).catch(() => {}); }, [refresh]);
  useEffect(() => { const id = setInterval(refresh, 20000); return () => clearInterval(id); }, [refresh]);
  useEffect(() => { if (version > 0) refresh(); }, [version, refresh]);
  // Tick every second while a pase is running to drive the report countdown.
  useEffect(() => { if (!running) return; const id = setInterval(() => setNowMs(Date.now()), 1000); return () => clearInterval(id); }, [running]);

  const start = async (scope: "all" | "station", stationId?: string) => {
    setBusy(true);
    try { await radioCheckService.start(scope, stationId); toast.success("Pase iniciado"); await refresh(); }
    catch { toast.error("No se pudo iniciar"); } finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!running) return; setBusy(true);
    try { await radioCheckService.cancelSession(running.id); await refresh(); } finally { setBusy(false); }
  };
  const escalate = async (entryId: string) => {
    try { await radioCheckService.escalate(entryId); toast.success("Marcado como incidente"); await refresh(); } catch { /* ignore */ }
  };
  const saveSettings = async () => {
    try { const s = await radioCheckService.saveSettings(settings); setSettings(s); toast.success("Configuración guardada"); }
    catch { toast.error("No se pudo guardar"); }
  };

  const stations = data?.stations || [];
  const total = running?.totalStations || 0;
  const done = (running?.respondedCount || 0) + (running?.noResponseCount || 0);
  // Merge running-session entries (richer: transcript/audio) over the console rows.
  const entryByStation: Record<string, any> = {};
  entries.forEach((e) => { entryByStation[e.stationId] = e; });

  // Report countdown: all stations share the same 60s deadline (simultaneous
  // window). Take the latest still-open timeout among notified entries.
  const deadlineMs = entries.reduce((max, e) => {
    if (e?.status === "notified" && e?.timeoutAt) { const t = new Date(e.timeoutAt).getTime(); return t > max ? t : max; }
    return max;
  }, 0);
  const remainingSec = deadlineMs ? Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000)) : null;
  const countdown = remainingSec != null
    ? `${String(Math.floor(remainingSec / 60)).padStart(2, "0")}:${String(remainingSec % 60).padStart(2, "0")}`
    : null;

  return (
    <AppLayout>
    <PageContainer>
      <PageHeader
        icon={<Radio />}
        title="Radio · Pase de novedades"
        subtitle="Coordina el pase de novedades por puesto en tiempo real."
        badges={
          <StatusBadge tone={connected ? "green" : "slate"}>
            {connected ? "En tiempo real" : "Reconectando…"}
          </StatusBadge>
        }
        actions={
          <>
            <Button variant="outline" size="icon" onClick={refresh} title="Actualizar">
              <RefreshCw size={16} />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setShowSettings((v) => !v)} title={t("ui.RadioDispatch.configuracion", "Configuración")}>
              <Settings2 size={16} />
            </Button>
            {running ? (
              <Button variant="outline" onClick={cancel} disabled={busy}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Square size={14} />} Cancelar
              </Button>
            ) : (
              <Button variant="brand" onClick={() => start("all")} disabled={busy || !stations.length}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Iniciar pase
              </Button>
            )}
          </>
        }
      />

      {showSettings && settings && (
        <Section title={t("ui.RadioDispatch.paseAutomatico", "Pase automático")} icon={<Settings2 />}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} /> Activado</label>
            <label className="text-sm">Intervalo (min)<input type="number" min={1} value={settings.intervalMinutes ?? 35} onChange={(e) => setSettings({ ...settings, intervalMinutes: +e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5" /></label>
            <label className="text-sm">Espera/puesto (seg)<input type="number" min={30} value={settings.perStationTimeoutSeconds ?? 180} onChange={(e) => setSettings({ ...settings, perStationTimeoutSeconds: +e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5" /></label>
            <label className="text-sm">Hora inicio<input type="time" value={settings.activeHoursStart ?? ""} onChange={(e) => setSettings({ ...settings, activeHoursStart: e.target.value || null })} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5" /></label>
            <label className="text-sm">Hora fin<input type="time" value={settings.activeHoursEnd ?? ""} onChange={(e) => setSettings({ ...settings, activeHoursEnd: e.target.value || null })} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5" /></label>
          </div>
          <label className="mt-3 block text-sm">Mensaje al puesto<textarea rows={2} value={settings.promptText ?? ""} onChange={(e) => setSettings({ ...settings, promptText: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" /></label>
          <Button variant="brand" size="sm" onClick={saveSettings} className="mt-3">Guardar</Button>
        </Section>
      )}

      {running && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="font-semibold">
              {done >= total ? "Finalizando…" : "Reportes entrantes"} · {running.respondedCount || 0}/{total} recibidos
            </span>
            <div className="flex items-center gap-3">
              {countdown && (
                <span
                  className={`rounded-lg px-3 py-1 font-mono text-lg font-bold tabular-nums ${
                    (remainingSec ?? 0) > 0 ? "bg-amber-500/20 text-amber-700" : "bg-red-500/15 text-red-600"
                  }`}
                  title="Tiempo restante para completar el reporte"
                >
                  {(remainingSec ?? 0) > 0 ? `⏱ ${countdown}` : "Tiempo agotado"}
                </span>
              )}
              <span className="text-muted-foreground">{running.respondedCount || 0} respondieron · {running.noResponseCount || 0} sin respuesta</span>
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
          </div>
        </div>
      )}

      <div className="mb-5"><RadioLiveChannelPanel /></div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
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
                    <p className="truncate text-xs text-muted-foreground">{(s.onDutyGuards || []).join(", ") || "Sin vigilante en turno"}</p>
                  </div>
                  {cc && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cc.cls}`}>{cc.label}</span>}
                  {badge && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.label}</span>}
                  <Button variant="outline" size="icon" onClick={() => start("station", s.stationId)} disabled={busy || !!running} title="Llamar a este puesto"><Play size={13} /></Button>
                </div>
                {e && (e.transcript || e.transcriptStatus === "pending" || e.hasAudio) && (
                  <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                    {e.transcript ? <p className="text-sm">{e.transcript}</p> : e.transcriptStatus === "pending" ? <p className="text-xs italic text-muted-foreground">Transcribiendo…</p> : null}
                    {e.hasAudio && e.audioUrl !== undefined && (
                      <RadioAudio audioUrl={e.audioUrl} />
                    )}
                    {st === "responded" && e.classification !== "incident" && (
                      <button onClick={() => escalate(e.entryId || e.id)} className="flex items-center gap-1 text-[11px] text-red-600 hover:underline"><AlertTriangle size={12} /> Marcar como incidente</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!stations.length && (
            <EmptyState icon={<Radio />} title="No hay puestos configurados." />
          )}
        </div>
      )}

      <RecentSessions />
    </PageContainer>
    </AppLayout>
  );
}

function RecentSessions() {
  const { version } = useRadioRealtime();
  const [rows, setRows] = useState<any[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => { radioCheckService.listSessions(10).then((r) => setRows(r?.rows || [])).catch(() => {}); }, [version]);
  const open = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    const d = await radioCheckService.getSession(id).catch(() => null);
    setDetail(d);
  };

  if (!rows.length) return null;
  return (
    <div className="mt-8">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"><FileText size={15} /> Pases recientes</h2>
      <div className="space-y-2">
        {rows.map((s) => (
          <div key={s.id} className="cg-card cg-card-hover">
            <button onClick={() => open(s.id)} className="flex w-full items-center gap-3 p-3 text-left">
              <span className="text-xs text-muted-foreground">{new Date(s.startedAt).toLocaleString()}</span>
              <span className="text-xs">{s.mode === "auto" ? "Automático" : "Manual"}</span>
              <span className="flex-1" />
              <span className="text-xs text-emerald-600">{s.respondedCount || 0}✓</span>
              <span className="text-xs text-red-600">{s.noResponseCount || 0}✕</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.status === "completed" ? "bg-emerald-500/15 text-emerald-600" : s.status === "running" ? "bg-amber-500/15 text-amber-600" : "bg-zinc-500/15 text-zinc-500"}`}>{s.status}</span>
            </button>
            {openId === s.id && detail?.session?.id === s.id && (
              <div className="border-t border-border p-3 text-sm">
                {detail.session.summary ? <p className="whitespace-pre-wrap">{detail.session.summary}</p>
                  : <p className="text-xs italic text-muted-foreground">{detail.session.summaryStatus === "skipped" ? "Resumen no disponible (sin clave de IA)." : "Generando resumen…"}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
