import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle,
  Clock,
  Hourglass,
  Loader2,
  Plus,
  ShieldAlert,
  UserCheck,
  XCircle,
} from "lucide-react";

import { usePuede } from "@/hooks/usePuede";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  EmptyState,
  InfoNote,
  MetricTile,
  PageContainer,
  PageHeader,
  Pagination,
  SearchInput,
  Section,
  Segmented,
  StatsStrip,
  StatusBadge,
  Toolbar,
} from "@/components/kit";
import shiftExchangeRequestService, {
  type ShiftExchangeRecord,
  type SwapChecks,
  type SwapFinding,
  type SwapShift,
  type SwapStatus,
} from "@/lib/api/shiftExchangeRequestService";
import { securityGuardService } from "@/lib/api/securityGuardService";
import shiftService from "@/lib/api/shiftService";
import { stationService } from "@/lib/api/stationService";
import { getTenantTimezone } from "@/utils/tenantLocation";
import { localeActual } from "@/lib/localeActual";
import { listarTodo } from "@/lib/listarCompleto";

/* ── formatting ─────────────────────────────────────────────────────────── */

function fecha(iso?: string | null, conAnio = false) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(localeActual(), {
    weekday: conAnio ? undefined : "short",
    day: "2-digit",
    month: "short",
    year: conAnio ? "numeric" : undefined,
    timeZone: getTenantTimezone(),
  });
}

function hora(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(localeActual(), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: getTenantTimezone(),
  });
}

const TONO: Record<SwapStatus, string> = {
  pending_peer: "info",
  pending_approval: "warn",
  approved: "ok",
  rejected: "bad",
  declined: "neutral",
  cancelled: "neutral",
  expired: "neutral",
};

type Filtro = "open" | "pending_approval" | "pending_peer" | "approved" | "closed" | "all";

const FILTRO_A_ESTADOS: Record<Filtro, string | undefined> = {
  open: "open",
  pending_approval: "pending_approval",
  pending_peer: "pending_peer",
  approved: "approved",
  closed: "rejected,declined,cancelled,expired",
  all: undefined,
};

interface Persona {
  userId: string;
  fullName: string;
}

/* ── small pieces ───────────────────────────────────────────────────────── */

function TurnoCelda({ s }: { s: SwapShift | null }) {
  const { t } = useTranslation();

  if (!s)
    return (
      <span style={{ color: "var(--ink-faint)" }}>
        {t("ui.ShiftExchange.sinTurnoACambio", "Sin turno a cambio")}
      </span>
    );

  return (
    <span className="block">
      <span className="block text-sm tabular-nums">
        {fecha(s.start)} · {hora(s.start)}–{hora(s.end)}
      </span>
      <span className="block text-xs" style={{ color: "var(--ink-soft)" }}>
        {[s.stationName, s.postSiteName].filter(Boolean).join(" · ") || "—"}
      </span>
    </span>
  );
}

function useTextoDeRegla(rec: ShiftExchangeRecord | null) {
  const { t } = useTranslation();

  return useCallback(
    (f: SwapFinding) => {
      const nombre =
        f.guardId && rec
          ? f.guardId === rec.fromGuardId
            ? rec.fromGuard?.name
            : f.guardId === rec.toGuardId
              ? rec.toGuard?.name
              : null
          : null;

      return t(`ui.ShiftExchange.regla.${f.code}`, {
        defaultValue: f.code,
        name: nombre || t("comun.vigilante", "Vigilante"),
        hours: f.params?.hours,
        required: f.params?.required,
        max: f.params?.max,
        day: f.params?.day,
        from: f.params?.from,
        to: f.params?.to,
      });
    },
    [rec, t],
  );
}

