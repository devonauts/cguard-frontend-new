import { useEffect, useState, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import attendanceService from "@/lib/api/attendanceService";
import { EXCEPTION_LABEL, SEVERITY_META, EXC_STATUS_META, fmtDateTime } from "./shared";
import { PageContainer, PageHeader, Section, EmptyState, SkeletonCards, StatusBadge, Toolbar } from "@/components/kit";
import { AlertTriangle, Filter, ListChecks, PartyPopper, CheckCircle2, Eye } from "lucide-react";

import { localeActual } from '@/lib/localeActual'
interface ExceptionRow {
  id: string;
  type: string;
  severity: string;
  status: string;
  reason: string | null;
  resolutionNotes?: string | null;
  detectedAt: string;
  resolvedAt?: string | null;
  meta?: unknown;
  guardShiftId?: string | null;
  guard?: { fullName?: string } | null;
  station?: { stationName?: string } | null;
  resolvedBy?: { firstName?: string; lastName?: string } | null;
}

const TYPE_OPTIONS = ["", "late_arrival", "no_call_no_show", "missed_clockout", "outside_geofence", "early_departure", "overtime"];
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "open", label: "Abiertas" },
  { value: "acknowledged", label: "Reconocidas" },
  { value: "resolved", label: "Resueltas" },
  { value: "all", label: "Todas (historial)" },
];
function fullName(u?: { firstName?: string; lastName?: string } | null): string {
  if (!u) return "";
  return `${u.firstName || ""} ${u.lastName || ""}`.trim();
}

function SeverityPill({ severity }: { severity: string }) {
  const m = SEVERITY_META[severity] || { label: severity, tone: "neutral" as const };
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}
function StatusPill({ status }: { status: string }) {
  const m = EXC_STATUS_META[status] || { label: status, tone: "neutral" as const };
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="cg-eyebrow">{label}</p>
      <p className="mt-0.5 text-sm" style={{ color: "var(--ink)" }}>{value ?? "—"}</p>
    </div>
  );
}

/** Desplegable de filtro sobre el pozo de cristal — sin borde propio ni fondo
 *  opaco, para que se lea como parte de la barra y no como un control suelto. */
function FilterSelect({ icon, value, onChange, children }: {
  icon: React.ReactNode; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <label className="glass-sunken flex items-center gap-2 px-3 py-1.5">
      <span className="[&_svg]:size-4" style={{ color: "var(--ink-faint)" }}>{icon}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cg-focus bg-transparent text-sm outline-none"
        style={{ color: "var(--ink)" }}
      >
        {children}
      </select>
    </label>
  );
}

