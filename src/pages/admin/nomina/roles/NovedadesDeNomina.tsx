/**
 * ROLES DE PAGO — novedades del periodo (bonos, multas, anticipos, descuentos,
 * reintegros) y préstamos con cuotas. Lo pendiente entra en la próxima planilla.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HandCoins, ListPlus, Plus } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, Section, SkeletonCards, EmptyState, Modal, FormField, FIELD_CLS, StatusBadge, TabNav } from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import payrollSlipsService, { type PayrollAdjustment, type PayrollLoan, type AdjustmentKind, type PersonWithProfile, type PayrollConcept } from "@/lib/api/payrollSlipsService";
import { PresentacionDelModulo, useModuloRoles, dinero, nombreDeConcepto, MoneyInput } from "./comun";

type Pestana = "novedades" | "prestamos";
const KINDS: AdjustmentKind[] = ["bonus", "fine", "advance", "deduction", "refund", "custom"];

const nombre = (p?: { fullName?: string; firstName?: string; lastName?: string } | null) =>
  p?.fullName || [p?.firstName, p?.lastName].filter(Boolean).join(" ") || "—";

export default function NovedadesDeNomina() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("payrollSlipEdit");
  const [pestana, setPestana] = useState<Pestana>("novedades");
  const [nueva, setNueva] = useState(false);
  const [nuevoPrestamo, setNuevoPrestamo] = useState(false);

  const vista = useQuery({ queryKey: ["payroll-slips", "settings"], queryFn: () => payrollSlipsService.settings(), retry: false });
  const novedades = useQuery({ queryKey: ["payroll-slips", "adjustments"], queryFn: () => payrollSlipsService.adjustments(), retry: false });
  const prestamos = useQuery({ queryKey: ["payroll-slips", "loans"], queryFn: () => payrollSlipsService.loans(), retry: false });
  const personas = useQuery({ queryKey: ["payroll-slips", "people"], queryFn: () => payrollSlipsService.people(), staleTime: 60_000 });
  const conceptos = useQuery({ queryKey: ["payroll-slips", "concepts"], queryFn: () => payrollSlipsService.concepts(false), staleTime: 60_000 });
  const { sinModulo } = useModuloRoles(vista.error);

  const settings = vista.data?.settings;
  const moneda = settings?.currency || "USD";
  const decimals = settings?.decimals ?? 2;
  const refrescar = () => qc.invalidateQueries({ queryKey: ["payroll-slips"] });

  const tipo: Record<AdjustmentKind, string> = {
    bonus: t("ui.RolesDePago.novedades.tipo.bonus", "Bono"),
    fine: t("ui.RolesDePago.novedades.tipo.fine", "Multa"),
    advance: t("ui.RolesDePago.novedades.tipo.advance", "Anticipo"),
    deduction: t("ui.RolesDePago.novedades.tipo.deduction", "Descuento"),
    refund: t("ui.RolesDePago.novedades.tipo.refund", "Reintegro"),
    custom: t("ui.RolesDePago.novedades.tipo.custom", "Otro concepto"),
    loan_installment: t("ui.RolesDePago.novedades.tipo.loan_installment", "Cuota de préstamo"),
  };
  const estadoPrestamo: Record<PayrollLoan["status"], string> = {
    active: t("ui.RolesDePago.prestamos.estado.active", "Activo"),
    paused: t("ui.RolesDePago.prestamos.estado.paused", "En pausa"),
    settled: t("ui.RolesDePago.prestamos.estado.settled", "Pagado"),
    cancelled: t("ui.RolesDePago.prestamos.estado.cancelled", "Cancelado"),
  };

  const borrar = async (a: PayrollAdjustment) => {
    try {
      await payrollSlipsService.deleteAdjustment(a.id);
      toast.success(t("ui.RolesDePago.novedades.borrada", "Novedad borrada"));
      await refrescar();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    }
  };

  const cambiarPrestamo = async (l: PayrollLoan, status: PayrollLoan["status"]) => {
    try {
      await payrollSlipsService.updateLoan(l.id, { status });
      await refrescar();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    }
  };

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          icon={<ListPlus />}
          title={t("ui.RolesDePago.novedades.titulo", "Novedades de nómina")}
          subtitle={t("ui.RolesDePago.novedades.subtitulo", "Bonos, multas, anticipos, descuentos y préstamos. Lo pendiente entra en la próxima planilla; al publicarla queda registrado.")}
          actions={
            !sinModulo && canEdit ? (
              <div className="cg-acciones">
                <Button variant="outline" onClick={() => setNuevoPrestamo(true)}><HandCoins size={14} /> {t("ui.RolesDePago.prestamos.nuevo", "Nuevo préstamo")}</Button>
                <Button variant="brand" onClick={() => setNueva(true)}><Plus size={14} /> {t("ui.RolesDePago.novedades.nueva", "Nueva novedad")}</Button>
              </div>
            ) : undefined
          }
        />
        {sinModulo ? (
          <PresentacionDelModulo />
        ) : (
          <div className="space-y-4">
            <TabNav
              value={pestana}
              onChange={setPestana}
              items={[
                { value: "novedades", label: t("ui.RolesDePago.novedades.pestana", "Novedades"), badge: (novedades.data?.rows ?? []).filter((a) => !a.runId).length || null },
                { value: "prestamos", label: t("ui.RolesDePago.prestamos.pestana", "Préstamos"), badge: (prestamos.data?.rows ?? []).filter((l) => l.status === "active").length || null },
              ]}
            />
            {pestana === "novedades" && (novedades.isLoading ? <SkeletonCards count={2} /> : !(novedades.data?.rows ?? []).length ? (
              <EmptyState icon={<ListPlus />} title={t("ui.RolesDePago.novedades.vacio", "No hay novedades")} description={t("ui.RolesDePago.novedades.vacioDesc", "Carga aquí bonos, multas, anticipos o descuentos; entrarán en la próxima planilla.")} />
            ) : (
              <Section>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="cg-eyebrow text-left">
                        <th className="px-2 py-1.5">{t("ui.RolesDePago.perfiles.persona", "Persona")}</th>
                        <th className="px-2 py-1.5">{t("ui.RolesDePago.conceptos.tipo", "Tipo")}</th>
                        <th className="px-2 py-1.5">{t("ui.RolesDePago.conceptos.nombre", "Concepto")}</th>
                        <th className="px-2 py-1.5 text-right">{t("ui.RolesDePago.novedades.importe", "Importe")}</th>
                        <th className="px-2 py-1.5">{t("ui.RolesDePago.novedades.periodo", "Periodo")}</th>
                        <th className="px-2 py-1.5">{t("ui.RolesDePago.novedades.estado", "Estado")}</th>
                        <th className="px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {(novedades.data?.rows ?? []).map((a) => (
                        <tr key={a.id} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                          <td className="px-2 py-2 font-medium">{nombre(a.persona)}</td>
                          <td className="px-2 py-2">{tipo[a.kind] || a.kind}</td>
                          <td className="px-2 py-2">{a.concept ? nombreDeConcepto(a.concept.name, i18n.language) : "—"}{a.note ? <span className="block text-xs" style={{ color: "var(--ink-faint)" }}>{a.note}</span> : null}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{dinero(a.amountCents, moneda, decimals)}</td>
                          <td className="px-2 py-2 text-xs">{a.periodFrom ? `${a.periodFrom} → ${a.periodTo || ""}` : t("ui.RolesDePago.novedades.proxima", "Próxima planilla")}</td>
                          <td className="px-2 py-2">{a.runId ? <StatusBadge tone="ok">{t("ui.RolesDePago.novedades.aplicada", "Aplicada")}</StatusBadge> : <StatusBadge tone="warn">{t("ui.RolesDePago.novedades.pendiente", "Pendiente")}</StatusBadge>}</td>
                          <td className="px-2 py-2 text-right">{canEdit && !a.runId && <Button size="sm" variant="ghost" onClick={() => borrar(a)}>{t("ui.RolesDePago.conceptos.borrar", "Borrar")}</Button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            ))}
            {pestana === "prestamos" && (prestamos.isLoading ? <SkeletonCards count={2} /> : !(prestamos.data?.rows ?? []).length ? (
              <EmptyState icon={<HandCoins />} title={t("ui.RolesDePago.prestamos.vacio", "No hay préstamos")} description={t("ui.RolesDePago.prestamos.vacioDesc", "Un préstamo descuenta una cuota en cada planilla publicada hasta saldarse.")} />
            ) : (
              <Section>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="cg-eyebrow text-left">
                        <th className="px-2 py-1.5">{t("ui.RolesDePago.perfiles.persona", "Persona")}</th>
                        <th className="px-2 py-1.5 text-right">{t("ui.RolesDePago.prestamos.capital", "Capital")}</th>
                        <th className="px-2 py-1.5 text-right">{t("ui.RolesDePago.prestamos.cuota", "Cuota")}</th>
                        <th className="px-2 py-1.5">{t("ui.RolesDePago.prestamos.cuotas", "Cuotas")}</th>
                        <th className="px-2 py-1.5 text-right">{t("ui.RolesDePago.prestamos.saldo", "Saldo")}</th>
                        <th className="px-2 py-1.5">{t("ui.RolesDePago.novedades.estado", "Estado")}</th>
                        <th className="px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {(prestamos.data?.rows ?? []).map((l) => (
                        <tr key={l.id} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                          <td className="px-2 py-2 font-medium">{nombre(l.persona)}{l.note ? <span className="block text-xs" style={{ color: "var(--ink-faint)" }}>{l.note}</span> : null}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{dinero(l.principalCents, moneda, decimals)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{dinero(l.installmentCents, moneda, decimals)}</td>
                          <td className="px-2 py-2 tabular-nums">{l.paidInstallments}/{l.installments}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{dinero(l.balanceCents, moneda, decimals)}</td>
                          <td className="px-2 py-2"><StatusBadge tone={l.status === "active" ? "ok" : l.status === "settled" ? "neutral" : "warn"}>{estadoPrestamo[l.status]}</StatusBadge></td>
                          <td className="px-2 py-2 text-right">
                            {canEdit && l.status === "active" && <Button size="sm" variant="ghost" onClick={() => cambiarPrestamo(l, "paused")}>{t("ui.RolesDePago.prestamos.pausar", "Pausar")}</Button>}
                            {canEdit && l.status === "paused" && <Button size="sm" variant="ghost" onClick={() => cambiarPrestamo(l, "active")}>{t("ui.RolesDePago.prestamos.reanudar", "Reanudar")}</Button>}
                            {canEdit && ["active", "paused"].includes(l.status) && <Button size="sm" variant="ghost" onClick={() => cambiarPrestamo(l, "cancelled")}>{t("ui.RolesDePago.prestamos.cancelar", "Cancelar")}</Button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            ))}
          </div>
        )}
        {nueva && settings && (
          <NovedadForm personas={personas.data?.rows ?? []} conceptos={conceptos.data?.rows ?? []} moneda={moneda} decimals={decimals} tipo={tipo} onClose={() => setNueva(false)} onSaved={async () => { setNueva(false); await refrescar(); }} />
        )}
        {nuevoPrestamo && settings && (
          <PrestamoForm personas={personas.data?.rows ?? []} moneda={moneda} decimals={decimals} onClose={() => setNuevoPrestamo(false)} onSaved={async () => { setNuevoPrestamo(false); await refrescar(); }} />
        )}
      </PageContainer>
    </AppLayout>
  );
}

function SelectorDePersona({ personas, value, onChange }: { personas: PersonWithProfile[]; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const ordenadas = useMemo(() => [...personas].sort((a, b) => a.name.localeCompare(b.name)), [personas]);

  return (
    <select className={FIELD_CLS} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("ui.RolesDePago.asistente.elige", "Elige…")}</option>
      {ordenadas.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
    </select>
  );
}

function NovedadForm({ personas, conceptos, moneda, decimals, tipo, onClose, onSaved }: { personas: PersonWithProfile[]; conceptos: PayrollConcept[]; moneda: string; decimals: 0 | 2; tipo: Record<AdjustmentKind, string>; onClose: () => void; onSaved: () => void }) {
  const { t, i18n } = useTranslation();
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<AdjustmentKind>("bonus");
  const [conceptId, setConceptId] = useState("");
  const [cents, setCents] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [saving, setSaving] = useState(false);
  const candidatos = conceptos.filter((c) => (["bonus", "refund"].includes(kind) ? c.kind === "earning" : kind === "custom" ? c.kind !== "info" : c.kind === "deduction"));

  const guardar = async () => {
    setSaving(true);
    try {
      await payrollSlipsService.createAdjustment({ userId, kind, conceptId: conceptId || null, amountCents: cents || 0, note: note || null, periodFrom: periodFrom || null });
      toast.success(t("ui.RolesDePago.novedades.guardada", "Novedad guardada"));
      onSaved();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open size="md" title={t("ui.RolesDePago.novedades.nueva", "Nueva novedad")} onOpenChange={(o) => { if (!o) onClose(); }}
      footer={<div className="cg-acciones justify-end"><Button variant="outline" onClick={onClose}>{t("ui.RolesDePago.cancelar", "Cancelar")}</Button><Button disabled={saving || !userId || !cents} variant="brand" onClick={guardar}>{saving ? t("ui.RolesDePago.guardando", "Guardando…") : t("ui.RolesDePago.guardar", "Guardar")}</Button></div>}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField full label={t("ui.RolesDePago.perfiles.persona", "Persona")} required><SelectorDePersona personas={personas} value={userId} onChange={setUserId} /></FormField>
        <FormField label={t("ui.RolesDePago.conceptos.tipo", "Tipo")}>
          <select className={FIELD_CLS} value={kind} onChange={(e) => { setKind(e.target.value as AdjustmentKind); setConceptId(""); }}>
            {KINDS.map((k) => <option key={k} value={k}>{tipo[k]}</option>)}
          </select>
        </FormField>
        <FormField label={t("ui.RolesDePago.conceptos.nombre", "Concepto")} hint={t("ui.RolesDePago.novedades.conceptoHint", "Opcional: el concepto del catálogo con el que sale en el rol.")}>
          <select className={FIELD_CLS} value={conceptId} onChange={(e) => setConceptId(e.target.value)}>
            <option value="">{t("ui.RolesDePago.novedades.conceptoPorTipo", "Según el tipo")}</option>
            {candidatos.map((c) => <option key={c.id} value={c.id}>{nombreDeConcepto(c.name, i18n.language)}</option>)}
          </select>
        </FormField>
        <FormField label={t("ui.RolesDePago.novedades.importeEn", "Importe ({{moneda}})", { moneda })} required>
          <MoneyInput cents={cents} className={`${FIELD_CLS} tabular-nums`} decimals={decimals} onCents={setCents} />
        </FormField>
        <FormField label={t("ui.RolesDePago.novedades.desde", "Para el periodo que empieza el")} hint={t("ui.RolesDePago.novedades.desdeHint", "Vacío = la próxima planilla.")}>
          <input className={FIELD_CLS} type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
        </FormField>
        <FormField full label={t("ui.RolesDePago.conceptos.nota", "Nota")}>
          <input className={FIELD_CLS} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}

function PrestamoForm({ personas, moneda, decimals, onClose, onSaved }: { personas: PersonWithProfile[]; moneda: string; decimals: 0 | 2; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState("");
  const [principal, setPrincipal] = useState<number | null>(null);
  const [installments, setInstallments] = useState(1);
  const [cuota, setCuota] = useState<number | null>(null);
  const [startsOn, setStartsOn] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const cuotaSugerida = principal && installments ? Math.ceil(principal / installments) : null;

  const guardar = async () => {
    setSaving(true);
    try {
      await payrollSlipsService.createLoan({ userId, principalCents: principal || 0, installments, installmentCents: cuota || cuotaSugerida || 0, startsOn: startsOn || undefined, note: note || null });
      toast.success(t("ui.RolesDePago.prestamos.guardado", "Préstamo guardado"));
      onSaved();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open size="md" title={t("ui.RolesDePago.prestamos.nuevo", "Nuevo préstamo")} onOpenChange={(o) => { if (!o) onClose(); }}
      footer={<div className="cg-acciones justify-end"><Button variant="outline" onClick={onClose}>{t("ui.RolesDePago.cancelar", "Cancelar")}</Button><Button disabled={saving || !userId || !principal} variant="brand" onClick={guardar}>{saving ? t("ui.RolesDePago.guardando", "Guardando…") : t("ui.RolesDePago.guardar", "Guardar")}</Button></div>}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField full label={t("ui.RolesDePago.perfiles.persona", "Persona")} required><SelectorDePersona personas={personas} value={userId} onChange={setUserId} /></FormField>
        <FormField label={t("ui.RolesDePago.prestamos.capitalEn", "Capital ({{moneda}})", { moneda })} required>
          <MoneyInput cents={principal} className={`${FIELD_CLS} tabular-nums`} decimals={decimals} onCents={setPrincipal} />
        </FormField>
        <FormField label={t("ui.RolesDePago.prestamos.cuotas", "Cuotas")}>
          <input className={`${FIELD_CLS} tabular-nums`} max={120} min={1} type="number" value={installments} onChange={(e) => setInstallments(Math.max(1, Math.min(120, Number(e.target.value) || 1)))} />
        </FormField>
        <FormField label={t("ui.RolesDePago.prestamos.cuotaEn", "Cuota ({{moneda}})", { moneda })} hint={cuotaSugerida ? t("ui.RolesDePago.prestamos.cuotaSugerida", "Vacío = {{cuota}} por cuota", { cuota: dinero(cuotaSugerida, moneda, decimals) }) : undefined}>
          <MoneyInput cents={cuota} className={`${FIELD_CLS} tabular-nums`} decimals={decimals} onCents={setCuota} />
        </FormField>
        <FormField label={t("ui.RolesDePago.prestamos.desde", "Primera cuota en la planilla que termine desde")}>
          <input className={FIELD_CLS} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </FormField>
        <FormField full label={t("ui.RolesDePago.conceptos.nota", "Nota")}>
          <input className={FIELD_CLS} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