function ListaDeReglas({
  checks,
  rec,
}: {
  checks: SwapChecks | null;
  rec: ShiftExchangeRecord;
}) {
  const { t } = useTranslation();
  const texto = useTextoDeRegla(rec);

  if (!checks) return null;
  if (!checks.blocks.length && !checks.warnings.length)
    return (
      <InfoNote tone="ok" icon={<CheckCircle />}>
        {t("ui.ShiftExchange.cumpleTodo", "Cumple todas las reglas de la empresa.")}
      </InfoNote>
    );

  return (
    <div className="grid gap-2">
      {checks.blocks.length > 0 && (
        <InfoNote
          tone="bad"
          icon={<ShieldAlert />}
          title={t("ui.ShiftExchange.noSePuede", "No se puede hacer")}
        >
          <ul className="list-disc pl-4">
            {checks.blocks.map((b, i) => (
              <li key={`b${i}`}>{texto(b)}</li>
            ))}
          </ul>
        </InfoNote>
      )}
      {checks.warnings.length > 0 && (
        <InfoNote
          tone="warn"
          icon={<AlertTriangle />}
          title={t("ui.ShiftExchange.revisaAntes", "Revisa antes de aprobar")}
        >
          <ul className="list-disc pl-4">
            {checks.warnings.map((w, i) => (
              <li key={`w${i}`}>{texto(w)}</li>
            ))}
          </ul>
        </InfoNote>
      )}
    </div>
  );
}

/** The server's 409 carries `requirements`: show them, not a generic error. */
function mensajeDeError(e: any, t: any, texto: (f: SwapFinding) => string) {
  const d = e?.response?.data || {};
  const reqs: SwapFinding[] = Array.isArray(d.requirements) ? d.requirements : [];

  if (reqs.length) return `${d.message || ""} ${reqs.map(texto).join(" · ")}`.trim();

  return d.message || t("ui.ShiftExchange.errorGenerico", "Algo salió mal. Inténtalo de nuevo.");
}

/* ── page ───────────────────────────────────────────────────────────────── */

