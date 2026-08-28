import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Siren,
  RefreshCw,
  Loader2,
  Filter,
  Clock,
  ShieldAlert,
  AlertTriangle,
  Activity,
  ChevronRight,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  PageContainer, PageHeader, Section, Stagger, StatCard, EmptyState,
  GlassPanel, StatusBadge, Segmented, Toolbar, SkeletonCards,
} from "@/components/kit";
import {
  alarmService,
  alarmSourceMeta,
  type AlarmCase,
  type AlarmCaseStatus,
} from "@/lib/api/alarmService";
import { openEventStream } from "@/lib/api/eventStream";
import {
  CriticalRail, ClockPill, PriorityPill, STATUS_META, OPEN_STATUSES,
  categoryMeta, categoryTone, criticalBorder, elapsedSince, formatWhen, slaTone,
  sourceTone,
} from "./shared";


/* ------------------------------------------------------------------ */
/* Metadata (Spanish labels)                                           */
/* ------------------------------------------------------------------ */

type StatusFilter = "all" | AlarmCaseStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "queued", label: "En cola" },
  { value: "acknowledged", label: "Reconocidas" },
  { value: "verifying", label: "Verificando" },
  { value: "dispatched", label: "Despachadas" },
  { value: "resolved", label: "Resueltas" },
  { value: "closed", label: "Cerradas" },
];

/** Lo único propio de esta pantalla: qué marca de tiempo ordena la cola. Todo
 *  el resto del vocabulario de alarmas —estado, categoría, prioridad, SLA— vive
 *  en `./shared` y lo comparten el detalle del caso y el registro de señales. */
