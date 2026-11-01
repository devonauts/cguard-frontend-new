/**
 * ROLES DE PAGO — el catálogo de conceptos de la empresa (editor dinámico,
 * decisión del dueño D1): ingresos, deducciones, aportes del empleador e
 * informativos. Nace de la plantilla del país; la empresa crea, renombra,
 * apaga o cambia cómo se calcula cada uno.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListChecks, Plus, RefreshCw } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, Section, SkeletonCards, EmptyState, Modal, FormField, FIELD_CLS, StatusBadge } from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import payrollSlipsService, {
  type PayrollConcept, type ConceptKind, type ConceptMethod, type ConceptBase, type HoursOf,
} from "@/lib/api/payrollSlipsService";
import { PresentacionDelModulo, usePayrollAccess, nombreDeConcepto, dinero, aCentavos, deCentavos, useEtiquetas } from "./comun";

const KINDS: ConceptKind[] = ["earning", "deduction", "employer", "info"];
const METHODS: ConceptMethod[] = ["fixed", "percent", "hours", "days", "table", "manual"];
const BASES: ConceptBase[] = ["base_salary", "gross", "ss_base", "tax_base", "legal_minimum", "net"];
const HOURS: HoursOf[] = ["ordinary", "overtime1", "overtime2", "night", "holiday", "rest_day", "sunday", "saturday", "double_shift", "night_overtime"];

export default function CatalogoDeConceptos() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const etiquetas = useEtiquetas();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("payrollSlipEdit");
  const acceso = usePayrollAccess();
  const conceptos = useQuery({ queryKey: ["payroll-slips", "concepts"], queryFn: () => payrollSlipsService.concepts(true), retry: false, enabled: acceso.full });
  const vista = useQuery({ queryKey: ["payroll-slips", "settings"], queryFn: () => payrollSlipsService.settings(), retry: false, enabled: acceso.full });
  const modo = acceso.resolve(conceptos.error);
  const sinModulo = modo !== "full";
  const [editando, setEditando] = useState<Partial<PayrollConcept> | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const settings = vista.data?.settings;
  const moneda = settings?.currency || "USD";
  const decimals = settings?.decimals ?? 2;

  const grupos = useMemo(() => {
    const filas = conceptos.data?.rows ?? [];

    return KINDS.map((k) => ({ kind: k, filas: filas.filter((c) => c.kind === k) })).filter((g) => g.filas.length);
  }, [conceptos.data]);

  const refrescar = () => qc.invalidateQueries({ queryKey: ["payroll-slips"] });

  const alternar = async (c: PayrollConcept) => {
    try {
      await payrollSlipsService.updateConcept(c.id, { active: !c.active });
      await refrescar();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    }
  };

  const sembrar = async () => {
    setOcupado(true);
    try {
      const r = await payrollSlipsService.seedConcepts();

      toast.success(t("ui.RolesDePago.conceptos.sembrados", "{{n}} conceptos añadidos desde la plantilla del país", { n: r.added }));
      await refrescar();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setOcupado(false);
    }
  };

  const describir = (c: PayrollConcept) => {
    const rate = c.rate === null || c.rate === undefined ? null : Number(c.rate);

    switch (c.method) {
      case "fixed": return rate !== null ? dinero(rate, moneda, decimals) : etiquetas.method.fixed;
      case "percent": return `${rate ?? 0} % · ${c.base ? etiquetas.base[c.base] : ""}`;
      case "hours": return `${c.hoursOf ? etiquetas.hours[c.hoursOf] : ""} · +${rate ?? 0} %`;
      case "days": return etiquetas.method.days;
      case "table": return etiquetas.method.table;
      default: return etiquetas.method.manual;
    }
  };

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          icon={<ListChecks />}
          title={t("ui.RolesDePago.conceptos.titulo", "Conceptos de nómina")}
          subtitle={t("ui.RolesDePago.conceptos.subtitulo", "Lo que suma y lo que resta en cada rol. Crea los tuyos, renombra o apaga los del país; el código oficial sale en el documento y en el Excel.")}
          actions={
            !sinModulo && canEdit ? (
              <div className="cg-acciones">
                <Button disabled={ocupado} variant="outline" onClick={sembrar}><RefreshCw size={14} /> {t("ui.RolesDePago.conceptos.completarDesdePais", "Completar desde el país")}</Button>
                <Button variant="brand" onClick={() => setEditando({ kind: "earning", method: "fixed", affectsSocialSecurity: true, affectsIncomeTax: true, recurring: false, active: true })}><Plus size={14} /> {t("ui.RolesDePago.conceptos.nuevo", "Nuevo concepto")}</Button>
              </div>
            ) : undefined
          }
        />
        {sinModulo ? (
          <PresentacionDelModulo modo={modo} />
        ) : conceptos.isLoading ? (
          <SkeletonCards count={3} />
        ) : !grupos.length ? (
          <EmptyState
            icon={<ListChecks />}
            title={t("ui.RolesDePago.conceptos.vacio", "Todavía no hay conceptos")}
            description={t("ui.RolesDePago.conceptos.vacioDesc", "Elige el país en Configuración o pulsa «Completar desde el país» para cargar la plantilla.")}
            action={canEdit ? <Button variant="brand" onClick={sembrar}>{t("ui.RolesDePago.conceptos.completarDesdePais", "Completar desde el país")}</Button> : undefined}
          />
        ) : (
          <div className="space-y-4">
            {grupos.map((g) => (
              <Section key={g.kind} title={etiquetas.kind[g.kind]}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="cg-eyebrow text-left">
                        <th className="px-2 py-1.5">{t("ui.RolesDePago.conceptos.codigo", "Código")}</th>
                        <th className="px-2 py-1.5">{t("ui.RolesDePago.conceptos.nombre", "Nombre")}</th>
                        <th className="px-2 py-1.5">{t("ui.RolesDePago.conceptos.calculo", "Cálculo")}</th>
                        <th className="px-2 py-1.5">{t("ui.RolesDePago.conceptos.afecta", "Afecta a")}</th>
                        <th className="px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {g.filas.map((c) => (
                        <tr key={c.id} className="border-t" style={{ borderColor: "var(--hairline)", opacity: c.active ? 1 : 0.55 }}>
                          <td className="px-2 py-2 font-mono text-xs">
                            {c.code}
                            {c.officialCode && <span className="ml-1" style={{ color: "var(--ink-faint)" }}>· {c.officialCode}</span>}
                          </td>
                          <td className="px-2 py-2">
                            <div className="font-medium">{nombreDeConcepto(c.name, i18n.language)}</div>
                            {c.note && <div className="text-xs" style={{ color: "var(--ink-faint)" }}>{c.note}</div>}
                          </td>
                          <td className="px-2 py-2 tabular-nums">{describir(c)}{c.recurring ? ` · ${t("ui.RolesDePago.conceptos.cadaPeriodo", "cada periodo")}` : ""}</td>
                          <td className="px-2 py-2">
                            <div className="flex flex-wrap gap-1">
                              {c.affectsSocialSecurity && <StatusBadge tone="neutral">{t("ui.RolesDePago.conceptos.ss", "Seg. social")}</StatusBadge>}
                              {c.affectsIncomeTax && <StatusBadge tone="neutral">{t("ui.RolesDePago.conceptos.renta", "Renta")}</StatusBadge>}
                              {!c.active && <StatusBadge tone="warn">{t("ui.RolesDePago.conceptos.apagado", "Apagado")}</StatusBadge>}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right">
                            {canEdit && (
                              <div className="cg-acciones justify-end">
                                <Button size="sm" variant="ghost" onClick={() => alternar(c)}>{c.active ? t("ui.RolesDePago.conceptos.apagar", "Apagar") : t("ui.RolesDePago.conceptos.encender", "Encender")}</Button>
                                <Button size="sm" variant="outline" onClick={() => setEditando(c)}>{t("ui.RolesDePago.editar", "Editar")}</Button>
                              </div>
                            )}
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
        {editando && (
          <ConceptoForm
            inicial={editando}
            moneda={moneda}
            decimals={decimals}
            onClose={() => setEditando(null)}
            onSaved={async () => { setEditando(null); await refrescar(); }}
          />
        )}
      </PageContainer>
    </AppLayout>
  );
}

function ConceptoForm({ inicial, moneda, decimals, onClose, onSaved }: { inicial: Partial<PayrollConcept>; moneda: string; decimals: 0 | 2; onClose: () => void; onSaved: () => void }) {
  const { t, i18n } = useTranslation();
  const etiquetas = useEtiquetas();
  const [c, setC] = useState<Partial<PayrollConcept>>({ ...inicial });
  const [nombre, setNombre] = useState(nombreDeConcepto(inicial.name, i18n.language));
  const [importe, setImporte] = useState(inicial.method === "fixed" ? deCentavos(inicial.rate as number | null, decimals) : String(inicial.rate ?? ""));
  const [saving, setSaving] = useState(false);
  const esNuevo = !inicial.id;
  const set = <K extends keyof PayrollConcept>(k: K, v: PayrollConcept[K]) => setC((x) => ({ ...x, [k]: v }));

  const guardar = async () => {
    setSaving(true);
    try {
      const lang = String(i18n.language || "es").slice(0, 2);
      const name = { ...(typeof inicial.name === "object" && inicial.name ? inicial.name : {}), [lang]: nombre, ...(lang !== "es" && !(inicial.name as Record<string, string> | undefined)?.es ? { es: nombre } : {}) };
      const rate = c.method === "fixed" ? aCentavos(importe) : (importe === "" ? null : Number(importe));
      const datos = { ...c, name, rate };

      if (esNuevo) await payrollSlipsService.createConcept(datos);
      else await payrollSlipsService.updateConcept(inicial.id as string, datos);
      toast.success(t("ui.RolesDePago.conceptos.guardado", "Concepto guardado"));
      onSaved();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  const borrar = async () => {
    if (!inicial.id) return;
    setSaving(true);
    try {
      const r = await payrollSlipsService.deleteConcept(inicial.id);

      toast.success(r.deactivated ? t("ui.RolesDePago.conceptos.apagadoPorUso", "Ya se usó en algún rol: queda apagado en vez de borrado") : t("ui.RolesDePago.conceptos.borrado", "Concepto borrado"));
      onSaved();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      title={esNuevo ? t("ui.RolesDePago.conceptos.nuevo", "Nuevo concepto") : nombreDeConcepto(inicial.name, i18n.language)}
      onOpenChange={(o) => { if (!o) onClose(); }}
      footer={
        <div className="cg-acciones justify-between">
          <div>{!esNuevo && <Button disabled={saving} variant="ghost" onClick={borrar}>{t("ui.RolesDePago.conceptos.borrar", "Borrar")}</Button>}</div>
          <div className="cg-acciones">
            <Button variant="outline" onClick={onClose}>{t("ui.RolesDePago.cancelar", "Cancelar")}</Button>
            <Button disabled={saving || !nombre.trim()} variant="brand" onClick={guardar}>{saving ? t("ui.RolesDePago.guardando", "Guardando…") : t("ui.RolesDePago.guardar", "Guardar")}</Button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t("ui.RolesDePago.conceptos.nombre", "Nombre")} required>
          <input className={FIELD_CLS} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </FormField>
        <FormField label={t("ui.RolesDePago.conceptos.codigo", "Código")} hint={t("ui.RolesDePago.conceptos.codigoHint", "Letras, números y guion bajo; sale en el Excel.")}>
          <input className={`${FIELD_CLS} font-mono uppercase`} maxLength={24} value={c.code || ""} onChange={(e) => set("code", e.target.value.toUpperCase())} />
        </FormField>
        <FormField label={t("ui.RolesDePago.conceptos.codigoOficial", "Código oficial (opcional)")} hint={t("ui.RolesDePago.conceptos.codigoOficialHint", "El del organismo de tu país (SAT, SUNAT, LRE, eSocial…).")}>
          <input className={`${FIELD_CLS} font-mono`} maxLength={24} value={c.officialCode || ""} onChange={(e) => set("officialCode", e.target.value || null)} />
        </FormField>
        <FormField label={t("ui.RolesDePago.conceptos.tipo", "Tipo")}>
          <select className={FIELD_CLS} value={c.kind || "earning"} onChange={(e) => set("kind", e.target.value as ConceptKind)}>
            {KINDS.map((k) => <option key={k} value={k}>{etiquetas.kind[k]}</option>)}
          </select>
        </FormField>
        <FormField label={t("ui.RolesDePago.conceptos.calculo", "Cálculo")}>
          <select className={FIELD_CLS} value={c.method || "manual"} onChange={(e) => set("method", e.target.value as ConceptMethod)}>
            {METHODS.filter((m) => m !== "table").map((m) => <option key={m} value={m}>{etiquetas.method[m]}</option>)}
            {c.method === "table" && <option value="table">{etiquetas.method.table}</option>}
          </select>
        </FormField>
        {c.method === "fixed" && (
          <FormField label={t("ui.RolesDePago.conceptos.importe", "Importe ({{moneda}})", { moneda })}>
            <input className={`${FIELD_CLS} tabular-nums`} inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} />
          </FormField>
        )}
        {(c.method === "percent" || c.method === "hours") && (
          <FormField label={c.method === "hours" ? t("ui.RolesDePago.conceptos.recargo", "Recargo sobre la hora (%)") : t("ui.RolesDePago.conceptos.porcentaje", "Porcentaje")}>
            <input className={`${FIELD_CLS} tabular-nums`} inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} />
          </FormField>
        )}
        {c.method === "percent" && (
          <FormField label={t("ui.RolesDePago.conceptos.base", "Sobre qué base")}>
            <select className={FIELD_CLS} value={c.base || "ss_base"} onChange={(e) => set("base", e.target.value as ConceptBase)}>
              {BASES.map((b) => <option key={b} value={b}>{etiquetas.base[b]}</option>)}
            </select>
          </FormField>
        )}
        {c.method === "hours" && (
          <FormField label={t("ui.RolesDePago.conceptos.queHoras", "Qué horas")}>
            <select className={FIELD_CLS} value={c.hoursOf || "overtime1"} onChange={(e) => set("hoursOf", e.target.value as HoursOf)}>
              {HOURS.map((h) => <option key={h} value={h}>{etiquetas.hours[h]}</option>)}
            </select>
          </FormField>
        )}
        <label className="glass-flat flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
          <input checked={!!c.affectsSocialSecurity} className="cg-focus size-4" style={{ accentColor: "var(--brand)" }} type="checkbox" onChange={(e) => set("affectsSocialSecurity", e.target.checked)} />
          <span className="text-sm">{t("ui.RolesDePago.conceptos.afectaSS", "Entra en la base de seguridad social")}</span>
        </label>
        <label className="glass-flat flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
          <input checked={!!c.affectsIncomeTax} className="cg-focus size-4" style={{ accentColor: "var(--brand)" }} type="checkbox" onChange={(e) => set("affectsIncomeTax", e.target.checked)} />
          <span className="text-sm">{t("ui.RolesDePago.conceptos.afectaRenta", "Entra en la base de renta")}</span>
        </label>
        <label className="glass-flat flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
          <input checked={!!c.recurring} className="cg-focus size-4" style={{ accentColor: "var(--brand)" }} type="checkbox" onChange={(e) => set("recurring", e.target.checked)} />
          <span className="text-sm">{t("ui.RolesDePago.conceptos.recurrente", "Se aplica cada periodo sin cargarlo")}</span>
        </label>
        <label className="glass-flat flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
          <input checked={c.active !== false} className="cg-focus size-4" style={{ accentColor: "var(--brand)" }} type="checkbox" onChange={(e) => set("active", e.target.checked)} />
          <span className="text-sm">{t("ui.RolesDePago.conceptos.activo", "Activo")}</span>
        </label>
        <FormField full label={t("ui.RolesDePago.conceptos.nota", "Nota")}>
          <input className={FIELD_CLS} maxLength={300} value={c.note || ""} onChange={(e) => set("note", e.target.value || null)} />
        </FormField>
      </div>
    </Modal>
  );
}