export default function NominaExceptions() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("open");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ExceptionRow | null>(null);
  const [notes, setNotes] = useState("");
  // Cierre en bloque del atraso: fecha de corte, cuántas alcanza y confirmación.
  const [corte, setCorte] = useState("");
  const [alcance, setAlcance] = useState<number | null>(null);
  const [cerrando, setCerrando] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    attendanceService
      .exceptions({
        "filter[status]": status === "all" ? undefined : status,
        "filter[type]": type || undefined,
        limit: 200,
      })
      .then((r) => setRows(r.rows || []))
      .catch((e) => toast.error(e?.message || "Error al cargar excepciones"))
      .finally(() => setLoading(false));
  }, [type, status]);
  useEffect(load, [load]);

  const openSheet = (r: ExceptionRow) => { setSelected(r); setNotes(r.resolutionNotes || ""); };

  /** Cuenta sin escribir. Nadie confirma un cierre masivo a ciegas. */
  useEffect(() => {
    if (!corte) { setAlcance(null); return; }
    let vivo = true;
    attendanceService
      .bulkResolveExceptions({ before: new Date(`${corte}T00:00:00`).toISOString(), type: type || undefined, preview: true })
      .then((r: any) => { if (vivo) setAlcance(Number(r?.matched ?? 0)); })
      .catch(() => { if (vivo) setAlcance(null); });
    return () => { vivo = false; };
  }, [corte, type]);

  const cerrarAtraso = async () => {
    if (!corte || !alcance) return;
    const fecha = new Date(`${corte}T00:00:00`).toLocaleDateString(localeActual());
    if (!window.confirm(`Se darán por resueltas ${alcance} excepción(es) abiertas anteriores al ${fecha}. Esta acción queda registrada en auditoría. ¿Continuar?`)) return;
    setCerrando(true);
    try {
      const r: any = await attendanceService.bulkResolveExceptions({
        before: new Date(`${corte}T00:00:00`).toISOString(),
        type: type || undefined,
      });
      toast.success(`${r?.resolved ?? 0} excepción(es) cerradas`);
      setCorte("");
      setAlcance(null);
      load();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "No se pudo cerrar el atraso");
    } finally {
      setCerrando(false);
    }
  };

  const act = async (id: string, newStatus: "resolved" | "acknowledged") => {
    setBusy(true);
    try {
      await attendanceService.resolveException(id, { status: newStatus, resolutionNotes: notes.trim() || undefined });
      toast.success(newStatus === "resolved" ? "Excepción resuelta" : "Excepción reconocida");
      setSelected(null);
      load();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<ExceptionRow>[] = [
    { key: "severity", header: "Severidad", render: (_v, r) => <SeverityPill severity={r.severity} /> },
    { key: "type", header: "Tipo", render: (_v, r) => EXCEPTION_LABEL[r.type] || r.type },
    { key: "guard", header: "Vigilante", render: (_v, r) => r.guard?.fullName || "—" },
    { key: "station", header: "Puesto", render: (_v, r) => r.station?.stationName || "—" },
    { key: "detectedAt", header: "Detectado", render: (_v, r) => <span className="text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>{fmtDateTime(r.detectedAt)}</span> },
    { key: "status", header: "Estado", render: (_v, r) => <StatusPill status={r.status} /> },
    {
      key: "resolvedAt",
      header: "Resuelto",
      render: (_v, r) =>
        r.resolvedAt ? (
          <span className="text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>
            {fmtDateTime(r.resolvedAt)}
            {fullName(r.resolvedBy) ? <span className="block opacity-70">por {fullName(r.resolvedBy)}</span> : null}
          </span>
        ) : (
          <span className="text-xs" style={{ color: "var(--ink-faint)" }}>—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      render: (_v, r) => (
        <Button size="sm" variant="outline" onClick={() => openSheet(r)}>
          <Eye className="mr-1 size-3.5" /> Revisar
        </Button>
      ),
    },
  ];

  const isOpenState = selected && (selected.status === "open" || selected.status === "acknowledged");

  return (
    <AppLayout>
      <PageContainer width="wide" className="p-4 sm:p-6">
        <PageHeader
          icon={<AlertTriangle />}
          title="Excepciones"
          subtitle={t('ui.NominaExceptions.desviacionesDeAsistenciaRegistroE')}
        />

        <Toolbar>
          <FilterSelect icon={<ListChecks />} value={status} onChange={setStatus}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </FilterSelect>
          <FilterSelect icon={<Filter />} value={type} onChange={setType}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t === "" ? "Todos los tipos" : EXCEPTION_LABEL[t] || t}</option>
            ))}
          </FilterSelect>
          <span className="ml-auto pr-1 text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>
            {loading ? "Cargando…" : `${rows.length} excepción(es)`}
          </span>
        </Toolbar>

        {/* ── CERRAR EL ATRASO ─────────────────────────────────────────────
            Con miles de excepciones abiertas, trabajarlas una a una no es una
            opción; dejarlas tampoco, porque entierran lo que llega después.
            El recuento se enseña ANTES de confirmar, y el filtro de tipo de
            arriba también acota el cierre. */}
        {status === "open" && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
            <span className="text-sm font-semibold">Cerrar el atraso</span>
            <label className="flex items-center gap-2 text-sm" style={{ color: "var(--ink-soft)" }}>
              anteriores al
              <input
                type="date"
                value={corte}
                onChange={(e) => setCorte(e.target.value)}
                className="min-h-9 rounded-lg border px-2 py-1 text-sm"
                style={{ borderColor: "var(--hairline)", background: "transparent" }}
              />
            </label>
            {corte && (
              <span className="text-sm tabular-nums" style={{ color: "var(--ink-soft)" }}>
                {alcance === null ? "calculando…" : `alcanza a ${alcance} excepción(es)${type ? ` de tipo ${EXCEPTION_LABEL[type] || type}` : ""}`}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={!corte || !alcance || cerrando}
              onClick={cerrarAtraso}
            >
              {cerrando ? "Cerrando…" : "Cerrar en bloque"}
            </Button>
          </div>
        )}

        <Section title={STATUS_OPTIONS.find((s) => s.value === status)?.label || "Excepciones"} icon={<ListChecks />}>
          {loading ? (
            <SkeletonCards count={4} />
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              onRowClick={(r) => openSheet(r)}
              emptyState={
                <EmptyState
                  icon={<PartyPopper />}
                  title={status === "open" ? "Sin excepciones abiertas" : "Sin excepciones"}
                  description={t('ui.NominaExceptions.noHayDesviacionesDeAsistencia')}
                />
              }
            />
          )}
        </Section>
      </PageContainer>

      {/* Detail + resolution */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {EXCEPTION_LABEL[selected.type] || selected.type}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityPill severity={selected.severity} />
                  <StatusPill status={selected.status} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('comun.vigilante')} value={selected.guard?.fullName || "—"} />
                  <Field label={t('comun.puesto')} value={selected.station?.stationName || "—"} />
                  <Field label="Detectado" value={fmtDateTime(selected.detectedAt)} />
                  <Field label={t('comun.estado')} value={<StatusPill status={selected.status} />} />
                </div>

                {selected.reason && (
                  <div>
                    <p className="cg-eyebrow">{t('comun.motivo')}</p>
                    <p className="glass-sunken mt-1 whitespace-pre-wrap p-3" style={{ color: "var(--ink)" }}>{selected.reason}</p>
                  </div>
                )}

                {/* Resolution history (read-only trail) */}
                {(selected.status === "resolved" || selected.status === "acknowledged" || selected.status === "approved" || selected.status === "rejected") && (
                  <div className="glass-flat p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold">
                      <CheckCircle2 className="size-3.5" style={{ color: "var(--ok-text)" }} /> Resolución
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <Field label={t('comun.fecha')} value={selected.resolvedAt ? fmtDateTime(selected.resolvedAt) : "—"} />
                      <Field label={t('ui.NominaExceptions.por')} value={fullName(selected.resolvedBy) || "—"} />
                    </div>
                    {selected.resolutionNotes && (
                      <p className="glass-sunken mt-2 whitespace-pre-wrap p-3" style={{ color: "var(--ink)" }}>{selected.resolutionNotes}</p>
                    )}
                  </div>
                )}

                {/* Resolve / acknowledge (only while actionable) */}
                {isOpenState && (
                  <div className="space-y-2 pt-1">
                    <p className="cg-eyebrow">{t("ui.NominaExceptions.notaDeResolucionQuedaEn", "Nota de resolución (queda en el historial)")}</p>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder={t("ui.NominaExceptions.describeQueSeHizoO", "Describe qué se hizo o por qué se cierra esta excepción…")}
                      className="cg-input cg-focus w-full p-2 text-sm"
                    />
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button disabled={busy} onClick={() => act(selected.id, "resolved")}>
                        Resolver
                      </Button>
                      {selected.status === "open" && (
                        <Button disabled={busy} variant="outline" onClick={() => act(selected.id, "acknowledged")}>
                          Reconocer
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