function caseTime(c: AlarmCase): string {
  return c.createdAt || c.updatedAt || "";
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AlarmQueue() {
  const navigate = useNavigate();
  const [cases, setCases] = React.useState<AlarmCase[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [now, setNow] = React.useState(() => Date.now());

  const load = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const rows = await alarmService.cases(
          status === "all" ? undefined : { status }
        );
        setCases(Array.isArray(rows) ? rows : []);
      } catch (e) {
        const err = e as { data?: { message?: string }; message?: string };
        toast.error(err?.data?.message || err?.message || "No se pudieron cargar las alarmas");
      } finally {
        setLoading(false);
      }
    },
    [status]
  );

  React.useEffect(() => {
    load();
  }, [load]);

  // Live SLA timer tick + silent auto-refresh of the queue (poll is the SSE fallback)
  React.useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => load({ silent: true }), 20000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [load]);

  // Real-time: subscribe to the platform SSE stream; refresh instantly on alarm events.
  React.useEffect(() => {
    const tid = localStorage.getItem("tenantId") || "";
    let t: ReturnType<typeof setTimeout> | null = null;
    const debouncedReload = () => { if (t) clearTimeout(t); t = setTimeout(() => load({ silent: true }), 600); };
    // Shared helper centralizes the token-in-URL setup (see eventStream.ts security note).
    const es = openEventStream(tid);
    if (es) {
      const onEvent = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data);
          if (typeof data?.eventType === "string" && data.eventType.startsWith("alarm")) {
            if (data.eventType === "alarm.case.new" || data.eventType === "alarm.case.escalated") {
              toast(data.title || "Nueva alarma", { description: data.body });
            }
            debouncedReload();
          }
        } catch { /* heartbeat / non-JSON */ }
      };
      es.addEventListener("notification", onEvent as EventListener);
    } // else SSE unsupported — the poll covers it
    return () => { es?.close(); if (t) clearTimeout(t); };
  }, [load]);

  // Sort by priority (asc, 1=critical first) then by time (newest first)
  const sorted = React.useMemo(() => {
    return [...cases].sort((a, b) => {
      const pa = a.priority ?? 3;
      const pb = b.priority ?? 3;
      if (pa !== pb) return pa - pb;
      const ta = new Date(caseTime(a)).getTime() || 0;
      const tb = new Date(caseTime(b)).getTime() || 0;
      return tb - ta;
    });
  }, [cases]);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = {};
    for (const cs of cases) {
      const s = cs.status || "queued";
      c[s] = (c[s] || 0) + 1;
    }
    return c;
  }, [cases]);

  /* Abiertas = las que siguen pidiendo atención. Es la cifra que decide si la
     cabecera late o no. */
  const abiertas = React.useMemo(
    () => cases.filter((c) => OPEN_STATUSES.has(c.status || "queued")).length,
    [cases]
  );
  const criticas = React.useMemo(
    () => cases.filter((c) => (c.priority ?? 3) === 1 && OPEN_STATUSES.has(c.status || "queued")).length,
    [cases]
  );

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<Siren />}
          /**
           * ── DEJA DE LLAMARSE «COLA DE ALARMAS» ──────────────────────────
           * Se llamaba así porque nació dentro de la Central de Monitoreo, el
           * negocio de recibir señales de paneles de alarma. Pero medido el
           * 2026-08-27: de los 29 casos que hay, DIECISÉIS son SOS de la app
           * del cliente y TRECE son pánicos de vigilantes. De paneles, CERO —
           * ese negocio todavía no arrancó.
           *
           * O sea que esta pantalla no es la cola de la central: es la consola
           * de emergencias de la operación, y quien la busca la busca por ahí.
           * El nombre viejo la escondía dentro de un módulo que la mayoría de
           * las empresas no usa. Ahora vive en el primer nivel del menú, debajo
           * de Actividad; Paneles, Señales, Reportes y Análisis se quedan en la
           * Central de Monitoreo, que es su sitio.
           *
           * El nombre aguanta cuando entren los paneles: una alarma de panel
           * también es una emergencia y también se atiende aquí.
           */
          title="Centro de Emergencias"
          subtitle="Pánicos, SOS y alarmas activas, por prioridad"
          badges={loading ? null : (
            <>
              {criticas > 0 && (
                <StatusBadge tone="bad">
                  {criticas === 1 ? "1 crítica sin cerrar" : `${criticas} críticas sin cerrar`}
                </StatusBadge>
              )}
              {abiertas > 0 ? (
                <StatusBadge tone={criticas > 0 ? "warn" : "info"}>
                  {abiertas === 1 ? "1 caso abierto" : `${abiertas} casos abiertos`}
                </StatusBadge>
              ) : (
                <StatusBadge tone="ok">Sin casos abiertos</StatusBadge>
              )}
            </>
          )}
          actions={(
            <Button
              variant="outline"
              onClick={() => load()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Actualizar
            </Button>
          )}
        />

        <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total" value={cases.length} icon={<Siren />} accent="neutral" />
          <StatCard label="En cola" value={counts['queued'] || 0} icon={<Clock />} accent="bad" />
          <StatCard label="Verificando" value={counts['verifying'] || 0} icon={<ShieldAlert />} accent="info" />
          <StatCard label="Resueltas" value={counts['resolved'] || 0} icon={<Activity />} accent="ok" />
        </Stagger>

        {/* Filtros */}
        <Toolbar>
          <span className="ml-1 mr-1 flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>
            <Filter className="size-3.5" />
            Estado
          </span>
          <Segmented
            className="flex-wrap"
            value={status}
            onChange={setStatus}
            options={STATUS_FILTERS.map((f) => ({
              value: f.value,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  {f.label}
                  <span className="tabular-nums opacity-70">
                    {f.value === "all" ? cases.length : counts[f.value] || 0}
                  </span>
                </span>
              ),
            }))}
          />
        </Toolbar>

        {/* List */}
        <Section title="Casos de alarma" icon={<Siren />}>
        {loading ? (
          <SkeletonCards count={4} className="sm:grid-cols-1" />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<Siren />}
            title="Sin alarmas"
            description={status === "all"
              ? "No hay casos de alarma en este momento."
              : "No hay casos con este estado."}
          />
        ) : (
          <div className="space-y-3">
            {sorted.map((c) => {
              const cat = categoryMeta(c.category);
              const st = STATUS_META[c.status || "queued"] || STATUS_META.queued;
              const live = OPEN_STATUSES.has(c.status || "queued");
              const panelName = c.panel?.name || "Panel desconocido";
              const accountNumber = c.panel?.accountNumber;

              const sm = alarmSourceMeta(c.source);
              const sla = slaTone(caseTime(c), live, now);
              /* El canto rojo: sólo para lo que de verdad está ardiendo — una P1
                 todavía abierta. Si se lo ponemos a todo, deja de significar nada. */
              const urgente = live && (c.priority ?? 3) === 1;

              return (
                /* `flat`: es una lista que puede tener cientos de casos y se
                   refresca cada segundo con el cronómetro. */
                <GlassPanel
                  key={c.id}
                  flat
                  hover
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/alarm/case/${c.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/alarm/case/${c.id}`);
                    }
                  }}
                  className="cg-focus relative cursor-pointer overflow-hidden p-4"
                  style={criticalBorder(urgente)}
                >
                  {urgente && <CriticalRail />}
                  <div className="flex items-center gap-3">
                    {/* Prioridad */}
                    <PriorityPill p={c.priority} />

                    {/* Center info */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        {/* Incendio, atraco, pánico, intrusión y médica van en
                            `--bad` vengan con la prioridad que vengan: un
                            incendio no deja de serlo porque el panel lo
                            etiquete P3. El resto son clasificación, no
                            severidad, y van neutras. */}
                        <StatusBadge tone={categoryTone(c.category)} dot={false}>
                          <span className="[&_svg]:size-3.5">{cat.icon}</span>
                          {cat.label}
                        </StatusBadge>
                        <StatusBadge tone={st.tone} dot={live}>{st.label}</StatusBadge>
                        <StatusBadge tone={sourceTone(c.source)} dot={false}>{sm.short}</StatusBadge>
                        {c.incidentId ? (
                          /* Escalado a incidente: es una agravación del caso, no
                             un realce de marca. Iba en el acento configurable. */
                          <StatusBadge tone="bad" dot={false}>
                            <AlertTriangle className="size-3.5" />
                            Incidente
                          </StatusBadge>
                        ) : null}
                      </div>

                      <p className="truncate font-medium">
                        {c.title || cat.label}
                      </p>

                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--ink-faint)' }}>
                        <span className="inline-flex items-center gap-1">
                          <ShieldAlert className="size-3.5" />
                          {panelName}
                          {accountNumber ? ` · #${accountNumber}` : ""}
                        </span>
                        <span>{formatWhen(caseTime(c))}</span>
                      </div>
                    </div>

                    {/* SLA timer — LIVE only while the case is open. Once resolved/
                        closed the clock stops: we show the FINAL handling duration
                        (frozen to closedAt/resolvedAt), never a ticking counter. */}
                    {live ? (
                      <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                        <ClockPill token={sla.token} pulsa={sla.alarmante}>
                          <Clock className="size-3.5" />
                          {elapsedSince(caseTime(c), now)}
                        </ClockPill>
                        <span className="cg-eyebrow">en cola</span>
                      </div>
                    ) : (
                      <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                        <ClockPill token="neutral">
                          <Clock className="size-3.5" />
                          {elapsedSince(
                            caseTime(c),
                            new Date(c.closedAt || c.resolvedAt || c.updatedAt || caseTime(c)).getTime(),
                          )}
                        </ClockPill>
                        <span className="cg-eyebrow">
                          {(c.status || "") === "closed" ? "duración" : "resuelta en"}
                        </span>
                      </div>
                    )}

                    <ChevronRight className="size-5 shrink-0" style={{ color: 'var(--ink-faint)' }} />
                  </div>
                </GlassPanel>
              );
            })}
          </div>
        )}
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
