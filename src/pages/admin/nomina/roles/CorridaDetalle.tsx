/**
 * ROLES DE PAGO — una planilla: la fila de cada persona con sus totales y
 * alertas, publicar, anular, recalcular y descargar (PDF resumen / Excel).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Columns3, Download, FileSpreadsheet, RefreshCw, Rows3 } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, Section, SkeletonCards, StatusBadge, StatCard, InfoNote, Modal, FormField, FIELD_CLS } from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import payrollSlipsService, { type PayrollSlipRow } from "@/lib/api/payrollSlipsService";
import { AvisoSoloLectura, PresentacionDelModulo, usePayrollAccess, dinero, useEtiquetas } from "./comun";
import { useEstadoDeCorrida } from "./CorridasDePago";

export default function CorridaDetalle() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const etiquetas = useEtiquetas();
  const estado = useEstadoDeCorrida();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("payrollSlipEdit");
  const canPublish = hasPermission("payrollSlipPublish");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [anular, setAnular] = useState(false);
  const [motivo, setMotivo] = useState("");

  // Switched off (read-only): the sheet opens only if it was published; no edits.
  const acceso = usePayrollAccess();
  const datos = useQuery({
    queryKey: acceso.readOnly ? ["payroll-slips", "run", id, "issued"] : ["payroll-slips", "run", id],
    queryFn: () => payrollSlipsService.run(id),
    retry: false,
    enabled: Boolean(id) && acceso.canRead,
    // An old run whose hours are ready waits for «Calcular planilla»: no polling.
    refetchInterval: (q) => (q.state.data?.run.status === "generating" && !q.state.data?.listoParaCalcular ? 3000 : false),
  });
  const modo = acceso.resolve(undefined, datos.error);
  const soloLectura = modo === "readOnly";
  const sinModulo = modo !== "full" && !soloLectura;
  const completo = modo === "full";
  const run = datos.data?.run;
  const slips = datos.data?.slips ?? [];
  const decimals = run?.settingsSnapshot?.decimals ?? 2;
  const cur = run?.currency || "USD";
  const refrescar = () => qc.invalidateQueries({ queryKey: ["payroll-slips"] });
  // «Por concepto»: una columna por cada concepto que sale en la planilla
  // (ingresos, luego deducciones, luego aportes), incluidos los que creó la empresa.
  const [porConcepto, setPorConcepto] = useState(false);
  const conceptos = useMemo(() => {
    const vistos = new Map<string, { code: string; name: string; kind: string }>();
    for (const k of ["earning", "deduction", "employer"]) {
      for (const s of slips) for (const c of s.byConcept ?? []) if (c.kind === k && !vistos.has(c.code)) vistos.set(c.code, c);
    }
    return [...vistos.values()];
  }, [slips]);
  const importe = (s: PayrollSlipRow, code: string) => (s.byConcept ?? []).find((c) => c.code === code)?.amountCents ?? 0;
  // Un rol en negativo no se publica (el servidor tampoco lo deja).
  const enNegativo = slips.filter((s) => Number(s.netCents) < 0).length;
  const TONO: Record<string, string> = { earning: "var(--ok)", deduction: "var(--bad)", employer: "var(--ink-faint)" };

  const accion = async (nombre: string, fn: () => Promise<unknown>, ok: string) => {
    setOcupado(nombre);
    try {
      await fn();
      if (ok) toast.success(ok);
      await refrescar();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setOcupado(null);
    }
  };

  const alertasDe = (s: PayrollSlipRow) => (s.alerts || []).filter((a) => a.severity !== "info");

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<FileSpreadsheet />}
          title={run ? `${t("ui.RolesDePago.corridas.planilla", "Planilla")} ${run.number}` : t("ui.RolesDePago.corridas.planilla", "Planilla")}
          subtitle={run ? `${run.periodFrom} → ${run.periodTo} · ${cur}` : undefined}
          badges={run ? <StatusBadge tone={estado.tone[run.status]}>{estado.label[run.status]}</StatusBadge> : undefined}
          actions={
            run && !sinModulo ? (
              <div className="cg-acciones">
                {completo && run.status === "review" && canEdit && <Button disabled={!!ocupado} variant="outline" onClick={() => accion("recompute", () => payrollSlipsService.recompute(run.id), t("ui.RolesDePago.corridas.recalculada", "Planilla recalculada"))}><RefreshCw size={14} /> {t("ui.RolesDePago.corridas.recalcular", "Recalcular")}</Button>}
                {["review", "published"].includes(run.status) && <Button disabled={!!ocupado} variant="outline" onClick={() => accion("xlsx", () => payrollSlipsService.downloadSheet(run, "xlsx"), "")}><Download size={14} /> Excel</Button>}
                {["review", "published"].includes(run.status) && <Button disabled={!!ocupado} variant="outline" onClick={() => accion("pdf", () => payrollSlipsService.downloadSheet(run, "pdf"), "")}><Download size={14} /> PDF</Button>}
                {completo && ["review", "published", "error"].includes(run.status) && canPublish && <Button disabled={!!ocupado} variant="ghost" onClick={() => setAnular(true)}>{t("ui.RolesDePago.corridas.anular", "Anular")}</Button>}
                {completo && run.status === "review" && canPublish && <Button disabled={!!ocupado || !slips.length || enNegativo > 0} variant="brand" onClick={() => accion("publish", () => payrollSlipsService.publish(run.id), t("ui.RolesDePago.corridas.publicada", "Planilla publicada: los roles ya tienen número"))}>{t("ui.RolesDePago.corridas.publicar", "Publicar")}</Button>}
              </div>
            ) : undefined
          }
        />
        {soloLectura && (
          <div className="mb-4">
            <AvisoSoloLectura />
          </div>
        )}
        {sinModulo ? (
          <PresentacionDelModulo modo={modo} />
        ) : soloLectura && datos.isError ? (
          <InfoNote tone="neutral">{t("ui.RolesDePago.soloLectura.noEmitida", "Solo se pueden ver las planillas y los roles ya emitidos.")}</InfoNote>
        ) : datos.isLoading || !run ? (
          <SkeletonCards count={3} />
        ) : (
          <div className="space-y-4">
            {Number(datos.data?.unapprovedTimecards) > 0 && ["review", "generating"].includes(run.status) && (
              <InfoNote tone="warn">
                {t("ui.RolesDePago.corridas.tarjetasSinAprobar", {
                  count: Number(datos.data?.unapprovedTimecards),
                  defaultValue: "{{count}} tarjetas sin aprobar en el periodo. La planilla las incluye igual; apruébalas antes de publicar.",
                })}{" "}
                <Link className="font-semibold underline" to={`/nomina/timecards?from=${run.periodFrom}&to=${run.periodTo}`}>
                  {t("ui.RolesDePago.corridas.irAHoras", "Ir a Horas del periodo")}
                </Link>
              </InfoNote>
            )}
            {run.status === "generating" && datos.data?.listoParaCalcular && (
              <InfoNote tone="warn">
                {t("ui.RolesDePago.corridas.listaParaCalcular", "Las horas del periodo ya están listas, pero esta planilla no se calculó. Se calcula con las tarjetas de hoy.")}{" "}
                {completo && canEdit && (
                  <Button size="sm" variant="outline" disabled={!!ocupado} onClick={() => accion("recompute", () => payrollSlipsService.recompute(run.id), t("ui.RolesDePago.corridas.recalculada", "Planilla recalculada"))}>
                    <RefreshCw size={14} /> {t("ui.RolesDePago.corridas.calcularPlanilla", "Calcular planilla")}
                  </Button>
                )}
              </InfoNote>
            )}
            {run.status === "generating" && !datos.data?.listoParaCalcular && <InfoNote tone="info">{t("ui.RolesDePago.corridas.generando", "Se están calculando las horas del periodo (tarjetas de nómina). Esta pantalla se actualiza sola.")}</InfoNote>}
            {run.status === "error" && <InfoNote tone="bad">{t("ui.RolesDePago.corridas.fallo", "No se pudieron calcular las horas del periodo. Anula esta planilla y crea otra, o revisa las tarjetas de nómina.")}</InfoNote>}
            {run.status === "voided" && <InfoNote tone="neutral">{t("ui.RolesDePago.corridas.anulada", "Planilla anulada")}{run.voidReason ? `: ${run.voidReason}` : ""}</InfoNote>}
            {run.status === "review" && (run.totals?.withoutTimecard || 0) > 0 && <InfoNote tone="warn">{t("ui.RolesDePago.corridas.sinTarjeta", "{{n}} persona(s) sin tarjeta de horas en el periodo: su rol solo lleva el sueldo y las novedades.", { n: run.totals?.withoutTimecard })}</InfoNote>}
            {run.status === "review" && enNegativo > 0 && <InfoNote tone="bad">{t("ui.RolesDePago.corridas.netoNegativo", "{{n}} rol(es) con neto negativo: las deducciones superan los ingresos. Baja la multa, la cuota o el anticipo y recalcula; mientras tanto no se puede publicar.", { n: enNegativo })}</InfoNote>}
            {slips.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label={t("ui.RolesDePago.portada.personas", "Personas")} value={String(slips.length)} />
                <StatCard label={t("ui.RolesDePago.corridas.bruto", "Total ingresos")} value={dinero(run.totals?.gross || 0, cur, decimals)} />
                <StatCard label={t("ui.RolesDePago.corridas.deducciones", "Total deducciones")} value={dinero(run.totals?.deductions || 0, cur, decimals)} />
                <StatCard label={t("ui.RolesDePago.corridas.neto", "Neto a pagar")} value={dinero(run.totals?.net || 0, cur, decimals)} hint={run.totals?.employer ? t("ui.RolesDePago.corridas.costoEmpleador", "+ {{n}} de aportes del empleador", { n: dinero(run.totals.employer, cur, decimals) }) : undefined} />
              </div>
            )}
            {slips.length > 0 && (
              <Section>
                <div className="mb-2 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setPorConcepto((v) => !v)}>
                    {porConcepto ? <Rows3 size={14} /> : <Columns3 size={14} />}{" "}
                    {porConcepto ? t("ui.RolesDePago.corridas.verResumen", "Ver totales") : t("ui.RolesDePago.corridas.porConcepto", "Ver por concepto")}
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="cg-eyebrow text-left">
                        <th className="px-2 py-1.5">{t("ui.RolesDePago.corridas.numero", "N.º")}</th>
                        <th className="px-2 py-1.5">{t("ui.RolesDePago.perfiles.persona", "Persona")}</th>
                        <th className="px-2 py-1.5 text-right">{t("ui.RolesDePago.horas.ordinary", "Horas ordinarias")}</th>
                        <th className="px-2 py-1.5 text-right">{t("ui.RolesDePago.corridas.extra", "Extra")}</th>
                        <th className="px-2 py-1.5 text-right" title={t("ui.RolesDePago.corridas.dobladasHint", "Turnos extra por dobladas: una tripleta cuenta dos")}>{t("ui.RolesDePago.corridas.dobladas", "Dobladas")}</th>
                        {porConcepto && conceptos.map((c) => (
                          <th key={c.code} className="min-w-[6rem] max-w-[9rem] px-2 py-1.5 text-right leading-tight" title={c.code}>
                            <span className="mr-1 inline-block size-1.5 rounded-full align-middle" style={{ background: TONO[c.kind] }} />{c.name}
                          </th>
                        ))}
                        <th className="px-2 py-1.5 text-right">{t("ui.RolesDePago.corridas.bruto", "Total ingresos")}</th>
                        <th className="px-2 py-1.5 text-right">{t("ui.RolesDePago.corridas.deducciones", "Total deducciones")}</th>
                        <th className="px-2 py-1.5 text-right">{t("ui.RolesDePago.corridas.neto", "Neto a pagar")}</th>
                        <th className="px-2 py-1.5">{t("ui.RolesDePago.corridas.alertasCol", "Alertas")}</th>
                        <th className="px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {slips.map((s) => {
                        const h = s.bases?.hours || ({} as Record<string, number>);
                        const alertas = alertasDe(s);

                        return (
                          <tr key={s.id} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                            <td className="px-2 py-2 font-mono text-xs">{s.number || t("ui.RolesDePago.corridas.borrador", "borrador")}</td>
                            <td className="px-2 py-2">
                              <Link className="font-medium underline-offset-2 hover:underline" to={`/nomina/roles/rol/${s.id}`}>{s.profileSnapshot?.name}</Link>
                              <div className="text-xs" style={{ color: "var(--ink-faint)" }}>{etiquetas.population[s.profileSnapshot?.population]}{s.profileSnapshot?.jobTitle ? ` · ${s.profileSnapshot.jobTitle}` : ""}{s.employmentType === "contractor" ? ` · ${t("ui.RolesDePago.perfiles.contratista", "Contratista")}` : ""}</div>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">{Number(h.ordinary || 0).toFixed(1)}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{(Number(h.overtime1 || 0) + Number(h.overtime2 || 0) + Number(h.double_shift || 0)).toFixed(1)}</td>
                            <td className="px-2 py-2 text-right tabular-nums" title={s.bases?.doubleShifts?.days ? t("ui.RolesDePago.corridas.dobladasDetalle", "{{d}} día(s) con doblada · {{h}} h · turno de {{j}} h", { d: s.bases.doubleShifts.days, h: s.bases.doubleShifts.hours, j: s.bases.doubleShifts.shiftHours }) : undefined}>{s.bases?.doubleShifts?.extraShifts || "—"}</td>
                            {porConcepto && conceptos.map((c) => {
                              const v = importe(s, c.code);

                              return <td key={c.code} className="whitespace-nowrap px-2 py-2 text-right tabular-nums" style={{ color: v ? undefined : "var(--ink-faint)" }}>{v ? dinero(v, cur, decimals) : "—"}</td>;
                            })}
                            <td className="px-2 py-2 text-right tabular-nums">{dinero(s.grossCents, cur, decimals)}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{dinero(s.deductionsCents, cur, decimals)}</td>
                            <td className="px-2 py-2 text-right font-medium tabular-nums" style={{ color: Number(s.netCents) < 0 ? "var(--bad)" : undefined }}>{dinero(s.netCents, cur, decimals)}</td>
                            <td className="px-2 py-2">
                              {alertas.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs" style={{ color: alertas.some((a) => a.severity === "bad") ? "var(--bad)" : "var(--warn)" }} title={alertas.map((a) => a.message).join("\n")}>
                                  <AlertTriangle size={12} /> {alertas[0].message}{alertas.length > 1 ? ` (+${alertas.length - 1})` : ""}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <Button size="sm" variant="ghost" onClick={() => navigate(`/nomina/roles/rol/${s.id}`)}>{t("ui.RolesDePago.corridas.verRol", "Ver rol")}</Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </div>
        )}
        {anular && completo && run && (
          <Modal open size="sm" title={t("ui.RolesDePago.corridas.anularTitulo", "Anular la planilla {{n}}", { n: run.number })} description={run.status === "published" ? t("ui.RolesDePago.corridas.anularDesc", "Los roles quedan marcados como anulados, las novedades vuelven a estar pendientes y las cuotas de préstamo se devuelven. Hace falta un motivo.") : t("ui.RolesDePago.corridas.anularBorrador", "Se descarta el borrador.")} onOpenChange={(o) => { if (!o) setAnular(false); }}
            footer={<div className="cg-acciones justify-end"><Button variant="outline" onClick={() => setAnular(false)}>{t("ui.RolesDePago.cancelar", "Cancelar")}</Button><Button disabled={run.status === "published" && !motivo.trim()} variant="brand" onClick={() => { setAnular(false); accion("void", () => payrollSlipsService.void(run.id, motivo), t("ui.RolesDePago.corridas.anuladaOk", "Planilla anulada")); }}>{t("ui.RolesDePago.corridas.anular", "Anular")}</Button></div>}
          >
            <FormField label={t("ui.RolesDePago.corridas.motivo", "Motivo")}>
              <input className={FIELD_CLS} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </FormField>
          </Modal>
        )}
      </PageContainer>
    </AppLayout>
  );
}
