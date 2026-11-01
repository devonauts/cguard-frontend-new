/**
 * LA TABLA DE PERFILES DE PAGO: una fila por persona, con el sueldo editable
 * en la misma fila (lo que el asistente necesita para poner en marcha una
 * empresa que ya tiene a su gente cargada) y la ficha completa en un modal.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, Segmented, SkeletonCards, StatusBadge, Modal, FormField, FIELD_CLS } from "@/components/kit";
import payrollSlipsService, {
  type PersonWithProfile, type PayrollProfile, type Population, type SlipSettings,
} from "@/lib/api/payrollSlipsService";
import { aCentavos, deCentavos, dinero, useEtiquetas, MoneyInput } from "./comun";
import { ErrorDeCarga } from "@/components/kit/ErrorDeCarga";

type Borrador = Partial<PayrollProfile> & { userId: string };

const PROFILE_VACIO: PayrollProfile = {
  employmentType: "employee", payBasis: "monthly", baseSalaryCents: null, currency: null, weeklyHours: null, hourDivisor: null,
  employeeNumber: null, jobTitle: null, hiredAt: null, socialSecurityNumber: null, pensionScheme: null, pensionProvider: null,
  healthProvider: null, dependents: 0, taxMode: "inherit", taxFlatPct: null, exemptFromSchedule: false, contractorRegime: null,
  contractorWithholdingPct: null, contractorIssuesInvoice: true, bankName: null, bankAccount: null, fixedConcepts: null, overrides: null, notes: null,
};

export function TablaDePerfiles({
  settings,
  compacta = false,
  canEdit,
  onSaved,
}: {
  settings: SlipSettings;
  /** En el asistente: sin cabecera ni filtros de más. */
  compacta?: boolean;
  canEdit: boolean;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const etiquetas = useEtiquetas();
  const [poblacion, setPoblacion] = useState<Population | "todas">("todas");
  const [soloSinSueldo, setSoloSinSueldo] = useState(false);
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [guardando, setGuardando] = useState(false);
  const [ficha, setFicha] = useState<PersonWithProfile | null>(null);

  const personas = useQuery({
    queryKey: ["payroll-slips", "people"],
    queryFn: () => payrollSlipsService.people(),
    staleTime: 30_000,
  });

  const filas = useMemo(() => {
    const todas = personas.data?.rows ?? [];

    return todas
      .filter((p) => poblacion === "todas" || p.population === poblacion)
      .filter((p) => !soloSinSueldo || !p.effective.hasSalary);
  }, [personas.data, poblacion, soloSinSueldo]);

  const decimals = settings.decimals;
  const moneda = settings.currency;
  const sinSueldo = (personas.data?.rows ?? []).filter((p) => !p.effective.hasSalary).length;

  const editar = (userId: string, cambio: Partial<PayrollProfile>) =>
    setBorradores((b) => ({ ...b, [userId]: { ...(b[userId] || { userId }), ...cambio } }));

  const valorDe = <K extends keyof PayrollProfile>(p: PersonWithProfile, campo: K): PayrollProfile[K] => {
    const b = borradores[p.userId];

    if (b && campo in b) return b[campo] as PayrollProfile[K];

    return (p.profile?.[campo] ?? PROFILE_VACIO[campo]) as PayrollProfile[K];
  };

  const pendientes = Object.keys(borradores).length;

  const guardar = async () => {
    if (!pendientes) return;
    setGuardando(true);
    try {
      const filasAGuardar = Object.values(borradores).map((b) => {
        const persona = (personas.data?.rows ?? []).find((p) => p.userId === b.userId);

        return { ...(persona?.profile || PROFILE_VACIO), ...b };
      });
      const r = await payrollSlipsService.saveProfiles(filasAGuardar);

      if (r.errors.length) {
        toast.error(t("ui.RolesDePago.perfiles.guardadoConErrores", "Se guardaron {{n}} y fallaron {{m}}: {{detalle}}", { n: r.saved, m: r.errors.length, detalle: r.errors[0]?.message }));
      } else {
        toast.success(t("ui.RolesDePago.perfiles.guardados", "{{n}} perfiles guardados", { n: r.saved }));
      }
      setBorradores({});
      await qc.invalidateQueries({ queryKey: ["payroll-slips"] });
      onSaved?.();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  };

  if (personas.isLoading) return <SkeletonCards count={3} />;

  return (
    <div className="space-y-3">
      {!compacta && (
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={poblacion}
            onChange={setPoblacion}
            options={[
              { value: "todas", label: t("ui.RolesDePago.perfiles.todas", "Todas") },
              { value: "vigilante", label: etiquetas.population.vigilante },
              { value: "supervisor", label: etiquetas.population.supervisor },
              { value: "oficina", label: etiquetas.population.oficina },
            ]}
          />
          <label className="glass-flat flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
            <input checked={soloSinSueldo} className="cg-focus size-4" style={{ accentColor: "var(--brand)" }} type="checkbox" onChange={(e) => setSoloSinSueldo(e.target.checked)} />
            {t("ui.RolesDePago.perfiles.soloSinSueldo", "Solo sin sueldo definido")}
            {sinSueldo > 0 && <StatusBadge tone="warn">{sinSueldo}</StatusBadge>}
          </label>
        </div>
      )}

      {personas.isError && !filas.length ? (
        <ErrorDeCarga onRetry={() => personas.refetch()} />
      ) : !filas.length ? (
        <EmptyState
          icon={<Users />}
          title={t("ui.RolesDePago.perfiles.vacio", "No hay personas que mostrar")}
          description={t("ui.RolesDePago.perfiles.vacioDesc", "Las personas activas de la empresa aparecen aquí con su sueldo y forma de pago.")}
        />
      ) : (
        <div className="glass overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="cg-eyebrow text-left">
                <th className="px-3 py-2">{t("ui.RolesDePago.perfiles.persona", "Persona")}</th>
                <th className="px-3 py-2">{t("ui.RolesDePago.perfiles.vinculo", "Vínculo")}</th>
                <th className="px-3 py-2">{t("ui.RolesDePago.perfiles.basePago", "Se paga por")}</th>
                <th className="px-3 py-2">{t("ui.RolesDePago.perfiles.sueldo", "Sueldo")}</th>
                <th className="px-3 py-2">{t("ui.RolesDePago.perfiles.cargo", "Cargo")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => {
                const tipo = valorDe(p, "employmentType");
                const basis = valorDe(p, "payBasis");
                const sueldo = valorDe(p, "baseSalaryCents");
                const hereda = sueldo === null || sueldo === undefined;

                return (
                  <tr key={p.userId} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs" style={{ color: "var(--ink-faint)" }}>{etiquetas.population[p.population]}</div>
                    </td>
                    <td className="px-3 py-2">
                      <select className={FIELD_CLS} disabled={!canEdit} value={tipo} onChange={(e) => editar(p.userId, { employmentType: e.target.value as PayrollProfile["employmentType"] })}>
                        <option value="employee">{t("ui.RolesDePago.perfiles.empleado", "Empleado")}</option>
                        <option value="contractor">{t("ui.RolesDePago.perfiles.contratista", "Contratista")}</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select className={FIELD_CLS} disabled={!canEdit} value={basis} onChange={(e) => editar(p.userId, { payBasis: e.target.value as PayrollProfile["payBasis"] })}>
                        <option value="monthly">{t("ui.RolesDePago.perfiles.mensual", "Mes")}</option>
                        <option value="hourly">{t("ui.RolesDePago.perfiles.porHora", "Hora")}</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <MoneyInput
                          cents={hereda ? null : sueldo}
                          className={`${FIELD_CLS} w-32 tabular-nums`}
                          decimals={decimals}
                          disabled={!canEdit}
                          placeholder={settings.globalBaseSalaryCents ? deCentavos(settings.globalBaseSalaryCents, decimals) : "—"}
                          onCents={(c) => editar(p.userId, { baseSalaryCents: c })}
                        />
                        <span className="text-xs" style={{ color: "var(--ink-faint)" }}>{moneda}</span>
                      </div>
                      {hereda && (
                        <div className="text-xs" style={{ color: settings.globalBaseSalaryCents ? "var(--ink-faint)" : "var(--warn)" }}>
                          {settings.globalBaseSalaryCents
                            ? t("ui.RolesDePago.perfiles.heredaGlobal", "Hereda el sueldo base: {{sueldo}}", { sueldo: dinero(settings.globalBaseSalaryCents, moneda, decimals) })
                            : t("ui.RolesDePago.perfiles.sinSueldo", "Sin sueldo: no se puede generar su rol")}
                        </div>
                      )}
                      {hereda && p.legacy.hourlyRateCents && (
                        <button
                          className="text-xs underline"
                          type="button"
                          onClick={() => editar(p.userId, { payBasis: "hourly", baseSalaryCents: p.legacy.hourlyRateCents })}
                        >
                          {t("ui.RolesDePago.perfiles.usarTarifaDeTarjetas", "Usar la tarifa de Tarjetas de nómina ({{tarifa}}/h)", { tarifa: dinero(p.legacy.hourlyRateCents, moneda, 2) })}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input className={`${FIELD_CLS} w-40`} disabled={!canEdit} value={valorDe(p, "jobTitle") || ""} onChange={(e) => editar(p.userId, { jobTitle: e.target.value || null })} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setFicha(p)} title={t("ui.RolesDePago.perfiles.fichaCompleta", "Ficha completa")}>
                        <Pencil size={14} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <div className="cg-acciones justify-end">
          <Button disabled={!pendientes || guardando} variant="brand" onClick={guardar}>
            {guardando
              ? t("ui.RolesDePago.guardando", "Guardando…")
              : pendientes
                ? t("ui.RolesDePago.perfiles.guardarN", "Guardar {{n}} cambios", { n: pendientes })
                : t("ui.RolesDePago.perfiles.sinCambios", "Sin cambios")}
          </Button>
        </div>
      )}

      {ficha && (
        <FichaDePago
          persona={ficha}
          settings={settings}
          canEdit={canEdit}
          onClose={() => setFicha(null)}
          onSaved={async () => {
            setFicha(null);
            await qc.invalidateQueries({ queryKey: ["payroll-slips"] });
            onSaved?.();
          }}
        />
      )}
    </div>
  );
}

/** La ficha completa de una persona: datos legales, régimen y contratista. */
function FichaDePago({
  persona, settings, canEdit, onClose, onSaved,
}: {
  persona: PersonWithProfile;
  settings: SlipSettings;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [p, setP] = useState<PayrollProfile>({ ...PROFILE_VACIO, ...(persona.profile || {}) });
  const [saving, setSaving] = useState(false);
  const [sueldoTexto, setSueldoTexto] = useState(deCentavos(p.baseSalaryCents, settings.decimals));

  useEffect(() => { setSueldoTexto(deCentavos(p.baseSalaryCents, settings.decimals)); }, [persona.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof PayrollProfile>(k: K, v: PayrollProfile[K]) => setP((x) => ({ ...x, [k]: v }));
  const texto = (k: keyof PayrollProfile, max = 120) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (e.target.value.slice(0, max) || null) as never);

  const guardar = async () => {
    setSaving(true);
    try {
      await payrollSlipsService.saveProfile(persona.userId, { ...p, baseSalaryCents: aCentavos(sueldoTexto) });
      toast.success(t("ui.RolesDePago.perfiles.fichaGuardada", "Perfil de pago guardado"));
      onSaved();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  const contratista = p.employmentType === "contractor";

  return (
    <Modal
      open
      size="lg"
      title={persona.name}
      description={t("ui.RolesDePago.perfiles.fichaDesc", "Cómo se le paga y los datos que salen en su rol.")}
      onOpenChange={(o) => { if (!o) onClose(); }}
      footer={
        <div className="cg-acciones justify-end">
          <Button variant="outline" onClick={onClose}>{t("ui.RolesDePago.cancelar", "Cancelar")}</Button>
          {canEdit && <Button disabled={saving} variant="brand" onClick={guardar}>{saving ? t("ui.RolesDePago.guardando", "Guardando…") : t("ui.RolesDePago.guardar", "Guardar")}</Button>}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t("ui.RolesDePago.perfiles.vinculo", "Vínculo")}>
          <select className={FIELD_CLS} disabled={!canEdit} value={p.employmentType} onChange={(e) => set("employmentType", e.target.value as PayrollProfile["employmentType"])}>
            <option value="employee">{t("ui.RolesDePago.perfiles.empleado", "Empleado")}</option>
            <option value="contractor">{t("ui.RolesDePago.perfiles.contratista", "Contratista")}</option>
          </select>
        </FormField>
        <FormField label={t("ui.RolesDePago.perfiles.basePago", "Se paga por")}>
          <select className={FIELD_CLS} disabled={!canEdit} value={p.payBasis} onChange={(e) => set("payBasis", e.target.value as PayrollProfile["payBasis"])}>
            <option value="monthly">{t("ui.RolesDePago.perfiles.mensual", "Mes")}</option>
            <option value="hourly">{t("ui.RolesDePago.perfiles.porHora", "Hora")}</option>
          </select>
        </FormField>
        <FormField
          label={t("ui.RolesDePago.perfiles.sueldoEn", "Sueldo ({{moneda}})", { moneda: settings.currency })}
          hint={settings.globalBaseSalaryCents ? t("ui.RolesDePago.perfiles.vacioHereda", "Vacío = hereda el sueldo base de la empresa ({{sueldo}})", { sueldo: dinero(settings.globalBaseSalaryCents, settings.currency, settings.decimals) }) : undefined}
        >
          <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} inputMode="decimal" value={sueldoTexto} onChange={(e) => setSueldoTexto(e.target.value)} />
        </FormField>
        <FormField label={t("ui.RolesDePago.perfiles.divisorHora", "Divisor de valor hora")} hint={t("ui.RolesDePago.perfiles.divisorHint", "Vacío = el de la empresa ({{d}})", { d: settings.hourDivisor || t("ui.RolesDePago.horasReales", "horas reales") })}>
          <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} inputMode="decimal" value={p.hourDivisor ?? ""} onChange={(e) => set("hourDivisor", e.target.value === "" ? null : Number(e.target.value))} />
        </FormField>
        <FormField label={t("ui.RolesDePago.perfiles.cargo", "Cargo")}>
          <input className={FIELD_CLS} disabled={!canEdit} value={p.jobTitle || ""} onChange={texto("jobTitle")} />
        </FormField>
        <FormField label={t("ui.RolesDePago.perfiles.numeroEmpleado", "Número de empleado")}>
          <input className={FIELD_CLS} disabled={!canEdit} value={p.employeeNumber || ""} onChange={texto("employeeNumber", 32)} />
        </FormField>
        <FormField label={t("ui.RolesDePago.perfiles.fechaIngreso", "Fecha de ingreso")}>
          <input className={FIELD_CLS} disabled={!canEdit} type="date" value={p.hiredAt || ""} onChange={(e) => set("hiredAt", e.target.value || null)} />
        </FormField>
        <FormField label={t("ui.RolesDePago.perfiles.afiliacion", "N.º de afiliación a la seguridad social")}>
          <input className={FIELD_CLS} disabled={!canEdit} value={p.socialSecurityNumber || ""} onChange={texto("socialSecurityNumber", 40)} />
        </FormField>
        <FormField label={t("ui.RolesDePago.perfiles.regimenPension", "Régimen de pensión")} hint={t("ui.RolesDePago.perfiles.regimenPensionHint", "ONP, AFP, IESS, Fonasa, Isapre…")}>
          <input className={FIELD_CLS} disabled={!canEdit} value={p.pensionScheme || ""} onChange={texto("pensionScheme", 40)} />
        </FormField>
        <FormField label={t("ui.RolesDePago.perfiles.proveedorPension", "Fondo / proveedor")}>
          <input className={FIELD_CLS} disabled={!canEdit} value={p.pensionProvider || ""} onChange={texto("pensionProvider", 60)} />
        </FormField>
        <FormField label={t("ui.RolesDePago.perfiles.salud", "Salud (prestador)")}>
          <input className={FIELD_CLS} disabled={!canEdit} value={p.healthProvider || ""} onChange={texto("healthProvider", 60)} />
        </FormField>
        <FormField label={t("ui.RolesDePago.perfiles.dependientes", "Dependientes (para renta)")}>
          <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} min={0} type="number" value={p.dependents} onChange={(e) => set("dependents", Math.max(0, Number(e.target.value) || 0))} />
        </FormField>
        <FormField label={t("ui.RolesDePago.perfiles.renta", "Impuesto a la renta")}>
          <select className={FIELD_CLS} disabled={!canEdit} value={p.taxMode} onChange={(e) => set("taxMode", e.target.value as PayrollProfile["taxMode"])}>
            <option value="inherit">{t("ui.RolesDePago.perfiles.rentaHereda", "Como la empresa")}</option>
            <option value="none">{t("ui.RolesDePago.perfiles.rentaNo", "No retener")}</option>
            <option value="flat">{t("ui.RolesDePago.perfiles.rentaFija", "Porcentaje propio")}</option>
          </select>
        </FormField>
        {p.taxMode === "flat" && (
          <FormField label={t("ui.RolesDePago.perfiles.rentaPct", "Porcentaje de renta")}>
            <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} inputMode="decimal" value={p.taxFlatPct ?? ""} onChange={(e) => set("taxFlatPct", e.target.value === "" ? null : Number(e.target.value))} />
          </FormField>
        )}
        <label className="glass-flat flex cursor-pointer items-center gap-2.5 px-3 py-2.5 sm:col-span-2">
          <input checked={p.exemptFromSchedule} className="cg-focus size-4" disabled={!canEdit} style={{ accentColor: "var(--brand)" }} type="checkbox" onChange={(e) => set("exemptFromSchedule", e.target.checked)} />
          <span className="text-sm">{t("ui.RolesDePago.perfiles.exentoJornada", "Puesto no sujeto a jornada (vigilancia): las extras cuentan desde el tope diario del país")}</span>
        </label>

        {contratista && (
          <>
            <FormField label={t("ui.RolesDePago.perfiles.regimenContratista", "Régimen del contratista")} hint={t("ui.RolesDePago.perfiles.regimenContratistaHint", "Honorarios, monotributo, recibo por honorarios, autónomo…")}>
              <input className={FIELD_CLS} disabled={!canEdit} value={p.contractorRegime || ""} onChange={texto("contractorRegime", 40)} />
            </FormField>
            <FormField label={t("ui.RolesDePago.perfiles.retencion", "Retención que aplica la empresa (%)")}>
              <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} inputMode="decimal" value={p.contractorWithholdingPct ?? ""} onChange={(e) => set("contractorWithholdingPct", e.target.value === "" ? null : Number(e.target.value))} />
            </FormField>
            <label className="glass-flat flex cursor-pointer items-center gap-2.5 px-3 py-2.5 sm:col-span-2">
              <input checked={p.contractorIssuesInvoice} className="cg-focus size-4" disabled={!canEdit} style={{ accentColor: "var(--brand)" }} type="checkbox" onChange={(e) => set("contractorIssuesInvoice", e.target.checked)} />
              <span className="text-sm">{t("ui.RolesDePago.perfiles.emiteFactura", "El contratista emite factura o recibo")}</span>
            </label>
          </>
        )}

        <FormField label={t("ui.RolesDePago.perfiles.banco", "Banco (solo para imprimir)")}>
          <input className={FIELD_CLS} disabled={!canEdit} value={p.bankName || ""} onChange={texto("bankName", 80)} />
        </FormField>
        <FormField label={t("ui.RolesDePago.perfiles.cuenta", "Cuenta (solo para imprimir)")}>
          <input className={FIELD_CLS} disabled={!canEdit} value={p.bankAccount || ""} onChange={texto("bankAccount", 60)} />
        </FormField>
        <FormField full label={t("ui.RolesDePago.perfiles.notas", "Notas")}>
          <input className={FIELD_CLS} disabled={!canEdit} value={p.notes || ""} onChange={texto("notes", 500)} />
        </FormField>
      </div>
    </Modal>
  );
}
