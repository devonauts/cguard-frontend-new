import type { Client } from "@/types/client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Search,
  AlertTriangle,
  ShieldCheck,
  Clock,
  Timer,
  CheckCircle2,
  Gauge,
  MapPin,
  Paperclip,
  ListChecks,
  FileText,
  Play,
  ShieldAlert,
} from "lucide-react";

import {
  FIELD_CLS,
  TabTable,
  THead,
  Th,
  Tr,
  Pager,
  TabFooter,
  TabLoading,
  KpiTile,
} from "../_shared/tab-kit";

import useScrollToTopOnMount from "@/hooks/useScrollToTopOnMount";
import { clientService } from "@/lib/api/clientService";
import GoogleMapEmbed from "@/components/GoogleMap/GoogleMapEmbed";
import {
  Section,
  EmptyState,
  StatusBadge,
  GlassPanel,
  SmartImage,
  SearchInput,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { localeActual } from "@/lib/localeActual";
import { useEventoEnVivo } from "@/hooks/useEventoEnVivo";
type BadgeTone = "bad" | "warn" | "info" | "ok";

// ── Shape of GET /client-account/:id/incidents-board (clientAccountIncidentsBoard.ts) ──
type IncidentBucket = "abierto" | "investigacion" | "resuelto";
type IncidentPriority = "alta" | "media" | "baja";
interface IncidentReporter {
  name: string;
  role: string | null;
}
interface IncidentRow {
  id: string;
  code: string;
  date: string;
  createdAt: string;
  title: string;
  description: string;
  actionsTaken: string[];
  causaProbable: string | null;
  tipo: string | null;
  tipoId: string | null;
  sedeName: string;
  sedeId: string | null;
  puestoName: string | null;
  puestoId: string | null;
  reportedBy: IncidentReporter;
  assignedName: string | null;
  priority: IncidentPriority | null;
  estado: IncidentBucket;
  responseMin: number | null;
  resolutionMs: number | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  comments: Array<string | Record<string, unknown>>;
  evidenceCount: number;
  dispatchStatus: string | null;
}
interface IncidentKpis {
  total: number;
  abiertos: number;
  abiertosPct: number;
  investigacion: number;
  investigacionPct: number;
  resueltos: number;
  resueltosPct: number;
  avgResponseMin: number | null;
  metaResponseMin: number;
  avgResolutionDays: number | null;
  metaResolutionDays: number;
  slaPct: number;
  metaSlaPct: number;
}
interface IncidentOption {
  id: string;
  name: string;
}
interface IncidentEvidence {
  id?: string;
  url: string;
  name?: string;
  isVideo?: boolean;
}
interface IncidentBoardData {
  from: string;
  to: string;
  kpis: IncidentKpis;
  sedes: IncidentOption[];
  puestos: IncidentOption[];
  tipos: IncidentOption[];
  total: number;
  page: number;
  perPage: number;
  incidents: IncidentRow[];
  updatedAt: string;
}

const PRIO: Record<string, { label: string; tone: BadgeTone }> = {
  alta: { label: "Alta", tone: "bad" },
  media: { label: "Media", tone: "warn" },
  baja: { label: "Baja", tone: "info" },
};
/** El punto sale del semántico: nunca de un color escrito a mano. */
/* Estas tablas se evalúan al CARGAR el módulo, antes de que el idioma esté
   listo: llamar a t() aquí congelaría el texto en el idioma de arranque para
   toda la sesión. Se guarda la clave y se traduce donde se pinta. */
const ESTADO: Record<
  string,
  { label: string; labelKey?: string; tone: BadgeTone; dot: string }
> = {
  abierto: { label: "Abierto", tone: "bad", dot: "var(--bad)" },
  investigacion: {
    label: "En investigación",
    labelKey: "ui.ClientIncidents.enInvestigacion",
    tone: "warn",
    dot: "var(--warn)",
  },
  resuelto: { label: "Resuelto", tone: "ok", dot: "var(--ok)" },
};
const WS_OPTIONS: { v: string; l: string; lKey?: string }[] = [
  { v: "open", l: "Abierto" },
  {
    v: "inProgress",
    l: "En investigación",
    lKey: "ui.ClientIncidents.enInvestigacion",
  },
  { v: "resolved", l: "Resuelto" },
];

const fmtDT = (iso: string) => {
  const d = new Date(iso);

  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(localeActual(), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};
const fmtDate = (iso: string) => {
  const d = new Date(iso);

  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(localeActual(), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
};
const fmtTime = (iso: string) => {
  const d = new Date(iso);

  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString(localeActual(), {
        hour: "2-digit",
        minute: "2-digit",
      });
};
const resLabel = (ms: number | null) => {
  if (ms == null) return "—";
  const h = ms / 3600000;

  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))} min`;
  if (h < 24) return `${Math.round(h)} h`;

  return `${Math.round((h / 24) * 10) / 10} días`;
};
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function ClientIncidents({ client }: { client: Client }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useScrollToTopOnMount(containerRef);

  const [data, setData] = useState<IncidentBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<IncidentEvidence[]>([]);
  const [tab, setTab] = useState<"detalles" | "evidencia" | "bitacora">(
    "detalles",
  );

  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(
    ymd(new Date(today.getTime() - 30 * 24 * 3600 * 1000)),
  );
  const [to, setTo] = useState(ymd(today));
  const [q, setQ] = useState("");
  const [sedeId, setSedeId] = useState("");
  const [puestoId, setPuestoId] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");
  const [prioridad, setPrioridad] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 10;

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const d = await clientService.getClientIncidentsBoard(client.id, {
        from,
        to,
        q: q.trim() || undefined,
        sedeId: sedeId || undefined,
        puestoId: puestoId || undefined,
        tipo: tipo || undefined,
        estado: estado || undefined,
        prioridad: prioridad || undefined,
        page,
        perPage,
      });

      setData(d);
      if (d?.incidents?.length && !selectedId) setSelectedId(d.incidents[0].id);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };


  /* Incidentes en vivo: el backend avisa con `incident:changed` (ids y hora,
     nunca la fila), así que se vuelve a leer. `quiet` para que no parpadee. */
  useEventoEnVivo(["incident:changed"], () => load(true));
  useEffect(() => {
    const t = setTimeout(() => load(), 250);

    return () => clearTimeout(t);
  }, [from, to, q, sedeId, puestoId, tipo, estado, prioridad, page, client.id]);

  const incidents: IncidentRow[] = data?.incidents || [];
  const kpis: Partial<IncidentKpis> = data?.kpis || {};
  const sedes: IncidentOption[] = data?.sedes || [];
  const puestos: IncidentOption[] = data?.puestos || [];
  const tipos: IncidentOption[] = data?.tipos || [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const selected = incidents.find((i) => i.id === selectedId) || null;
  const fmtUpdated = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString(localeActual(), {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  // Load evidence when selection changes.
  useEffect(() => {
    setEvidence([]);
    setTab("detalles");
    if (!selected || !selected.evidenceCount) return;
    let alive = true;

    clientService
      .getIncidentEvidence(client.id, selected.id)
      .then((items) => {
        if (alive) setEvidence(items);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [selectedId]);

  const changeStatus = async (ws: string) => {
    if (!selected) return;
    try {
      await clientService.updateIncidentStatus(client.id, selected.id, ws);
      toast.success(t("comun.estadoActualizado"));
      await load(true);
    } catch {
      toast.error(t("ui.ClientIncidents.noSePudoActualizar"));
    }
  };

  const resetPage = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setPage(1);
  };

  if (loading && !data) return <TabLoading />;

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Top bar: date range + new incident */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-medium text-muted-foreground">
            Rango
          </span>
          <input
            className={`${FIELD_CLS} w-auto`}
            type="date"
            value={from}
            onChange={(e) => resetPage(setFrom)(e.target.value)}
          />
          <span style={{ color: "var(--ink-faint)" }}>–</span>
          <input
            className={`${FIELD_CLS} w-auto`}
            type="date"
            value={to}
            onChange={(e) => resetPage(setTo)(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant="brand"
          onClick={() => window.location.assign("/dispatch-tickets/new")}
        >
          <AlertTriangle className="mr-1.5 h-4 w-4" />{" "}
          {t("ui.ClientIncidents.nuevoIncidente")}
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <KpiTile
          accent="primary"
          icon={<AlertTriangle />}
          label={t("ui.ClientIncidents.totalDeIncidentes")}
          value={kpis.total ?? 0}
        />
        <KpiTile
          accent={(kpis.abiertos ?? 0) > 0 ? "red" : "slate"}
          icon={<ShieldAlert />}
          label="Incidentes abiertos"
          sub={
            <StatusBadge
              dot={false}
              tone={(kpis.abiertos ?? 0) > 0 ? "bad" : "neutral"}
            >
              {kpis.abiertosPct ?? 0}%
            </StatusBadge>
          }
          value={kpis.abiertos ?? 0}
        />
        <KpiTile
          accent="orange"
          icon={<Search />}
          label={t("ui.ClientIncidents.enInvestigacion", "En investigación")}
          sub={
            <StatusBadge dot={false} tone="warn">
              {kpis.investigacionPct ?? 0}%
            </StatusBadge>
          }
          value={kpis.investigacion ?? 0}
        />
        <KpiTile
          accent="green"
          icon={<CheckCircle2 />}
          label="Resueltos"
          sub={
            <StatusBadge dot={false} tone="ok">
              {kpis.resueltosPct ?? 0}%
            </StatusBadge>
          }
          value={kpis.resueltos ?? 0}
        />
        <KpiTile
          accent="blue"
          bar={
            kpis.avgResponseMin != null
              ? Math.min(
                  100,
                  Math.round(
                    ((kpis.metaResponseMin ?? 15) /
                      Math.max(1, kpis.avgResponseMin)) *
                      100,
                  ),
                )
              : null
          }
          icon={<Clock />}
          label={`Resp. prom. (Meta ${kpis.metaResponseMin ?? 15} min)`}
          value={
            kpis.avgResponseMin != null ? `${kpis.avgResponseMin} min` : "—"
          }
        />
        <KpiTile
          accent="blue"
          bar={
            kpis.avgResolutionDays != null
              ? Math.min(
                  100,
                  Math.round(
                    ((kpis.metaResolutionDays ?? 3) /
                      Math.max(0.1, kpis.avgResolutionDays)) *
                      100,
                  ),
                )
              : null
          }
          icon={<Timer />}
          label={`Resol. prom. (Meta ${kpis.metaResolutionDays ?? 3} días)`}
          value={
            kpis.avgResolutionDays != null
              ? `${kpis.avgResolutionDays} días`
              : "—"
          }
        />
        <KpiTile
          accent={
            (kpis.slaPct ?? 0) >= (kpis.metaSlaPct ?? 95) ? "green" : "orange"
          }
          bar={kpis.slaPct ?? 0}
          icon={<Gauge />}
          label={`Cumplimiento SLA (Meta ${kpis.metaSlaPct ?? 95}%)`}
          value={`${kpis.slaPct ?? 0}%`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.55fr_1fr]">
        {/* LEFT — filters + table */}
        <Section icon={<AlertTriangle />} title="Incidentes">
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <SearchInput
              className="col-span-2 md:col-span-3 xl:col-span-1"
              placeholder={t(
                  "ui.ClientIncidents.buscarPorIdTituloO",
                  "Buscar por ID, título o ubicación",
                )}
              value={q}
              onChange={(v) => resetPage(setQ)(v)}
            />
            <select
              className={FIELD_CLS}
              value={sedeId}
              onChange={(e) => resetPage(setSedeId)(e.target.value)}
            >
              <option value="">{t("comun.sedeTodas")}</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              className={FIELD_CLS}
              value={puestoId}
              onChange={(e) => resetPage(setPuestoId)(e.target.value)}
            >
              <option value="">
                {t("ui.ClientIncidents.estacionTodas", "Estación: Todas")}
              </option>
              {puestos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              className={FIELD_CLS}
              value={tipo}
              onChange={(e) => resetPage(setTipo)(e.target.value)}
            >
              <option value="">{t("comun.tipoTodos")}</option>
              {tipos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              className={FIELD_CLS}
              value={estado}
              onChange={(e) => resetPage(setEstado)(e.target.value)}
            >
              <option value="">{t("comun.estadoTodos")}</option>
              <option value="abierto">{t("comun.abierto")}</option>
              <option value="investigacion">
                {t("ui.ClientIncidents.enInvestigacion", "En investigación")}
              </option>
              <option value="resuelto">Resuelto</option>
            </select>
            <select
              className={FIELD_CLS}
              value={prioridad}
              onChange={(e) => resetPage(setPrioridad)(e.target.value)}
            >
              <option value="">{t("ui.ClientIncidents.prioridadTodas")}</option>
              <option value="alta">{t("comun.alta")}</option>
              <option value="media">{t("comun.media")}</option>
              <option value="baja">{t("comun.baja")}</option>
            </select>
          </div>

          {incidents.length === 0 ? (
            <EmptyState
              description={t("ui.ClientIncidents.noHayIncidentesParaEste")}
              icon={<AlertTriangle />}
              title={t("comun.sinIncidentes")}
            />
          ) : (
            <TabTable>
              <THead>
                <Th>ID</Th>
                <Th>{t("ui.ClientIncidents.fechaHora")}</Th>
                <Th>{t("ui.ClientIncidents.incidente")}</Th>
                <Th>
                  {t("ui.ClientIncidents.sedeEstacion", "Sede / Estación")}
                </Th>
                <Th>{t("ui.ClientIncidents.reportadoPor")}</Th>
                <Th>Prioridad</Th>
                <Th>{t("comun.estado")}</Th>
                <Th>Respuesta</Th>
                <Th>{t("ui.ClientIncidents.resolucion", "Resolución")}</Th>
              </THead>
              <tbody>
                {incidents.map((i) => {
                  const em = ESTADO[i.estado] || ESTADO.abierto;
                  const pm = i.priority ? PRIO[i.priority] : null;
                  const sel = i.id === selectedId;

                  return (
                    <Tr
                      key={i.id}
                      selected={sel}
                      onClick={() => setSelectedId(i.id)}
                    >
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: em.dot }}
                          />
                          <span className="font-medium">{i.code}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="tabular-nums">{fmtDate(i.date)}</div>
                        <div
                          className="text-xs tabular-nums"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {fmtTime(i.date)}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="max-w-[200px] truncate font-medium">
                          {i.title}
                        </div>
                        <div
                          className="max-w-[200px] truncate text-xs"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {i.description}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="max-w-[150px] truncate">
                          {i.sedeName || "—"}
                        </div>
                        <div
                          className="max-w-[150px] truncate text-xs"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {i.puestoName || ""}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="max-w-[130px] truncate">
                          {i.reportedBy?.name || "—"}
                        </div>
                        {i.reportedBy?.role && (
                          <div
                            className="text-xs"
                            style={{ color: "var(--ink-faint)" }}
                          >
                            {i.reportedBy.role}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {pm ? (
                          <StatusBadge dot={false} tone={pm.tone}>
                            {pm.label}
                          </StatusBadge>
                        ) : (
                          <span style={{ color: "var(--ink-faint)" }}>—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <StatusBadge tone={em.tone}>
                          {em.labelKey ? t(em.labelKey, em.label) : em.label}
                        </StatusBadge>
                      </td>
                      <td className="px-2 py-2.5 tabular-nums">
                        {i.responseMin != null ? `${i.responseMin} min` : "—"}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums">
                        {resLabel(i.resolutionMs)}
                      </td>
                    </Tr>
                  );
                })}
              </tbody>
            </TabTable>
          )}

          <Pager
            noun="incidentes"
            page={page}
            pageCount={pageCount}
            perPage={perPage}
            total={total}
            onPage={setPage}
          />
        </Section>

        {/* RIGHT — incident detail */}
        <div>
          {!selected ? (
            <Section
              icon={<FileText />}
              title={t("ui.ClientIncidents.detalleDelIncidente")}
            >
              <EmptyState
                description={t("ui.ClientIncidents.eligeUnIncidenteDeLa")}
                icon={<FileText />}
                title={t("ui.ClientIncidents.seleccionaUnIncidente")}
              />
            </Section>
          ) : (
            <GlassPanel className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">
                      {selected.code}
                    </span>
                    <StatusBadge
                      tone={(ESTADO[selected.estado] || ESTADO.abierto).tone}
                    >
                      {(() => {
                        const e = ESTADO[selected.estado] || ESTADO.abierto;

                        return e.labelKey ? t(e.labelKey, e.label) : e.label;
                      })()}
                    </StatusBadge>
                  </div>
                  <h3 className="mt-1 font-display text-lg font-bold leading-tight">
                    {selected.title}
                  </h3>
                  {selected.description && (
                    <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                      {selected.description}
                    </p>
                  )}
                </div>
                <select
                  className={`${FIELD_CLS} w-auto`}
                  value={
                    selected.estado === "investigacion"
                      ? "inProgress"
                      : selected.estado === "resuelto"
                        ? "resolved"
                        : "open"
                  }
                  onChange={(e) => changeStatus(e.target.value)}
                >
                  {WS_OPTIONS.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.lKey ? t(o.lKey, o.l) : o.l}
                    </option>
                  ))}
                </select>
              </div>

              <div className="glass-sunken grid grid-cols-2 gap-3 break-words p-3 text-sm [&>div]:min-w-0">
                <div>
                  <div className="cg-eyebrow mb-0.5">
                    {t("ui.ClientIncidents.sedePuesto")}
                  </div>
                  <div className="font-medium">{selected.sedeName || "—"}</div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {selected.puestoName || ""}
                  </div>
                </div>
                <div>
                  <div className="cg-eyebrow mb-0.5">Prioridad</div>
                  {selected.priority ? (
                    <StatusBadge
                      dot={false}
                      tone={(PRIO[selected.priority] || PRIO.media).tone}
                    >
                      {(PRIO[selected.priority] || PRIO.media).label}
                    </StatusBadge>
                  ) : (
                    <span style={{ color: "var(--ink-faint)" }}>—</span>
                  )}
                </div>
                <div>
                  <div className="cg-eyebrow mb-0.5">
                    {t("ui.ClientIncidents.fechaHora")}
                  </div>
                  <div className="font-medium tabular-nums">
                    {fmtDT(selected.date)}
                  </div>
                </div>
                <div>
                  <div className="cg-eyebrow mb-0.5">Respuesta</div>
                  <div className="font-medium tabular-nums">
                    {selected.responseMin != null
                      ? `${selected.responseMin} min`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="cg-eyebrow mb-0.5">
                    {t("ui.ClientIncidents.reportadoPor")}
                  </div>
                  <div className="font-medium">
                    {selected.reportedBy?.name || "—"}
                    {selected.reportedBy?.role
                      ? ` (${selected.reportedBy.role})`
                      : ""}
                  </div>
                </div>
                <div>
                  <div className="cg-eyebrow mb-0.5">Asignado a</div>
                  <div className="font-medium">
                    {selected.assignedName || "Sin asignar"}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              {/* La tira se desplaza; ensanchar la ficha entera no es opción. */}
              <div
                className="flex items-center gap-1 overflow-x-auto border-b"
                style={{ borderColor: "var(--hairline)" }}
              >
                {(
                  [
                    ["detalles", "Detalles"],
                    ["evidencia", `Evidencia (${selected.evidenceCount || 0})`],
                    [
                      "bitacora",
                      `Bitácora (${(selected.comments || []).length})`,
                    ],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    className="cg-focus relative shrink-0 whitespace-nowrap px-3 py-2 text-sm font-semibold transition-colors"
                    style={{
                      color:
                        tab === k ? "var(--brand-text)" : "var(--ink-soft)",
                    }}
                    onClick={() => setTab(k)}
                  >
                    {l}
                    {tab === k && (
                      <span
                        className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                        style={{
                          background: "var(--brand)",
                          boxShadow: "0 0 12px 0 var(--brand-glow)",
                        }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {tab === "detalles" && (
                <div className="space-y-4">
                  {selected.description && (
                    <div>
                      <div className="cg-eyebrow mb-1">
                        {t("ui.ClientIncidents.descripcion", "Descripción")}
                      </div>
                      <p
                        className="whitespace-pre-line text-sm"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {selected.description}
                      </p>
                    </div>
                  )}
                  {selected.causaProbable && (
                    <div>
                      <div className="cg-eyebrow mb-1">Causa probable</div>
                      <p
                        className="text-sm"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {selected.causaProbable}
                      </p>
                    </div>
                  )}
                  {selected.actionsTaken?.length > 0 && (
                    <div>
                      <div className="cg-eyebrow mb-1">Acciones tomadas</div>
                      <ul
                        className="list-disc space-y-0.5 pl-5 text-sm"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {selected.actionsTaken.map((a: string, i: number) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Number.isFinite(selected.lat) &&
                  Number.isFinite(selected.lng) ? (
                    <div>
                      <div
                        className="overflow-hidden rounded-xl border"
                        style={{ height: 180, borderColor: "var(--hairline)" }}
                      >
                        <GoogleMapEmbed
                          lat={selected.lat!}
                          lng={selected.lng!}
                          markers={[
                            {
                              id: selected.id,
                              lat: selected.lat!,
                              lng: selected.lng!,
                              label: selected.title,
                              role: "crit",
                            },
                          ]}
                          zoom={16}
                        />
                      </div>
                      <div
                        className="mt-1.5 flex items-center justify-between text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />{" "}
                          {selected.location || "Ubicación"}
                        </span>
                        <span className="tabular-nums">
                          {selected.lat!.toFixed(4)}, {selected.lng!.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  ) : selected.location ? (
                    <div
                      className="text-sm"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      <MapPin className="mr-1 inline h-3.5 w-3.5" />
                      {selected.location}
                    </div>
                  ) : null}
                </div>
              )}

              {tab === "evidencia" && (
                <div>
                  {evidence.length === 0 ? (
                    <EmptyState
                      description={
                        selected.evidenceCount
                          ? "Cargando…"
                          : "Este incidente no tiene evidencia adjunta."
                      }
                      icon={<Paperclip />}
                      title={t("ui.ClientIncidents.sinEvidencia")}
                    />
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {evidence.map((e) => (
                        <a
                          key={e.id || e.url}
                          className="cg-focus group relative aspect-video overflow-hidden rounded-lg border"
                          href={e.url}
                          rel="noreferrer"
                          style={{
                            background: "var(--glass-sunken)",
                            borderColor: "var(--hairline)",
                          }}
                          target="_blank"
                        >
                          {e.isVideo ? (
                            <div
                              className="flex h-full w-full items-center justify-center"
                              style={{
                                background: "var(--glass-sunken)",
                                color: "var(--ink)",
                              }}
                            >
                              <Play className="h-6 w-6" />
                            </div>
                          ) : (
                            <SmartImage
                              alt={e.name}
                              className="h-full w-full"
                              src={e.url}
                            />
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "bitacora" && (
                <div>
                  {(selected.comments || []).length === 0 ? (
                    <EmptyState
                      description={t(
                        "ui.ClientIncidents.noHayRegistrosEnLa",
                        "No hay registros en la bitácora de este incidente.",
                      )}
                      icon={<ListChecks />}
                      title={t(
                        "ui.ClientIncidents.sinBitacora",
                        "Sin bitácora",
                      )}
                    />
                  ) : (
                    <div className="space-y-2">
                      {(selected.comments || []).map((c: any, i: number) => {
                        const text =
                          typeof c === "string"
                            ? c
                            : c?.text ||
                              c?.message ||
                              c?.note ||
                              c?.comment ||
                              JSON.stringify(c);
                        const at =
                          typeof c === "object"
                            ? c?.createdAt || c?.at || c?.date
                            : null;

                        return (
                          <div
                            key={i}
                            className="rounded-lg border p-2.5 text-sm"
                            style={{ borderColor: "var(--hairline)" }}
                          >
                            <p className="text-foreground">{text}</p>
                            {at && (
                              <p
                                className="mt-0.5 text-xs"
                                style={{ color: "var(--ink-faint)" }}
                              >
                                {fmtDT(at)}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </GlassPanel>
          )}
        </div>
      </div>

      <TabFooter
        icon={<ShieldCheck />}
        note="Los tiempos de respuesta se calculan desde el reporte hasta el despacho al supervisor."
        updatedAt={fmtUpdated}
        onRefresh={() => load()}
      />
    </div>
  );
}
