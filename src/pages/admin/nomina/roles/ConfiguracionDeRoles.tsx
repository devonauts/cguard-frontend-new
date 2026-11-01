/**
 * ROLES DE PAGO — la configuración de la empresa: país y moneda, sueldo base,
 * jornada y horas, dobladas, renta y el documento. Todo editable (decisión del
 * dueño D7: «que lo puedan adaptar a su país y deseo»).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Clock, FileText, Globe2, Percent, Repeat } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { Button } from "@/components/ui/button";
import { Section, FadeIn, SkeletonCards, InfoNote, FormField, FIELD_CLS } from "@/components/kit";
import { SaveBar } from "@/pages/admin/Configuration/components/SettingsForm";
import { usePermissions } from "@/hooks/usePermissions";
import payrollSlipsService, { type SlipSettings, type PayFrequency, type DoubleShiftMode, type TaxBracket } from "@/lib/api/payrollSlipsService";
import { PresentacionDelModulo, usePayrollAccess, nombreDePais, dinero, useEtiquetas, MoneyInput } from "./comun";

export default function ConfiguracionDeRoles() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const etiquetas = useEtiquetas();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("payrollSlipEdit");
  const acceso = usePayrollAccess();
  const vista = useQuery({ queryKey: ["payroll-slips", "settings"], queryFn: () => payrollSlipsService.settings(), retry: false, enabled: acceso.full });
  const modo = acceso.resolve(vista.error);
  const sinModulo = modo !== "full";
  const [s, setS] = useState<SlipSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (vista.data) setS(vista.data.settings); }, [vista.data]);

  const set = <K extends keyof SlipSettings>(k: K, v: SlipSettings[K]) => setS((f) => (f ? { ...f, [k]: v } : f));
  const num = (k: keyof SlipSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (Number(e.target.value) || 0) as never);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const r = await payrollSlipsService.saveSettings(s);

      setS(r.settings);
      await qc.invalidateQueries({ queryKey: ["payroll-slips"] });
      toast.success(t("comun.configuracionGuardada"));
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  const cambiarPais = async (code: string) => {
    if (!code) return;
    setSaving(true);
    try {
      const r = await payrollSlipsService.applyCountry(code, true);

      setS(r.settings);
      await qc.invalidateQueries({ queryKey: ["payroll-slips"] });
      toast.success(t("ui.RolesDePago.config.paisCambiado", "Plantilla de {{pais}} aplicada; se añadieron {{n}} conceptos", { pais: nombreDePais(code, i18n.language), n: r.seeded.added }));
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  const paises = (vista.data?.countries ?? []).map((c) => ({ code: c, nombre: nombreDePais(c, i18n.language) })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const tpl = vista.data?.template;

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title={t("ui.RolesDePago.config.titulo", "Roles de pago")}>
        {sinModulo ? (
          <PresentacionDelModulo modo={modo} />
        ) : vista.isLoading || !s ? (
          <SkeletonCards count={4} />
        ) : (
          <FadeIn className="space-y-4 pb-28">
            <Section icon={<Globe2 />} title={t("ui.RolesDePago.config.paisTitulo", "País y moneda")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label={t("ui.RolesDePago.asistente.pais", "País")} hint={t("ui.RolesDePago.config.paisHint", "Cambiar de país propone la jornada, los recargos y los conceptos de ese país. Los conceptos del país anterior se reemplazan; los que creaste tú se quedan.")}>
                  <select className={FIELD_CLS} disabled={!canEdit || saving} value={s.countryCode} onChange={(e) => cambiarPais(e.target.value)}>
                    <option value="">{t("ui.RolesDePago.asistente.elige", "Elige…")}</option>
                    {paises.map((p) => <option key={p.code} value={p.code}>{p.nombre}</option>)}
                  </select>
                </FormField>
                <FormField hint={t("ui.RolesDePago.config.monedaUnica", "Es la moneda de toda la empresa: también la de Ajustes de asistencia.")} label={t("ui.RolesDePago.config.monedaIso", "Moneda (código ISO)")}>
                  <input className={FIELD_CLS} disabled={!canEdit} maxLength={3} value={s.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
                </FormField>
                <FormField label={t("ui.RolesDePago.config.decimales", "Decimales")}>
                  <select className={FIELD_CLS} disabled={!canEdit} value={s.decimals} onChange={(e) => set("decimals", Number(e.target.value) === 0 ? 0 : 2)}>
                    <option value={2}>2</option>
                    <option value={0}>0</option>
                  </select>
                </FormField>
                <FormField label={t("ui.RolesDePago.config.frecuencia", "Frecuencia de pago")}>
                  <select className={FIELD_CLS} disabled={!canEdit} value={s.frequency} onChange={(e) => set("frequency", e.target.value as PayFrequency)}>
                    {(Object.keys(etiquetas.frequency) as PayFrequency[]).map((f) => <option key={f} value={f}>{etiquetas.frequency[f]}</option>)}
                  </select>
                </FormField>
              </div>
              {tpl && tpl.notes.length > 0 && (
                <p className="mt-3 text-xs" style={{ color: "var(--ink-faint)" }}>
                  {t("ui.RolesDePago.asistente.verificado", "Cifras de referencia revisadas el {{fecha}}.", { fecha: tpl.verifiedAt })} {tpl.notes.join(" · ")}
                </p>
              )}
            </Section>

            <Section icon={<Building2 />} title={t("ui.RolesDePago.config.sueldoTitulo", "Sueldo base y mínimo")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label={t("ui.RolesDePago.config.sueldoGlobal", "Sueldo base de la empresa ({{moneda}}/mes)", { moneda: s.currency })} hint={t("ui.RolesDePago.config.sueldoGlobalHint", "Lo cobra quien no tenga sueldo propio en su perfil. Puedes dejarlo vacío si todos tienen el suyo.")}>
                  <MoneyInput cents={s.globalBaseSalaryCents || null} className={`${FIELD_CLS} tabular-nums`} decimals={s.decimals} disabled={!canEdit} onCents={(c) => set("globalBaseSalaryCents", c || 0)} />
                </FormField>
                <FormField label={t("ui.RolesDePago.config.minimo", "Mínimo legal de referencia ({{moneda}}/mes)", { moneda: s.currency })} hint={tpl?.minimumNote || t("ui.RolesDePago.config.minimoHint", "Solo para avisar si un sueldo queda por debajo.")}>
                  <MoneyInput cents={s.legalMinimumCents || null} className={`${FIELD_CLS} tabular-nums`} decimals={s.decimals} disabled={!canEdit} onCents={(c) => set("legalMinimumCents", c || 0)} />
                </FormField>
              </div>
              {s.globalBaseSalaryCents > 0 && s.legalMinimumCents > 0 && s.globalBaseSalaryCents < s.legalMinimumCents && (
                <InfoNote className="mt-3" tone="warn">
                  {t("ui.RolesDePago.config.bajoMinimo", "El sueldo base ({{sueldo}}) queda por debajo del mínimo de referencia ({{minimo}}).", { sueldo: dinero(s.globalBaseSalaryCents, s.currency, s.decimals), minimo: dinero(s.legalMinimumCents, s.currency, s.decimals) })}
                </InfoNote>
              )}
            </Section>

            <Section icon={<Clock />} title={t("ui.RolesDePago.config.jornadaTitulo", "Jornada y horas")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label={t("ui.RolesDePago.config.jornadaSemanal", "Jornada semanal (horas)")}>
                  <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} type="number" value={s.weeklyHours} onChange={num("weeklyHours")} />
                </FormField>
                <FormField label={t("ui.RolesDePago.config.jornadaDiaria", "Jornada diaria (horas)")}>
                  <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} type="number" value={s.dailyHours} onChange={num("dailyHours")} />
                </FormField>
                <FormField label={t("ui.RolesDePago.config.divisor", "Divisor de valor hora")} hint={t("ui.RolesDePago.config.divisorHint", "Sueldo mensual ÷ este número = valor hora. 0 = horas reales del periodo.")}>
                  <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} type="number" value={s.hourDivisor} onChange={num("hourDivisor")} />
                </FormField>
                <FormField label={t("ui.RolesDePago.config.nocturnaReducida", "Jornada nocturna reducida (horas)")} hint={t("ui.RolesDePago.config.nocturnaReducidaHint", "Países donde la noche tiene menos horas pagadas como jornada completa (MX 7, CR 6…). 0 = no aplica.")}>
                  <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} type="number" value={s.nightShiftHours} onChange={num("nightShiftHours")} />
                </FormField>
                <FormField label={t("ui.RolesDePago.config.umbralSemanal", "Horas extra a partir de (semana)")} hint={t("ui.RolesDePago.config.umbralSemanalHint", "0 = sin regla semanal; solo cuenta la diaria de la política de horas.")}>
                  <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} type="number" value={s.weeklyOvertimeThreshold} onChange={num("weeklyOvertimeThreshold")} />
                </FormField>
                <FormField label={t("ui.RolesDePago.config.exento", "Puestos no sujetos a jornada: tope diario")} hint={t("ui.RolesDePago.config.exentoHint", "Vigilancia en varios países: hasta estas horas no hay extras. 0 = no existe.")}>
                  <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} type="number" value={s.exemptMaxDailyHours} onChange={num("exemptMaxDailyHours")} />
                </FormField>
                <FormField label={t("ui.RolesDePago.config.maxTurno", "Tope legal de horas por turno (aviso)")}>
                  <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} type="number" value={s.maxShiftHours} onChange={num("maxShiftHours")} />
                </FormField>
              </div>
              <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
                {t("ui.RolesDePago.config.recargosDonde", "Los porcentajes de horas extra, nocturnas, domingos y feriados se editan en")}{" "}
                <a className="underline" href="/nomina/settings">{t("ui.RolesDePago.config.politicaDeHoras", "Configuración de asistencia › Política de pago")}</a>
                {" "}{t("ui.RolesDePago.config.recargosYConceptos", "y los importes de cada concepto en")}{" "}
                <a className="underline" href="/nomina/roles/conceptos">{t("ui.RolesDePago.portada.catalogo", "Conceptos")}</a>.
              </p>
            </Section>

            <Section icon={<Repeat />} title={t("ui.RolesDePago.config.dobladaTitulo", "Dobladas (turnos dobles y de 24 h)")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label={t("ui.RolesDePago.config.doblada", "Cómo se paga una doblada (turno doble)")}>
                  <select className={FIELD_CLS} disabled={!canEdit} value={s.doubleShift.mode} onChange={(e) => set("doubleShift", { ...s.doubleShift, mode: e.target.value as DoubleShiftMode })}>
                    {(Object.keys(etiquetas.doubleShift) as DoubleShiftMode[]).map((m) => <option key={m} value={m}>{etiquetas.doubleShift[m]}</option>)}
                  </select>
                </FormField>
                {s.doubleShift.mode === "bonus" && (
                  <>
                    <FormField label={t("ui.RolesDePago.config.premioDoblada", "Premio por doblete (% del turno)")}>
                      <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} type="number" value={s.doubleShift.bonusPct} onChange={(e) => set("doubleShift", { ...s.doubleShift, bonusPct: Number(e.target.value) || 0 })} />
                    </FormField>
                    <FormField label={t("ui.RolesDePago.config.premioDobladaFijo", "o importe fijo por doblete ({{moneda}})", { moneda: s.currency })}>
                      <MoneyInput cents={s.doubleShift.bonusCents || null} className={`${FIELD_CLS} tabular-nums`} decimals={s.decimals} disabled={!canEdit} onCents={(c) => set("doubleShift", { ...s.doubleShift, bonusCents: c || 0 })} />
                    </FormField>
                  </>
                )}
                {s.doubleShift.mode === "overtime" ? (
                  <label className="glass-flat flex cursor-pointer items-center gap-2.5 px-3 py-2.5 sm:col-span-2">
                    <input checked={s.doubleShift.listSeparately} className="cg-focus size-4" disabled={!canEdit} style={{ accentColor: "var(--brand)" }} type="checkbox" onChange={(e) => set("doubleShift", { ...s.doubleShift, listSeparately: e.target.checked })} />
                    <span className="text-sm">{t("ui.RolesDePago.config.dobladaAparte", "Listar las dobladas en el rol como concepto aparte del horario normal")}</span>
                  </label>
                ) : (
                  <p className="text-sm sm:col-span-2" style={{ color: "var(--ink-soft)" }}>{t("ui.RolesDePago.config.dobladaSiempreAparte", "Con esta forma de pago la doblada siempre sale en su propia línea del rol («Premio por doblada»).")}</p>
                )}
              </div>
              <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>{t("ui.RolesDePago.config.dobladaComoSeCuenta", "Hay doblada cuando alguien trabaja en un día 1,5 veces o más su turno habitual (el que le marca el horario). 24 h sobre turnos de 12 es una doblada; 36 h es una tripleta y cuenta como dos turnos extra. Un turno de 24 h programado no es doblada.")}</p>
            </Section>

            <Section icon={<Repeat />} title={t("ui.RolesDePago.config.horasTarjetaTitulo", "Horas de la tarjeta que paga el rol")}>
              <p className="mb-3 text-sm" style={{ color: "var(--ink-soft)" }}>
                {t("ui.RolesDePago.config.horasTarjetaAyuda", "La tarjeta las calcula siempre; el rol sólo las paga si lo activas. Los roles ya aprobados no cambian.")}
              </p>
              <div className="space-y-2">
                <label className="glass-flat flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
                  <input
                    checked={!!s.cardHours?.restDay}
                    className="cg-focus size-4"
                    disabled={!canEdit}
                    style={{ accentColor: "var(--brand)" }}
                    type="checkbox"
                    onChange={(e) => set("cardHours", { restDay: e.target.checked, nightOvertime: !!s.cardHours?.nightOvertime })}
                  />
                  <span className="text-sm">{t("ui.RolesDePago.config.pagarDescanso", "Pagar las horas trabajadas en el día de descanso (concepto «Horas en día de descanso»)")}</span>
                </label>
                <label className="glass-flat flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
                  <input
                    checked={!!s.cardHours?.nightOvertime}
                    className="cg-focus size-4"
                    disabled={!canEdit}
                    style={{ accentColor: "var(--brand)" }}
                    type="checkbox"
                    onChange={(e) => set("cardHours", { restDay: !!s.cardHours?.restDay, nightOvertime: e.target.checked })}
                  />
                  <span className="text-sm">{t("ui.RolesDePago.config.pagarExtraNocturna", "Pagar la hora extra nocturna en su propia línea (necesita un concepto de «Horas extra nocturnas»)")}</span>
                </label>
              </div>
            </Section>

            <Section icon={<Percent />} title={t("ui.RolesDePago.config.rentaTitulo", "Impuesto a la renta")}>
              <Renta s={s} canEdit={canEdit} onChange={(v) => set("incomeTax", v)} />
            </Section>

            <Section icon={<FileText />} title={t("ui.RolesDePago.config.documentoTitulo", "El documento")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label={t("ui.RolesDePago.config.prefijo", "Prefijo de numeración")}>
                  <input className={FIELD_CLS} disabled={!canEdit} maxLength={8} value={s.document.prefix} onChange={(e) => set("document", { ...s.document, prefix: e.target.value.toUpperCase() })} />
                </FormField>
                <FormField label={t("ui.RolesDePago.config.siguienteNumero", "Siguiente número")} hint={t("ui.RolesDePago.config.numeroEjemplo", "Ejemplo: {{ejemplo}}", { ejemplo: `${s.document.prefix}-${new Date().getFullYear()}-${String(s.document.nextNumber).padStart(s.document.padding, "0")}` })}>
                  <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} min={1} type="number" value={s.document.nextNumber} onChange={(e) => set("document", { ...s.document, nextNumber: Math.max(1, Number(e.target.value) || 1) })} />
                </FormField>
                <FormField label={t("ui.RolesDePago.config.relleno", "Dígitos del número")}>
                  <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} max={10} min={1} type="number" value={s.document.padding} onChange={(e) => set("document", { ...s.document, padding: Math.min(10, Math.max(1, Number(e.target.value) || 6)) })} />
                </FormField>
                <FormField label={t("ui.RolesDePago.config.idioma", "Idioma del PDF")} hint={t("ui.RolesDePago.config.idiomaHint", "Vacío = el de la empresa.")}>
                  <select className={FIELD_CLS} disabled={!canEdit} value={s.document.language} onChange={(e) => set("document", { ...s.document, language: e.target.value })}>
                    <option value="">{t("ui.RolesDePago.config.idiomaEmpresa", "El de la empresa")}</option>
                    {["es", "en", "pt", "fr", "de", "it", "nl", "pl"].map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                  </select>
                </FormField>
                <FormField full label={t("ui.RolesDePago.config.pie", "Texto al pie del rol")}>
                  <input className={FIELD_CLS} disabled={!canEdit} maxLength={600} value={s.document.footer} onChange={(e) => set("document", { ...s.document, footer: e.target.value })} />
                </FormField>
                <Toggle checked={s.document.official} disabled={!canEdit} label={t("ui.RolesDePago.config.oficial", "Documento oficial: con logo, datos legales de la empresa y del trabajador, códigos oficiales y bases")} hint={t("ui.RolesDePago.config.oficialHint", "Apagado: comprobante interno con la leyenda «no oficial».")} onChange={(v) => set("document", { ...s.document, official: v })} />
                <Toggle checked={s.document.showEmployerCost} disabled={!canEdit} label={t("ui.RolesDePago.config.mostrarEmpleador", "Mostrar los aportes del empleador (informativo)")} onChange={(v) => set("document", { ...s.document, showEmployerCost: v })} />
                <Toggle checked={s.document.showProvisions} disabled={!canEdit} label={t("ui.RolesDePago.config.mostrarProvisiones", "Mostrar las provisiones acumuladas (décimos, aguinaldo, cesantías…)")} onChange={(v) => set("document", { ...s.document, showProvisions: v })} />
                <Toggle checked={s.document.showNetInWords} disabled={!canEdit} label={t("ui.RolesDePago.config.netoEnLetras", "Escribir el neto en letras")} onChange={(v) => set("document", { ...s.document, showNetInWords: v })} />
              </div>
            </Section>
          </FadeIn>
        )}
        {!sinModulo && s && canEdit && <SaveBar saving={saving} onSave={save} />}
      </SettingsLayout>
    </AppLayout>
  );
}

function Toggle({ checked, disabled, label, hint, onChange }: { checked: boolean; disabled?: boolean; label: string; hint?: string; onChange: (v: boolean) => void }) {
  return (
    <label className="glass-flat flex cursor-pointer items-start gap-2.5 px-3 py-2.5 sm:col-span-2">
      <input checked={checked} className="cg-focus mt-0.5 size-4" disabled={disabled} style={{ accentColor: "var(--brand)" }} type="checkbox" onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm">
        {label}
        {hint && <span className="block text-xs" style={{ color: "var(--ink-faint)" }}>{hint}</span>}
      </span>
    </label>
  );
}

/** Cómo se calcula la renta: no / % fijo / tabla por tramos / se escribe en cada rol. */
function Renta({ s, canEdit, onChange }: { s: SlipSettings; canEdit: boolean; onChange: (v: SlipSettings["incomeTax"]) => void }) {
  const { t } = useTranslation();
  const r = s.incomeTax;
  const set = (p: Partial<SlipSettings["incomeTax"]>) => onChange({ ...r, ...p });
  const tabla = r.table ?? [];
  const setFila = (i: number, f: Partial<TaxBracket>) => set({ table: tabla.map((x, k) => (k === i ? { ...x, ...f } : x)) });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t("ui.RolesDePago.config.rentaModo", "Cómo se calcula")}>
          <select className={FIELD_CLS} disabled={!canEdit} value={r.kind} onChange={(e) => set({ kind: e.target.value as SlipSettings["incomeTax"]["kind"] })}>
            <option value="manual">{t("ui.RolesDePago.config.rentaManual", "Se escribe en cada rol (o % en el perfil)")}</option>
            <option value="none">{t("ui.RolesDePago.config.rentaNo", "No se retiene")}</option>
            <option value="flat">{t("ui.RolesDePago.config.rentaFija", "Porcentaje fijo")}</option>
            <option value="table">{t("ui.RolesDePago.config.rentaTabla", "Tabla por tramos")}</option>
          </select>
        </FormField>
        {r.kind === "flat" && (
          <FormField label={t("ui.RolesDePago.config.rentaPct", "Porcentaje")}>
            <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} inputMode="decimal" value={r.flatPct ?? 0} onChange={(e) => set({ flatPct: Number(e.target.value) || 0 })} />
          </FormField>
        )}
        {(r.kind === "flat" || r.kind === "table") && (
          <>
            <FormField label={t("ui.RolesDePago.config.rentaBase", "Sobre qué base")}>
              <select className={FIELD_CLS} disabled={!canEdit} value={r.base || "gross"} onChange={(e) => set({ base: e.target.value as "gross" | "gross_minus_ss" })}>
                <option value="gross">{t("ui.RolesDePago.config.rentaBaseBruto", "Ingresos gravados")}</option>
                <option value="gross_minus_ss">{t("ui.RolesDePago.config.rentaBaseMenosSS", "Ingresos gravados menos seguridad social")}</option>
              </select>
            </FormField>
            <FormField label={t("ui.RolesDePago.config.rentaPeriodo", "La tabla es…")}>
              <select className={FIELD_CLS} disabled={!canEdit} value={r.period || "monthly"} onChange={(e) => set({ period: e.target.value as "annual" | "monthly" })}>
                <option value="monthly">{t("ui.RolesDePago.config.rentaMensual", "Mensual")}</option>
                <option value="annual">{t("ui.RolesDePago.config.rentaAnual", "Anual (se proyecta el mes × 12)")}</option>
              </select>
            </FormField>
            <FormField label={t("ui.RolesDePago.config.rentaRebaja", "Rebaja fija antes de la tabla ({{moneda}})", { moneda: s.currency })}>
              <MoneyInput cents={r.allowance || null} className={`${FIELD_CLS} tabular-nums`} decimals={s.decimals} disabled={!canEdit} onCents={(c) => set({ allowance: c || 0 })} />
            </FormField>
            <FormField label={t("ui.RolesDePago.config.rentaCredito", "Crédito que se resta a la cuota ({{moneda}})", { moneda: s.currency })}>
              <MoneyInput cents={r.credit || null} className={`${FIELD_CLS} tabular-nums`} decimals={s.decimals} disabled={!canEdit} onCents={(c) => set({ credit: c || 0 })} />
            </FormField>
          </>
        )}
      </div>
      {r.kind === "table" && (
        <div className="space-y-2">
          <div className="cg-eyebrow">{t("ui.RolesDePago.config.tramos", "Tramos (hasta · % · cuota fija acumulada)")}</div>
          {tabla.map((f, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="cg-eyebrow">{t("ui.RolesDePago.config.tramoHasta", "Hasta")}</span>
                <MoneyInput cents={f.upTo} className={`${FIELD_CLS} w-40 tabular-nums`} decimals={s.decimals} disabled={!canEdit} placeholder="∞" onCents={(c) => setFila(i, { upTo: c })} />
              </label>
              <label className="block">
                <span className="cg-eyebrow">%</span>
                <input className={`${FIELD_CLS} w-24 tabular-nums`} disabled={!canEdit} inputMode="decimal" value={f.pct} onChange={(e) => setFila(i, { pct: Number(e.target.value) || 0 })} />
              </label>
              <label className="block">
                <span className="cg-eyebrow">{t("ui.RolesDePago.config.tramoFijo", "Cuota fija")}</span>
                <MoneyInput cents={f.fixed} className={`${FIELD_CLS} w-40 tabular-nums`} decimals={s.decimals} disabled={!canEdit} onCents={(c) => setFila(i, { fixed: c || 0 })} />
              </label>
              {canEdit && <Button size="sm" variant="outline" onClick={() => set({ table: tabla.filter((_, k) => k !== i) })}>{t("ui.NominaSettings.quitar", "Quitar")}</Button>}
            </div>
          ))}
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => set({ table: [...tabla, { upTo: null, pct: 0, fixed: 0 }] })}>
              {t("ui.RolesDePago.config.anadirTramo", "Añadir tramo")}
            </Button>
          )}
        </div>
      )}
      {r.note && <p className="text-xs" style={{ color: "var(--ink-faint)" }}>{r.note}</p>}
    </div>
  );
}
