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
import { useTranslation } from "react-i18next";

import {
  CriticalRail,
  ClockPill,
  PriorityPill,
  STATUS_META,
  OPEN_STATUSES,
  categoryMeta,
  categoryTone,
  criticalBorder,
  elapsedSince,
  formatWhen,
  slaTone,
  sourceTone,
} from "./shared";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  Section,
  Stagger,
  StatCard,
  StatsStrip,
  EmptyState,
  GlassPanel,
  StatusBadge,
  Segmented,
  Toolbar,
  SkeletonCards,
} from "@/components/kit";
import {
  alarmService,
  alarmSourceMeta,
  type AlarmCase,
  type AlarmCaseStatus,
} from "@/lib/api/alarmService";
import { openEventStream } from "@/lib/api/eventStream";
import { useEventoEnVivo } from "@/hooks/useEventoEnVivo";
import { AvisoLlegoTarde, llegadaDe } from "@/components/conexion/AvisoLlegoTarde";
import { useMarcasSinSenal } from "@/hooks/useMarcasSinSenal";

/* ------------------------------------------------------------------ */
/* Metadata (labels via i18n)                                          */
/* ------------------------------------------------------------------ */

type StatusFilter = "all" | AlarmCaseStatus;

const STATUS_FILTERS: { value: StatusFilter; key: string }[] = [
  { value: "all", key: "emergency.filter.all" },
  { value: "queued", key: "emergency.filter.queued" },
  { value: "acknowledged", key: "emergency.filter.acknowledged" },
  { value: "verifying", key: "emergency.filter.verifying" },
  { value: "dispatched", key: "emergency.filter.dispatched" },
  { value: "resolved", key: "emergency.filter.resolved" },
  { value: "closed", key: "emergency.filter.closed" },
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
  const { t } = useTranslation();
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
          status === "all" ? undefined : { status },
        );

        setCases(Array.isArray(rows) ? rows : []);
      } catch (e) {
        const err = e as { data?: { message?: string }; message?: string };

        toast.error(
          err?.data?.message || err?.message || t("emergency.loadError"),
        );
      } finally {
        setLoading(false);
      }
    },
    [status],
  );

  React.useEffect(() => {
    load();
  }, [load]);

  /* El reloj del SLA es de PANTALLA: cuenta segundos, no pide nada. Se queda a
     1 s y separado del sondeo, que antes compartían efecto — cambiar el filtro
     reiniciaba también el cronómetro. */
  React.useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(tick);
  }, []);

  /* La cola se entera por `alarm:case`: lo emite el embudo único del backend, o
     sea los seis endpoints de consola, el normalizador de señales de panel y el
     escalado por SLA. El reloj se queda como red de seguridad, pero a 2 min en
     vez de 20 s y parado con la pestaña oculta. */
  useEventoEnVivo(["alarm:case"], () => load({ silent: true }));
  React.useEffect(() => {
    let iv: ReturnType<typeof setInterval> | null = null;
    const visible = () => document.visibilityState !== "hidden";
    const arrancar = () => {
      if (!iv && visible())
        iv = setInterval(() => load({ silent: true }), 120_000);
    };
    const parar = () => {
      if (iv) {
        clearInterval(iv);
        iv = null;
      }
    };
    const alVerse = () => {
      if (visible()) {
        load({ silent: true });
        arrancar();
      } else parar();
    };

    arrancar();
    document.addEventListener("visibilitychange", alVerse);

    return () => {
      parar();
      document.removeEventListener("visibilitychange", alVerse);
    };
  }, [load]);

  // Real-time: subscribe to the platform SSE stream; refresh instantly on alarm events.
  React.useEffect(() => {
    const tid = localStorage.getItem("tenantId") || "";
    // Se llamaba `t` y tapaba la función de traducción del componente.
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    const debouncedReload = () => {
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(() => load({ silent: true }), 600);
    };
    // One-time ticket per connection, reconnects on its own (see eventStream.ts).
    const es = openEventStream(tid);

    if (es) {
      const onEvent = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data);

          if (
            typeof data?.eventType === "string" &&
            data.eventType.startsWith("alarm")
          ) {
            if (
              data.eventType === "alarm.case.new" ||
              data.eventType === "alarm.case.escalated"
            ) {
              toast(data.title || t("emergency.newAlarm"), {
                description: data.body,
              });
            }
            debouncedReload();
          }
        } catch {
          /* heartbeat / non-JSON */
        }
      };

      es.addEventListener("notification", onEvent as EventListener);
    } // else SSE unsupported — the poll covers it

    return () => {
      es?.close();
      if (temporizador) clearTimeout(temporizador);
    };
  }, [load]);

  // Sort by priority (asc, 1=critical first) then by time (newest first)
  // ¿Algún caso viene de un SOS guardado sin señal? Una consulta por la cola.
  const marcasSinSenal = useMarcasSinSenal(cases.map((c: any) => c.incidentId || c.id));
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
    [cases],
  );
  const criticas = React.useMemo(
    () =>
      cases.filter(
        (c) =>
          (c.priority ?? 3) === 1 && OPEN_STATUSES.has(c.status || "queued"),
      ).length,
    [cases],
  );

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
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
              {t("emergency.refresh")}
            </Button>
          )}
          badges={loading ? null : (
            <>
              {criticas > 0 && (
                <StatusBadge tone="bad">
                  {t("emergency.criticalOpen", { count: criticas })}
                </StatusBadge>
              )}
              {abiertas > 0 ? (
                <StatusBadge tone={criticas > 0 ? "warn" : "info"}>
                  {t("emergency.casesOpen", { count: abiertas })}
                </StatusBadge>
              ) : (
                <StatusBadge tone="ok">{t("emergency.noneOpen")}</StatusBadge>
              )}
            </>
          )}
          subtitle={t("emergency.subtitle")}
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
          title={t("emergency.title")}
        />

        <StatsStrip className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            accent="neutral"
            icon={<Siren />}
            label={t("emergency.stat.total")}
            value={cases.length}
          />
          <StatCard
            accent="bad"
            icon={<Clock />}
            label={t("emergency.stat.queued")}
            value={counts["queued"] || 0}
          />
          <StatCard
            accent="info"
            icon={<ShieldAlert />}
            label={t("emergency.stat.verifying")}
            value={counts["verifying"] || 0}
          />
          <StatCard
            accent="ok"
            icon={<Activity />}
            label={t("emergency.stat.resolved")}
            value={counts["resolved"] || 0}
          />
        </StatsStrip>

        {/* Filtros */}
        <Toolbar>
          <span
            className="ml-1 mr-1 flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: "var(--ink-soft)" }}
          >
            <Filter className="size-3.5" />
            {t("emergency.statusFilter")}
          </span>
          <Segmented
            /* Sin `flex-wrap`: el riel ya se desplaza por dentro, y partido en
               líneas los siete filtros formaban una columna de 198 px de alto
               con los extremos redondeados colgando. */
            options={STATUS_FILTERS.map((f) => ({
              value: f.value,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  {t(f.key)}
                  <span className="tabular-nums opacity-70">
                    {f.value === "all" ? cases.length : counts[f.value] || 0}
                  </span>
                </span>
              ),
            }))}
            value={status}
            onChange={setStatus}
          />
        </Toolbar>

        {/* List */}
        {/* «Casos de alarma» era el vocabulario de la central receptora. Lo
            que hay aquí son emergencias: SOS de clientes, pánicos de
            vigilantes y —cuando existan— alarmas de panel. */}
        <Section icon={<Siren />} title={t("emergency.section")}>
          {loading ? (
            <SkeletonCards className="sm:grid-cols-1" count={4} />
          ) : sorted.length === 0 ? (
            <EmptyState
              description={
                status === "all"
                  ? t("emergency.empty.none")
                  : t("emergency.empty.filtered")
              }
              icon={<Siren />}
              title={t("emergency.empty.title")}
            />
          ) : (
            <div className="space-y-3">
              {sorted.map((c) => {
                const cat = categoryMeta(c.category);
                const st =
                  STATUS_META[c.status || "queued"] || STATUS_META.queued;
                const live = OPEN_STATUSES.has(c.status || "queued");
                /**
                 * ── DÓNDE PASÓ, SIN INVENTAR UN PANEL ──────────────────────
                 * Esto era `c.panel?.name || "Panel desconocido"`, y un SOS no
                 * tiene panel: los 29 casos que hay en producción son SOS o
                 * pánico, así que el CIEN POR CIEN de la lista decía «Panel
                 * desconocido». En una pantalla de emergencias, escribir el
                 * nombre de un equipo que no existe en lugar del sitio donde
                 * alguien pidió auxilio es lo contrario de informar.
                 *
                 * Ahora el «dónde» es lo que corresponda a su origen: el panel
                 * si vino de un panel, y el puesto y la estación si vino de una
                 * persona. Si no se sabe, no se escribe nada — un hueco es más
                 * honesto que un dato falso.
                 */
                const dePanel = c.source === "alarm_panel" || !!c.panel;
                const lugar = dePanel
                  ? c.panel?.name || null
                  : [c.station?.stationName, c.postSite?.companyName]
                      .filter(Boolean)
                      .join(" · ") || null;
                const accountNumber = dePanel ? c.panel?.accountNumber : null;

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
                    className="cg-focus relative cursor-pointer overflow-hidden p-4"
                    role="button"
                    style={criticalBorder(urgente)}
                    tabIndex={0}
                    onClick={() => navigate(`/alarm/case/${c.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/alarm/case/${c.id}`);
                      }
                    }}
                  >
                    {urgente && <CriticalRail />}
                    {/* `items-start` y no `items-center`: en el teléfono las
                        cuatro etiquetas de la columna central se parten en tres
                        líneas, y centrado verticalmente contra ese bloque alto
                        la píldora de prioridad y la flecha quedaban flotando a
                        media altura, con vacío encima y debajo. Alineadas
                        arriba, la fila vuelve a leerse de una pasada. */}
                    <div className="flex items-start gap-3 sm:items-center">
                      {/* Prioridad. En el teléfono baja a la MISMA fila que las
                          etiquetas: como columna aparte se llevaba 100 px de los
                          282 de la tarjeta y dejaba 138 para cuatro etiquetas,
                          que caían de una en una con un vacío al lado. Juntas,
                          las cinco fluyen y llenan el ancho. */}
                      <div className="hidden sm:block">
                        <PriorityPill p={c.priority} />
                      </div>

                      {/* Center info */}
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="sm:hidden">
                            <PriorityPill p={c.priority} />
                          </span>
                          {/* Incendio, atraco, pánico, intrusión y médica van en
                            `--bad` vengan con la prioridad que vengan: un
                            incendio no deja de serlo porque el panel lo
                            etiquete P3. El resto son clasificación, no
                            severidad, y van neutras. */}
                          <StatusBadge
                            dot={false}
                            tone={categoryTone(c.category)}
                          >
                            <span className="[&_svg]:size-3.5">{cat.icon}</span>
                            {cat.label}
                          </StatusBadge>
                          <StatusBadge dot={live} tone={st.tone}>
                            {st.label}
                          </StatusBadge>
                          <StatusBadge dot={false} tone={sourceTone(c.source)}>
                            {sm.short}
                          </StatusBadge>
                          {c.incidentId ? (
                            /* Escalado a incidente: es una agravación del caso, no
                             un realce de marca. Iba en el acento configurable. */
                            <StatusBadge dot={false} tone="bad">
                              <AlertTriangle className="size-3.5" />
                              {t("emergency.chip.incident")}
                            </StatusBadge>
                          ) : null}
                        </div>

                        <p className="truncate font-medium">
                          {c.title || cat.label}
                        </p>
                        {/* SOS guardado sin señal: no está pasando AHORA. */}
                        <AvisoLlegoTarde
                          compacto
                          className="mt-1"
                          datos={llegadaDe(c, (c as any).payload, marcasSinSenal[String((c as any).incidentId || c.id)])}
                        />

                        <div
                          className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {lugar ? (
                            <span className="inline-flex items-center gap-1">
                              <ShieldAlert className="size-3.5" />
                              {lugar}
                              {accountNumber ? ` · #${accountNumber}` : ""}
                            </span>
                          ) : null}
                          <span>{formatWhen(caseTime(c))}</span>
                        </div>
                      </div>

                      {/* SLA timer — LIVE only while the case is open. Once resolved/
                        closed the clock stops: we show the FINAL handling duration
                        (frozen to closedAt/resolvedAt), never a ticking counter. */}
                      {live ? (
                        <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                          <ClockPill pulsa={sla.alarmante} token={sla.token}>
                            <Clock className="size-3.5" />
                            {elapsedSince(caseTime(c), now)}
                          </ClockPill>
                          <span className="cg-eyebrow">
                            {t("emergency.pill.inQueue")}
                          </span>
                        </div>
                      ) : (
                        <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                          <ClockPill token="neutral">
                            <Clock className="size-3.5" />
                            {elapsedSince(
                              caseTime(c),
                              new Date(
                                c.closedAt ||
                                  c.resolvedAt ||
                                  c.updatedAt ||
                                  caseTime(c),
                              ).getTime(),
                            )}
                          </ClockPill>
                          <span className="cg-eyebrow">
                            {(c.status || "") === "closed"
                              ? t("emergency.pill.duration")
                              : t("emergency.pill.resolvedIn")}
                          </span>
                        </div>
                      )}

                      <ChevronRight
                        className="mt-0.5 size-5 shrink-0 sm:mt-0"
                        style={{ color: "var(--ink-faint)" }}
                      />
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