export default function ShiftExchange() {
  const { t } = useTranslation();
  const decidir = usePuede("intercambio.decidir");

  const [records, setRecords] = useState<ShiftExchangeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("open");
  const [buscar, setBuscar] = useState("");
  const [estacion, setEstacion] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [estaciones, setEstaciones] = useState<{ id: string; name: string }[]>([]);

  const [abierta, setAbierta] = useState<ShiftExchangeRecord | null>(null);
  const [nueva, setNueva] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, unknown> = {};
      const st = FILTRO_A_ESTADOS[filtro];

      if (st) params["filter[status]"] = st;
      if (estacion) params["filter[stationId]"] = estacion;
      if (desde) params["filter[dateFrom]"] = desde;
      if (hasta) params["filter[dateTo]"] = hasta;
      // Every request that matches, page by page (it used to stop at 500).
      const { rows } = await listarTodo(({ limit, offset }) => shiftExchangeRequestService.list({ ...params, limit, offset }));

      setRecords(rows || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filtro, estacion, desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    (async () => {
      try {
        const r: any = await listarTodo(({ limit, offset }) => stationService.list({} as any, { limit, offset } as any));
        const filas: any[] = Array.isArray(r) ? r : r?.rows || [];

        setEstaciones(
          filas
            .map((s) => ({ id: String(s.id), name: String(s.stationName || s.name || "") }))
            .filter((s) => s.name)
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      } catch {
        /* the station filter is optional */
      }
    })();
  }, []);

  const q = buscar.toLowerCase().trim();
  const filtradas = useMemo(
    () =>
      records.filter(
        (r) =>
          !q ||
          (r.fromGuard?.name || "").toLowerCase().includes(q) ||
          (r.toGuard?.name || "").toLowerCase().includes(q),
      ),
    [records, q],
  );
  const pagina = filtradas.slice((page - 1) * pageSize, page * pageSize);

  const cuenta = (s: SwapStatus) => records.filter((r) => r.status === s).length;

  const actualizar = (r: ShiftExchangeRecord) => {
    setRecords((prev) => prev.map((x) => (x.id === r.id ? r : x)));
    setAbierta((a) => (a && a.id === r.id ? r : a));
  };

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<ArrowLeftRight />}
          title={t("ui.ShiftExchange.intercambioDeTurnos", "Intercambio de turno")}
          subtitle={t(
            "ui.ShiftExchange.subtitulo",
            "Un vigilante cambia o cede un turno a un compañero. El compañero acepta y la oficina aprueba; los dos turnos se mueven a la vez.",
          )}
          actions={
            <Button variant="brand" onClick={() => setNueva(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t("ui.ShiftExchange.nuevaSolicitud", "Nueva solicitud")}
            </Button>
          }
        />

        <StatsStrip className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricTile
            icon={<Hourglass />}
            label={t("ui.ShiftExchange.estado.pending_approval", "Espera aprobación")}
            value={cuenta("pending_approval")}
            hint={t("ui.ShiftExchange.kpiAprobacion", "Los dos aceptaron; falta la oficina")}
          />
          <MetricTile
            icon={<Clock />}
            label={t("ui.ShiftExchange.estado.pending_peer", "Espera al compañero")}
            value={cuenta("pending_peer")}
            hint={t("ui.ShiftExchange.kpiCompanero", "Pedidas, sin respuesta del compañero")}
          />
          <MetricTile
            icon={<CheckCircle />}
            label={t("ui.ShiftExchange.aprobadas", "Aprobadas")}
            value={cuenta("approved")}
            hint={t("ui.ShiftExchange.kpiEnLaLista", "En la lista de abajo")}
          />
          <MetricTile
            icon={<XCircle />}
            label={t("ui.ShiftExchange.cerradasSinCambio", "Cerradas sin cambio")}
            value={cuenta("rejected") + cuenta("declined") + cuenta("cancelled") + cuenta("expired")}
            hint={t("ui.ShiftExchange.kpiCerradas", "Rechazadas, canceladas o vencidas")}
          />
        </StatsStrip>

        <Toolbar className="flex-wrap justify-between gap-3">
          <Segmented<Filtro>
            value={filtro}
            onChange={(v) => {
              setFiltro(v);
              setPage(1);
            }}
            options={[
              { value: "open", label: t("ui.ShiftExchange.filtro.open", "Abiertas") },
              { value: "pending_approval", label: t("ui.ShiftExchange.filtro.pending_approval", "Por aprobar") },
              { value: "pending_peer", label: t("ui.ShiftExchange.filtro.pending_peer", "Esperan compañero") },
              { value: "approved", label: t("ui.ShiftExchange.filtro.approved", "Aprobadas") },
              { value: "closed", label: t("ui.ShiftExchange.filtro.closed", "Cerradas") },
              { value: "all", label: t("ui.ShiftExchange.todos", "Todos") },
            ]}
          />
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
            <SearchInput
              className="w-full md:w-60"
              placeholder={t("comun.buscarVigilante")}
              value={buscar}
              onChange={(v) => {
                setBuscar(v);
                setPage(1);
              }}
            />
            <Select value={estacion || "__all__"} onValueChange={(v) => setEstacion(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder={t("ui.ShiftExchange.todasLasEstaciones", "Todas las estaciones")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("ui.ShiftExchange.todasLasEstaciones", "Todas las estaciones")}</SelectItem>
                {estaciones.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1 text-xs" style={{ color: "var(--ink-soft)" }}>
              {t("ui.ShiftExchange.turnoDesde", "Turno desde")}
              <input className="cg-input cg-focus px-2 py-1.5 text-sm" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </label>
            <label className="flex items-center gap-1 text-xs" style={{ color: "var(--ink-soft)" }}>
              {t("ui.ShiftExchange.hasta", "hasta")}
              <input className="cg-input cg-focus px-2 py-1.5 text-sm" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </label>
          </div>
        </Toolbar>

        <Section
          contentClassName="overflow-x-auto -mx-1"
          icon={<ArrowLeftRight />}
          title={t("ui.ShiftExchange.solicitudesDeIntercambio", "Solicitudes de intercambio")}
        >
          <Table className="cg-tabla-fichas">
            <TableHeader style={{ background: "var(--glass-sunken)" }}>
              <TableRow>
                <TableHead className="cg-eyebrow">{t("ui.ShiftExchange.pide", "Pide")}</TableHead>
                <TableHead className="cg-eyebrow">{t("ui.ShiftExchange.entrega", "Entrega")}</TableHead>
                <TableHead className="w-6" />
                <TableHead className="cg-eyebrow">{t("ui.ShiftExchange.recibe", "Con")}</TableHead>
                <TableHead className="cg-eyebrow">{t("ui.ShiftExchange.aCambio", "A cambio")}</TableHead>
                <TableHead className="cg-eyebrow">{t("comun.estado")}</TableHead>
                <TableHead className="cg-eyebrow">{t("ui.ShiftExchange.reglas", "Reglas")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell className="h-[200px] text-center" colSpan={7}>
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" style={{ color: "var(--ink-faint)" }} />
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell className="h-[240px] text-center" colSpan={7}>
                    <EmptyState
                      className="border-0 py-2"
                      description={t("ui.ShiftExchange.noCargo", "No se pudo cargar la lista. Vuelve a intentarlo.")}
                      icon={<AlertTriangle />}
                      title={t("ui.ShiftExchange.errorAlCargar", "No se pudo cargar")}
                    />
                  </TableCell>
                </TableRow>
              ) : pagina.length === 0 ? (
                <TableRow>
                  <TableCell className="h-[300px] text-center" colSpan={7}>
                    <EmptyState
                      className="border-0 py-2"
                      description={t(
                        "ui.ShiftExchange.vacio",
                        "Los vigilantes piden cambios desde su app (Mis turnos › Cambiar turno). También puedes registrar uno con «Nueva solicitud».",
                      )}
                      icon={<ArrowLeftRight />}
                      title={t("ui.ShiftExchange.vacioTitulo", "No hay solicitudes aquí")}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                pagina.map((r) => {
                  const bloq = r.checks?.blocks?.length || 0;
                  const avis = r.checks?.warnings?.length || 0;
                  const vivo = r.status === "pending_peer" || r.status === "pending_approval";

                  return (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setAbierta(r)}>
                      <TableCell className="font-medium" data-rotulo={t("ui.ShiftExchange.pide", "Pide")} data-titulo>
                        {r.fromGuard?.name || "—"}
                        <span className="block text-xs font-normal" style={{ color: "var(--ink-faint)" }}>
                          {fecha(r.requestDate, true)}
                        </span>
                      </TableCell>
                      <TableCell data-rotulo={t("ui.ShiftExchange.entrega", "Entrega")}>
                        <TurnoCelda s={r.fromShift} />
                      </TableCell>
                      <TableCell>
                        <ArrowLeftRight className="h-4 w-4" style={{ color: "var(--ink-faint)" }} />
                      </TableCell>
                      <TableCell data-rotulo={t("ui.ShiftExchange.recibe", "Con")}>
                        {r.toGuard?.name || (
                          <span style={{ color: "var(--ink-soft)" }}>
                            {t("ui.ShiftExchange.ofertaAbierta", "Oferta abierta")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell data-rotulo={t("ui.ShiftExchange.aCambio", "A cambio")}>
                        <TurnoCelda s={r.toShift} />
                      </TableCell>
                      <TableCell data-rotulo={t("comun.estado")}>
                        <StatusBadge tone={TONO[r.status] || "neutral"}>
                          {t(`ui.ShiftExchange.estado.${r.status}`, r.status)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell data-rotulo={t("ui.ShiftExchange.reglas", "Reglas")}>
                        {vivo && bloq > 0 ? (
                          <StatusBadge tone="bad">
                            {t("ui.ShiftExchange.nBloqueos", { defaultValue: "{{n}} impide", n: bloq })}
                          </StatusBadge>
                        ) : vivo && avis > 0 ? (
                          <StatusBadge tone="warn">
                            {t("ui.ShiftExchange.nAvisos", { defaultValue: "{{n}} aviso", n: avis })}
                          </StatusBadge>
                        ) : vivo ? (
                          <StatusBadge tone="ok">{t("ui.ShiftExchange.cumple", "Cumple")}</StatusBadge>
                        ) : (
                          <span style={{ color: "var(--ink-faint)" }}>—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Section>

        <Pagination
          numbered
          page={page}
          pageSize={pageSize}
          total={filtradas.length}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </PageContainer>

      <Detalle
        puedeDecidir={decidir.puede}
        porQueNo={decidir.porQueNo}
        rec={abierta}
        onActualizada={actualizar}
        onClose={() => setAbierta(null)}
      />
      <NuevaSolicitud
        open={nueva}
        puedeDecidir={decidir.puede}
        onClose={() => setNueva(false)}
        onCreada={() => {
          setNueva(false);
          cargar();
        }}
      />
    </AppLayout>
  );
}

/* ── detail sheet: the approver's screen ────────────────────────────────── */

function Detalle({
  rec,
  onClose,
  onActualizada,
  puedeDecidir,
  porQueNo,
}: {
  rec: ShiftExchangeRecord | null;
  onClose: () => void;
  onActualizada: (r: ShiftExchangeRecord) => void;
  puedeDecidir: boolean;
  porQueNo?: string;
}) {
  const { t } = useTranslation();
  const texto = useTextoDeRegla(rec);
  const [checks, setChecks] = useState<SwapChecks | null>(null);
  const [nota, setNota] = useState("");
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const vivo = !!rec && (rec.status === "pending_peer" || rec.status === "pending_approval");

  useEffect(() => {
    setNota("");
    setChecks(rec?.checks || null);
    if (!rec || !(rec.status === "pending_peer" || rec.status === "pending_approval")) return;
    let vigente = true;

    // The rules evaluated NOW: a leave approved or a shift moved since the request.
    shiftExchangeRequestService
      .checks(rec.id)
      .then((c) => vigente && setChecks(c))
      .catch(() => undefined);

    return () => {
      vigente = false;
    };
  }, [rec?.id, rec?.status]);

  if (!rec) return null;

  const hacer = async (que: string, fn: () => Promise<ShiftExchangeRecord>, ok: string) => {
    setTrabajando(que);
    try {
      const r = await fn();

      onActualizada(r);
      toast.success(ok);
    } catch (e: any) {
      toast.error(mensajeDeError(e, t, texto));
      if (Array.isArray(e?.response?.data?.requirements)) {
        setChecks({ blocks: e.response.data.requirements, warnings: checks?.warnings || [] });
      }
    } finally {
      setTrabajando(null);
    }
  };

  const bloqueado = (checks?.blocks?.length || 0) > 0;
  const linea = (label: string, cuando?: string | null, quien?: string | null) =>
    cuando ? (
      <li className="flex justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="tabular-nums" style={{ color: "var(--ink-soft)" }}>
          {fecha(cuando, true)} {hora(cuando)}
          {quien ? ` · ${quien}` : ""}
        </span>
      </li>
    ) : null;

  return (
    <Sheet open={!!rec} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:w-[560px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" />
            {rec.kind === "swap"
              ? t("ui.ShiftExchange.tipoCambio", "Cambio de turno")
              : t("ui.ShiftExchange.tipoCesion", "Cesión de turno")}
            <StatusBadge tone={TONO[rec.status] || "neutral"}>
              {t(`ui.ShiftExchange.estado.${rec.status}`, rec.status)}
            </StatusBadge>
          </SheetTitle>
        </SheetHeader>

        <div className="grid gap-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="cg-card p-3">
              <div className="cg-eyebrow mb-1">{rec.fromGuard?.name || "—"}</div>
              <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                {t("ui.ShiftExchange.entregaEste", "Entrega este turno")}
              </div>
              <TurnoCelda s={rec.fromShift} />
            </div>
            <div className="cg-card p-3">
              <div className="cg-eyebrow mb-1">
                {rec.toGuard?.name || t("ui.ShiftExchange.ofertaAbierta", "Oferta abierta")}
              </div>
              <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                {rec.toShift
                  ? t("ui.ShiftExchange.entregaEste", "Entrega este turno")
                  : t("ui.ShiftExchange.soloRecibe", "Solo recibe el turno")}
              </div>
              <TurnoCelda s={rec.toShift} />
            </div>
          </div>

          {rec.notes && (
            <div>
              <Label>{t("comun.notas")}</Label>
              <p className="mt-1 text-sm">{rec.notes}</p>
            </div>
          )}

          {vivo && <ListaDeReglas checks={checks} rec={rec} />}

          <ul className="grid gap-1">
            {linea(t("ui.ShiftExchange.linea.pedida", "Pedida"), rec.requestDate, rec.createdBy?.name)}
            {linea(
              rec.status === "declined"
                ? t("ui.ShiftExchange.linea.rechazoCompanero", "El compañero no aceptó")
                : t("ui.ShiftExchange.linea.aceptada", "Aceptada por el compañero"),
              rec.peerRespondedAt,
            )}
            {linea(
              rec.status === "approved"
                ? t("ui.ShiftExchange.linea.aprobada", "Aprobada y hecha")
                : t("ui.ShiftExchange.linea.decidida", "Decidida"),
              rec.decidedAt || rec.executedAt,
              rec.decidedBy?.name || (rec.status === "approved" ? t("ui.ShiftExchange.automatica", "automática") : null),
            )}
            {rec.status === "expired" &&
              linea(t("ui.ShiftExchange.linea.vencio", "Venció: el turno empezó"), rec.expiresAt)}
          </ul>
          {rec.decisionNote && (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              “{rec.decisionNote}”
            </p>
          )}

          {vivo && puedeDecidir && (
            <div className="grid gap-2">
              <Label>{t("ui.ShiftExchange.notaDeDecision", "Nota para los vigilantes (opcional)")}</Label>
              <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
            </div>
          )}
        </div>

        {vivo && (
          <SheetFooter className="flex flex-wrap gap-2">
            {rec.status === "pending_peer" && rec.toGuardId && puedeDecidir && (
              <Button
                disabled={!!trabajando}
                variant="outline"
                onClick={() =>
                  hacer("accept", () => shiftExchangeRequestService.act(rec.id, "accept"), t("ui.ShiftExchange.okAceptada", "Registrado: el compañero aceptó."))
                }
              >
                {trabajando === "accept" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
                {t("ui.ShiftExchange.registrarAcepto", "Registrar que aceptó")}
              </Button>
            )}
            {puedeDecidir && (
              <Button
                disabled={!!trabajando}
                variant="outline"
                onClick={() =>
                  hacer("reject", () => shiftExchangeRequestService.updateStatus(rec.id, "rejected", nota), t("ui.ShiftExchange.okRechazada", "Solicitud rechazada."))
                }
              >
                {trabajando === "reject" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                {t("ui.ShiftExchange.rechazar", "Rechazar")}
              </Button>
            )}
            {puedeDecidir ? (
              <Button
                disabled={!!trabajando || rec.status !== "pending_approval" || bloqueado}
                title={
                  rec.status !== "pending_approval"
                    ? t("ui.ShiftExchange.faltaCompanero", "Falta que el compañero acepte.")
                    : bloqueado
                      ? t("ui.ShiftExchange.hayBloqueos", "Hay reglas que impiden el cambio.")
                      : undefined
                }
                variant="brand"
                onClick={() =>
                  hacer("approve", () => shiftExchangeRequestService.updateStatus(rec.id, "approved", nota), t("ui.ShiftExchange.okAprobada", "Aprobado: los dos turnos ya cambiaron."))
                }
              >
                {trabajando === "approve" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                {t("ui.ShiftExchange.aprobarYCambiar", "Aprobar y cambiar")}
              </Button>
            ) : (
              <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {porQueNo || t("ui.ShiftExchange.sinPermiso", "Solo quien programa turnos puede aprobar.")}
              </p>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ── new request on behalf of a guard ───────────────────────────────────── */

function NuevaSolicitud({
  open,
  onClose,
  onCreada,
  puedeDecidir,
}: {
  open: boolean;
  onClose: () => void;
  onCreada: () => void;
  puedeDecidir: boolean;
}) {
  const { t } = useTranslation();
  const texto = useTextoDeRegla(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [tipo, setTipo] = useState<"swap" | "giveaway">("swap");
  const [de, setDe] = useState("");
  const [con, setCon] = useState("");
  const [turnosDe, setTurnosDe] = useState<any[]>([]);
  const [turnosCon, setTurnosCon] = useState<any[]>([]);
  const [turnoDe, setTurnoDe] = useState("");
  const [turnoCon, setTurnoCon] = useState("");
  const [nota, setNota] = useState("");
  const [acordado, setAcordado] = useState(true);
  const [aprobarYa, setAprobarYa] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTipo("swap");
    setDe("");
    setCon("");
    setTurnoDe("");
    setTurnoCon("");
    setNota("");
    setAcordado(true);
    setAprobarYa(false);
    if (personas.length) return;
    (async () => {
      try {
        const resp: any = await listarTodo(({ limit, offset }) => securityGuardService.list({ limit, offset }));
        const items: any[] = Array.isArray(resp) ? resp : resp.rows ?? [];

        setPersonas(
          items
            .map((it) => {
              const userId = it.guard?.id ?? it.guardId ?? null;
              const fullName =
                it.fullName ??
                it.guard?.fullName ??
                [it.guard?.firstName, it.guard?.lastName].filter(Boolean).join(" ");

              return userId ? { userId: String(userId), fullName: String(fullName || "") } : null;
            })
            .filter(Boolean)
            .sort((a: any, b: any) => a.fullName.localeCompare(b.fullName)) as Persona[],
        );
      } catch {
        /* the list stays empty; the sheet says so */
      }
    })();
  }, [open]);

  const turnosFuturos = async (userId: string) => {
    const ahora = new Date();
    const fin = new Date(ahora.getTime() + 45 * 86400000);
    const r: any = await shiftService.list({
      "filter[guard]": userId,
      "filter[startTimeRange]": [ahora.toISOString(), fin.toISOString()],
      limit: 200,
      orderBy: "startTime_ASC",
    });
    const filas: any[] = Array.isArray(r) ? r : r?.rows || [];

    return filas.filter((s) => !s.status || s.status === "planned");
  };

  useEffect(() => {
    setTurnoDe("");
    setTurnosDe([]);
    if (de) turnosFuturos(de).then(setTurnosDe).catch(() => setTurnosDe([]));
  }, [de]);

  useEffect(() => {
    setTurnoCon("");
    setTurnosCon([]);
    if (con && tipo === "swap") turnosFuturos(con).then(setTurnosCon).catch(() => setTurnosCon([]));
  }, [con, tipo]);

  const etiqueta = (s: any) =>
    `${fecha(s.startTime)} · ${hora(s.startTime)}–${hora(s.endTime)} · ${s.station?.stationName || "—"}`;

  const listo = !!de && !!turnoDe && !!con && (tipo === "giveaway" || !!turnoCon);

  const enviar = async () => {
    setGuardando(true);
    try {
      await shiftExchangeRequestService.create({
        fromShiftId: turnoDe,
        toShiftId: tipo === "swap" ? turnoCon : undefined,
        toGuardId: con,
        notes: nota || undefined,
        peerConfirmed: acordado,
        approveNow: acordado && aprobarYa && puedeDecidir,
      });
      toast.success(
        acordado && aprobarYa && puedeDecidir
          ? t("ui.ShiftExchange.okAprobada", "Aprobado: los dos turnos ya cambiaron.")
          : t("ui.ShiftExchange.okCreada", "Solicitud registrada."),
      );
      onCreada();
    } catch (e: any) {
      toast.error(mensajeDeError(e, t, texto));
    } finally {
      setGuardando(false);
    }
  };

  const selector = (valor: string, setValor: (v: string) => void, opciones: { id: string; label: string }[], vacio: string) => (
    <Select value={valor} onValueChange={setValor}>
      <SelectTrigger>
        <SelectValue placeholder={vacio} />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>{t("ui.ShiftExchange.nuevaSolicitudDeIntercambio", "Nueva solicitud de intercambio")}</SheetTitle>
        </SheetHeader>
        <div className="grid gap-5 py-5">
          <Segmented<"swap" | "giveaway">
            value={tipo}
            onChange={setTipo}
            options={[
              { value: "swap", label: t("ui.ShiftExchange.tipoCambio", "Cambio de turno") },
              { value: "giveaway", label: t("ui.ShiftExchange.tipoCesion", "Cesión de turno") },
            ]}
          />
          <div className="grid gap-2">
            <Label>{t("ui.ShiftExchange.vigilanteSolicitante", "Vigilante que pide*")}</Label>
            {selector(de, setDe, personas.map((p) => ({ id: p.userId, label: p.fullName })), t("kit.select.placeholder"))}
          </div>
          {de && (
            <div className="grid gap-2">
              <Label>{t("ui.ShiftExchange.turnoQueEntrega", "Turno que entrega*")}</Label>
              {turnosDe.length
                ? selector(turnoDe, setTurnoDe, turnosDe.map((s) => ({ id: s.id, label: etiqueta(s) })), t("kit.select.placeholder"))
                : <p className="text-xs" style={{ color: "var(--ink-faint)" }}>{t("ui.ShiftExchange.sinTurnos", "No tiene turnos en los próximos 45 días.")}</p>}
            </div>
          )}
          <div className="grid gap-2">
            <Label>{t("ui.ShiftExchange.companero", "Compañero*")}</Label>
            {selector(con, setCon, personas.filter((p) => p.userId !== de).map((p) => ({ id: p.userId, label: p.fullName })), t("kit.select.placeholder"))}
          </div>
          {tipo === "swap" && con && (
            <div className="grid gap-2">
              <Label>{t("ui.ShiftExchange.turnoQueRecibe", "Turno del compañero que pasa al solicitante*")}</Label>
              {turnosCon.length
                ? selector(turnoCon, setTurnoCon, turnosCon.map((s) => ({ id: s.id, label: etiqueta(s) })), t("kit.select.placeholder"))
                : <p className="text-xs" style={{ color: "var(--ink-faint)" }}>{t("ui.ShiftExchange.sinTurnos", "No tiene turnos en los próximos 45 días.")}</p>}
            </div>
          )}
          <div className="grid gap-2">
            <Label>{t("comun.notas")}</Label>
            <Textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder={t("ui.ShiftExchange.describeLosDetallesDelIntercambio")} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={acordado} onCheckedChange={(v) => setAcordado(!!v)} />
            <span>
              {t("ui.ShiftExchange.yaAcordaron", "Los dos ya están de acuerdo")}
              <span className="block text-xs" style={{ color: "var(--ink-faint)" }}>
                {t("ui.ShiftExchange.yaAcordaronHint", "Si no lo marcas, el compañero recibe la propuesta en su app y debe aceptarla.")}
              </span>
            </span>
          </label>
          {puedeDecidir && acordado && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={aprobarYa} onCheckedChange={(v) => setAprobarYa(!!v)} />
              <span>{t("ui.ShiftExchange.aprobarAhora", "Aprobar ahora (los turnos cambian al guardar)")}</span>
            </label>
          )}
        </div>
        <SheetFooter>
          <Button className="w-full sm:w-auto" disabled={!listo || guardando} variant="brand" onClick={enviar}>
            {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("ui.ShiftExchange.crearSolicitud", "Crear solicitud")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
