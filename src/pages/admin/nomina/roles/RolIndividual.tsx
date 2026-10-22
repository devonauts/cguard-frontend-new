/**
 * ROLES DE PAGO — el rol de una persona: líneas, bases y alertas. En revisión
 * se puede fijar a mano el importe de una línea o añadir una; publicado, se
 * descarga el PDF.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Download, FileText, Pencil, Plus } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, Section, SkeletonCards, StatusBadge, InfoNote, Modal, FormField, FIELD_CLS, Field } from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import payrollSlipsService, { type SlipLine, type ConceptKind } from "@/lib/api/payrollSlipsService";
import { PresentacionDelModulo, useModuloRoles, dinero, MoneyInput } from "./comun";

export default function RolIndividual() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("payrollSlipEdit");
  const [editando, setEditando] = useState<Partial<SlipLine> | null>(null);
  const datos = useQuery({ queryKey: ["payroll-slips", "slip", id], queryFn: () => payrollSlipsService.slip(id), retry: false, enabled: Boolean(id) });
  const { sinModulo } = useModuloRoles(datos.error);
  const slip = datos.data?.slip;
  const run = datos.data?.run;
  const cur = run?.currency || "USD";
  const decimals = run?.settingsSnapshot?.decimals ?? 2;
  const enRevision = run?.status === "review";
  const lineas = slip?.lines ?? [];
  const bloque = (kind: ConceptKind) => lineas.filter((l) => l.kind === kind);
  const h = slip?.bases?.hours || ({} as Record<string, number>);

  const descargar = async () => {
    if (!slip) return;
    try { await payrollSlipsService.downloadSlip(slip); } catch (e) { toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar")); }
  };

  const quitarManual = async (code: string) => {
    try {
      await payrollSlipsService.setLine(id, { code, remove: true });
      await qc.invalidateQueries({ queryKey: ["payroll-slips"] });
    } catch (e) { toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar")); }
  };

  const Tabla = ({ titulo, filas, total }: { titulo: string; filas: SlipLine[]; total: number | string }) => (
    <Section title={titulo}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="cg-eyebrow text-left">
              <th className="px-2 py-1.5">{t("ui.RolesDePago.conceptos.codigo", "Código")}</th>
              <th className="px-2 py-1.5">{t("ui.RolesDePago.conceptos.nombre", "Concepto")}</th>
              <th className="px-2 py-1.5 text-right">{t("ui.RolesDePago.rol.cantidad", "Cantidad")}</th>
              <th className="px-2 py-1.5 text-right">{t("ui.RolesDePago.rol.tarifa", "Tarifa")}</th>
              <th className="px-2 py-1.5 text-right">{t("ui.RolesDePago.novedades.importe", "Importe")}</th>
              {enRevision && canEdit && <th className="px-2 py-1.5" />}
            </tr>
          </thead>
          <tbody>
            {filas.map((l, i) => (
              <tr key={`${l.code}-${i}`} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                <td className="px-2 py-2 font-mono text-xs">{l.officialCode ? `${l.officialCode} · ` : ""}{l.code}</td>
                <td className="px-2 py-2">{l.name}{l.note ? <span className="text-xs" style={{ color: "var(--ink-faint)" }}> · {l.note}</span> : null}{l.source === "manual" && <StatusBadge className="ml-2" tone="brand">{t("ui.RolesDePago.rol.manual", "Ajustado a mano")}</StatusBadge>}</td>
                <td className="px-2 py-2 text-right tabular-nums">{l.qty === null || l.qty === undefined ? "" : Number(l.qty).toFixed(Number.isInteger(Number(l.qty)) ? 0 : 2)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{l.rate === null || l.rate === undefined ? "" : l.qty ? dinero(Number(l.rate), cur, 2) : l.base ? `${Number(l.rate)} %` : dinero(Number(l.rate), cur, decimals)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{dinero(l.amountCents, cur, decimals)}</td>
                {enRevision && canEdit && (
                  <td className="px-2 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditando(l)}><Pencil size={13} /></Button>
                    {l.source === "manual" && <Button size="sm" variant="ghost" onClick={() => quitarManual(l.code)}>{t("ui.RolesDePago.rol.deshacer", "Deshacer")}</Button>}
                  </td>
                )}
              </tr>
            ))}
            <tr className="border-t font-medium" style={{ borderColor: "var(--hairline)" }}>
              <td className="px-2 py-2" colSpan={4}>{t("ui.RolesDePago.rol.total", "Total")}</td>
              <td className="px-2 py-2 text-right tabular-nums">{dinero(total, cur, decimals)}</td>
              {enRevision && canEdit && <td />}
            </tr>
          </tbody>
        </table>
      </div>
    </Section>
  );

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          icon={<FileText />}
          title={slip ? `${slip.number || t("ui.RolesDePago.rol.borrador", "Borrador")} · ${slip.profileSnapshot?.name || ""}` : t("ui.RolesDePago.rol.titulo", "Rol de pago")}
          subtitle={run ? <span>{t("ui.RolesDePago.corridas.planilla", "Planilla")} <Link className="underline" to={`/nomina/roles/planillas/${run.id}`}>{run.number}</Link> · {run.periodFrom} → {run.periodTo}</span> : undefined}
          badges={slip ? <StatusBadge tone={slip.status === "published" ? "ok" : slip.status === "voided" ? "neutral" : "warn"}>{slip.status === "published" ? t("ui.RolesDePago.corridas.estado.published", "Publicada") : slip.status === "voided" ? t("ui.RolesDePago.corridas.estado.voided", "Anulada") : t("ui.RolesDePago.rol.borrador", "Borrador")}</StatusBadge> : undefined}
          actions={slip && !sinModulo ? (
            <div className="cg-acciones">
              {enRevision && canEdit && <Button variant="outline" onClick={() => setEditando({})}><Plus size={14} /> {t("ui.RolesDePago.rol.anadirLinea", "Añadir línea")}</Button>}
              <Button variant="brand" onClick={descargar}><Download size={14} /> PDF</Button>
            </div>
          ) : undefined}
        />
        {sinModulo ? (
          <PresentacionDelModulo />
        ) : datos.isLoading || !slip ? (
          <SkeletonCards count={3} />
        ) : (
          <div className="space-y-4">
            {(slip.alerts || []).filter((a) => a.severity !== "info").map((a) => (
              <InfoNote key={a.code} tone={a.severity === "bad" ? "bad" : "warn"}>{a.message}</InfoNote>
            ))}
            <Section>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label={t("ui.RolesDePago.perfiles.vinculo", "Vínculo")} value={slip.employmentType === "contractor" ? t("ui.RolesDePago.perfiles.contratista", "Contratista") : t("ui.RolesDePago.perfiles.empleado", "Empleado")} />
                <Field label={t("ui.RolesDePago.perfiles.cargo", "Cargo")} value={slip.profileSnapshot?.jobTitle || "—"} />
                <Field numeric label={t("ui.RolesDePago.perfiles.sueldo", "Sueldo")} value={`${dinero(slip.bases?.baseSalaryCents || 0, cur, decimals)} / ${slip.profileSnapshot?.payBasis === "hourly" ? t("ui.RolesDePago.perfiles.porHora", "Hora") : t("ui.RolesDePago.perfiles.mensual", "Mes")}`} />
                <Field numeric label={t("ui.RolesDePago.rol.valorHora", "Valor hora")} value={dinero(slip.bases?.hourlyRateCents || 0, cur, 2)} />
                <Field numeric label={t("ui.RolesDePago.rol.diasPagados", "Días pagados")} value={String(slip.bases?.paidDays ?? "—")} />
                <Field numeric label={t("ui.RolesDePago.horas.ordinary", "Horas ordinarias")} value={Number(h.ordinary || 0).toFixed(2)} />
                <Field numeric label={t("ui.RolesDePago.corridas.extra", "Extra")} value={`${Number(h.overtime1 || 0).toFixed(2)} + ${Number(h.overtime2 || 0).toFixed(2)}`} />
                <Field numeric label={t("ui.RolesDePago.horas.night", "Horas nocturnas")} value={Number(h.night || 0).toFixed(2)} />
              </div>
            </Section>
            <Tabla titulo={t("ui.RolesDePago.rol.ingresos", "Ingresos")} filas={bloque("earning")} total={slip.grossCents} />
            <Tabla titulo={t("ui.RolesDePago.rol.deducciones", "Deducciones")} filas={bloque("deduction")} total={slip.deductionsCents} />
            <Section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-lg font-semibold">{t("ui.RolesDePago.corridas.neto", "Neto a pagar")}</div>
                <div className="text-2xl font-semibold tabular-nums">{dinero(slip.netCents, cur, decimals)}</div>
              </div>
              <p className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
                {t("ui.RolesDePago.rol.bases", "Base de seguridad social {{ss}} · base de renta {{tax}}", { ss: dinero(slip.bases?.ssBaseCents || 0, cur, decimals), tax: dinero(slip.bases?.taxBaseCents || 0, cur, decimals) })}
                {slip.hash ? ` · ${t("ui.RolesDePago.rol.verificacion", "Verificación")} ${slip.hash.slice(0, 16)}` : ""}
              </p>
            </Section>
            {bloque("employer").length > 0 && <Tabla titulo={t("ui.RolesDePago.rol.aportes", "Aportes del empleador")} filas={bloque("employer")} total={slip.employerCostCents} />}
            {bloque("info").length > 0 && <Tabla titulo={t("ui.RolesDePago.rol.informativos", "Informativos")} filas={bloque("info")} total={bloque("info").reduce((s, l) => s + Number(l.amountCents), 0)} />}
          </div>
        )}
        {editando && slip && (
          <LineaForm inicial={editando} moneda={cur} decimals={decimals} slipId={slip.id} onClose={() => setEditando(null)} onSaved={async () => { setEditando(null); await qc.invalidateQueries({ queryKey: ["payroll-slips"] }); }} />
        )}
      </PageContainer>
    </AppLayout>
  );
}

function LineaForm({ inicial, moneda, decimals, slipId, onClose, onSaved }: { inicial: Partial<SlipLine>; moneda: string; decimals: 0 | 2; slipId: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState(inicial.code || "");
  const [name, setName] = useState(inicial.name || "");
  const [kind, setKind] = useState<ConceptKind>(inicial.kind || "earning");
  const [cents, setCents] = useState<number | null>(inicial.amountCents ?? null);
  const [note, setNote] = useState(inicial.note || "");
  const [saving, setSaving] = useState(false);
  const nueva = !inicial.code;

  const guardar = async () => {
    setSaving(true);
    try {
      await payrollSlipsService.setLine(slipId, { code, amountCents: cents || 0, name: nueva ? name : undefined, kind: nueva ? kind : undefined, note: note || null });
      toast.success(t("ui.RolesDePago.rol.lineaGuardada", "Línea ajustada; el rol se recalculó"));
      onSaved();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open size="sm" title={nueva ? t("ui.RolesDePago.rol.anadirLinea", "Añadir línea") : `${inicial.name}`} description={t("ui.RolesDePago.rol.lineaDesc", "El importe que pongas sustituye al calculado solo en este rol.")} onOpenChange={(o) => { if (!o) onClose(); }}
      footer={<div className="cg-acciones justify-end"><Button variant="outline" onClick={onClose}>{t("ui.RolesDePago.cancelar", "Cancelar")}</Button><Button disabled={saving || !code || cents === null} variant="brand" onClick={guardar}>{saving ? t("ui.RolesDePago.guardando", "Guardando…") : t("ui.RolesDePago.guardar", "Guardar")}</Button></div>}
    >
      <div className="grid grid-cols-1 gap-3">
        {nueva && (
          <>
            <FormField label={t("ui.RolesDePago.conceptos.codigo", "Código")} required><input className={`${FIELD_CLS} font-mono uppercase`} maxLength={24} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></FormField>
            <FormField label={t("ui.RolesDePago.conceptos.nombre", "Nombre")}><input className={FIELD_CLS} value={name} onChange={(e) => setName(e.target.value)} /></FormField>
            <FormField label={t("ui.RolesDePago.conceptos.tipo", "Tipo")}>
              <select className={FIELD_CLS} value={kind} onChange={(e) => setKind(e.target.value as ConceptKind)}>
                <option value="earning">{t("ui.RolesDePago.tipo.earning", "Ingreso")}</option>
                <option value="deduction">{t("ui.RolesDePago.tipo.deduction", "Deducción")}</option>
              </select>
            </FormField>
          </>
        )}
        <FormField label={t("ui.RolesDePago.novedades.importeEn", "Importe ({{moneda}})", { moneda })} required>
          <MoneyInput cents={cents} className={`${FIELD_CLS} tabular-nums`} decimals={decimals} onCents={setCents} />
        </FormField>
        <FormField label={t("ui.RolesDePago.conceptos.nota", "Nota")}><input className={FIELD_CLS} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></FormField>
      </div>
    </Modal>
  );
}
