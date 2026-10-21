/**
 * ROLES DE PAGO — la portada del módulo.
 *
 * Sin el módulo: qué es y dónde se contrata. Con el módulo y sin puesta en
 * marcha: el asistente (país → empresa → personas → listo). Con todo listo: el
 * estado de la empresa y los accesos a configuración, conceptos y perfiles. Las
 * corridas (planilla y roles) se enganchan aquí en la siguiente entrega.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Building2, CheckCircle2, FileSpreadsheet, Globe2, ListChecks, Settings2, Users } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, Section, SkeletonCards, InfoNote, StatCard, FormField, FIELD_CLS, ListRow, StatusBadge } from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import payrollSlipsService, { type SlipSettings, type PayFrequency, type DoubleShiftMode } from "@/lib/api/payrollSlipsService";
import { PresentacionDelModulo, useModuloRoles, nombreDePais, nombreDeConcepto, dinero, useEtiquetas, MoneyInput } from "./comun";
import { TablaDePerfiles } from "./TablaDePerfiles";
import { NuevaCorrida, useEstadoDeCorrida } from "./CorridasDePago";

type Paso = "pais" | "empresa" | "personas" | "listo";

export default function RolesDePagoPage() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("payrollSlipEdit");

  const setup = useQuery({
    queryKey: ["payroll-slips", "setup"],
    queryFn: () => payrollSlipsService.setup(),
    retry: false,
  });
  const { sinModulo } = useModuloRoles(setup.error);

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          icon={<FileSpreadsheet />}
          title={t("ui.RolesDePago.titulo", "Roles de pago")}
          subtitle={t("ui.RolesDePago.subtitulo", "La planilla de cada periodo y el rol de cada trabajador, con las reglas de tu país ajustadas a tu empresa.")}
        />
        {sinModulo ? (
          <PresentacionDelModulo />
        ) : setup.isLoading || !setup.data ? (
          <SkeletonCards count={3} />
        ) : !setup.data.setupDone ? (
          <Asistente canEdit={canEdit} onDone={() => setup.refetch()} />
        ) : (
          <Portada datos={setup.data} />
        )}
      </PageContainer>
    </AppLayout>
  );
}

function Portada({ datos }: { datos: Awaited<ReturnType<typeof payrollSlipsService.setup>> }) {
  const { t, i18n } = useTranslation();
  const etiquetas = useEtiquetas();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Globe2 />} label={t("ui.RolesDePago.portada.pais", "País y moneda")} value={`${nombreDePais(datos.countryCode, i18n.language)} · ${datos.currency}`} />
        <StatCard icon={<Building2 />} label={t("ui.RolesDePago.portada.frecuencia", "Frecuencia")} value={etiquetas.frequency[datos.frequency]} />
        <StatCard icon={<ListChecks />} label={t("ui.RolesDePago.portada.conceptos", "Conceptos")} value={String(datos.concepts)} />
        <StatCard
          icon={<Users />}
          label={t("ui.RolesDePago.portada.personas", "Personas")}
          value={String(datos.people)}
          hint={datos.peopleWithoutSalary ? t("ui.RolesDePago.portada.sinSueldo", "{{n}} sin sueldo", { n: datos.peopleWithoutSalary }) : t("ui.RolesDePago.portada.todasConSueldo", "Todas con sueldo")}
        />
      </div>

      {!datos.ready && (
        <InfoNote tone="warn" title={t("ui.RolesDePago.portada.faltaAlgo", "Falta información para generar roles")}>
          {t("ui.RolesDePago.portada.faltaAlgoDesc", "Hay personas sin sueldo y la empresa no tiene sueldo base. Ponlo en Configuración o completa sus perfiles.")}
        </InfoNote>
      )}

      <UltimasPlanillas decimals={2} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Acceso to="/nomina/roles/configuracion" icon={<Settings2 />} titulo={t("ui.RolesDePago.portada.configurar", "Configuración")} desc={t("ui.RolesDePago.portada.configurarDesc", "País, sueldo base, jornada, dobladas, renta y documento.")} />
        <Acceso to="/nomina/roles/conceptos" icon={<ListChecks />} titulo={t("ui.RolesDePago.portada.catalogo", "Conceptos")} desc={t("ui.RolesDePago.portada.catalogoDesc", "Ingresos, deducciones y aportes: crea los tuyos o ajusta los de tu país.")} />
        <Acceso to="/nomina/roles/perfiles" icon={<Users />} titulo={t("ui.RolesDePago.portada.perfiles", "Perfiles de pago")} desc={t("ui.RolesDePago.portada.perfilesDesc", "Sueldo, vínculo y datos legales de cada persona.")} />
      </div>
    </div>
  );
}

/** Las últimas planillas y el botón de crear una (la lista completa está en Planillas). */
function UltimasPlanillas({ decimals }: { decimals: 0 | 2 }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const estado = useEstadoDeCorrida();
  const [nueva, setNueva] = useState(false);
  const vista = useQuery({ queryKey: ["payroll-slips", "settings"], queryFn: () => payrollSlipsService.settings(), retry: false });
  const corridas = useQuery({ queryKey: ["payroll-slips", "runs"], queryFn: () => payrollSlipsService.runs(), retry: false });
  const filas = (corridas.data?.rows ?? []).slice(0, 5);

  return (
    <Section
      icon={<FileSpreadsheet />}
      title={t("ui.RolesDePago.portada.corridas", "Planillas del periodo")}
      action={hasPermission("payrollSlipEdit") ? <Button size="sm" variant="brand" onClick={() => setNueva(true)}>{t("ui.RolesDePago.corridas.nueva", "Nueva planilla")}</Button> : undefined}
    >
      {!filas.length ? (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{t("ui.RolesDePago.corridas.vacioDesc", "Crea la primera eligiendo el día en que empieza el periodo.")}</p>
      ) : (
        <div className="space-y-2">
          {filas.map((r) => (
            <ListRow
              key={r.id}
              title={`${r.number} · ${r.periodFrom} → ${r.periodTo}`}
              subtitle={r.totals?.people ? t("ui.RolesDePago.corridas.resumen", "{{n}} personas · neto {{neto}}", { n: r.totals.people, neto: dinero(r.totals.net || 0, r.currency, decimals) }) : undefined}
              badges={<StatusBadge tone={estado.tone[r.status]}>{estado.label[r.status]}</StatusBadge>}
              onClick={() => navigate(`/nomina/roles/planillas/${r.id}`)}
            />
          ))}
          <div className="cg-acciones justify-end"><Button size="sm" variant="ghost" onClick={() => navigate("/nomina/roles/planillas")}>{t("ui.RolesDePago.portada.todasLasPlanillas", "Ver todas las planillas")}</Button></div>
        </div>
      )}
      {nueva && vista.data && <NuevaCorrida frequency={vista.data.settings.frequency} onClose={() => setNueva(false)} onCreated={(r) => { setNueva(false); navigate(`/nomina/roles/planillas/${r.id}`); }} />}
    </Section>
  );
}

function Acceso({ to, icon, titulo, desc }: { to: string; icon: React.ReactNode; titulo: string; desc: string }) {
  return (
    <Link className="glass glass-hover block p-4" to={to}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: "var(--brand-wash)", color: "var(--brand-text)" }}>{icon}</span>
        <div className="min-w-0">
          <div className="font-medium">{titulo}</div>
          <div className="text-sm" style={{ color: "var(--ink-soft)" }}>{desc}</div>
        </div>
      </div>
    </Link>
  );
}

/** El asistente de puesta en marcha (decisión del dueño D5). */
function Asistente({ canEdit, onDone }: { canEdit: boolean; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const etiquetas = useEtiquetas();
  const [paso, setPaso] = useState<Paso>("pais");
  const [saving, setSaving] = useState(false);
  const vista = useQuery({ queryKey: ["payroll-slips", "settings"], queryFn: () => payrollSlipsService.settings(), retry: false });
  const [pais, setPais] = useState("");
  const [form, setForm] = useState<SlipSettings | null>(null);

  useEffect(() => {
    if (vista.data && !form) {
      setForm(vista.data.settings);
      setPais(vista.data.settings.countryCode || vista.data.detectedCountry || "");
      if (vista.data.settings.countryCode) setPaso("empresa");
    }
  }, [vista.data, form]);

  const plantilla = useQuery({
    queryKey: ["payroll-slips", "template", pais],
    queryFn: () => payrollSlipsService.template(pais),
    enabled: Boolean(pais),
    staleTime: 300_000,
  });

  const paises = useMemo(() => {
    const lista = vista.data?.countries ?? [];

    return lista.map((c) => ({ code: c, nombre: nombreDePais(c, i18n.language) })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [vista.data, i18n.language]);

  const pasos: Array<{ key: Paso; label: string }> = [
    { key: "pais", label: t("ui.RolesDePago.asistente.pasoPais", "País") },
    { key: "empresa", label: t("ui.RolesDePago.asistente.pasoEmpresa", "Empresa") },
    { key: "personas", label: t("ui.RolesDePago.asistente.pasoPersonas", "Personas") },
    { key: "listo", label: t("ui.RolesDePago.asistente.pasoListo", "Listo") },
  ];
  const indice = pasos.findIndex((p) => p.key === paso);

  const aplicarPais = async () => {
    if (!pais) return;
    setSaving(true);
    try {
      const r = await payrollSlipsService.applyCountry(pais, true);

      setForm(r.settings);
      toast.success(t("ui.RolesDePago.asistente.paisAplicado", "Plantilla de {{pais}} aplicada: {{n}} conceptos listos para ajustar", { pais: nombreDePais(pais, i18n.language), n: r.seeded.total }));
      await qc.invalidateQueries({ queryKey: ["payroll-slips"] });
      setPaso("empresa");
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  const guardarEmpresa = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const r = await payrollSlipsService.saveSettings(form);

      setForm(r.settings);
      await qc.invalidateQueries({ queryKey: ["payroll-slips"] });
      setPaso("personas");
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  const terminar = async () => {
    setSaving(true);
    try {
      await payrollSlipsService.saveSettings({ setupDone: true });
      await qc.invalidateQueries({ queryKey: ["payroll-slips"] });
      toast.success(t("ui.RolesDePago.asistente.terminado", "Roles de pago listos para usarse"));
      onDone();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  if (vista.isLoading || !form) return <SkeletonCards count={2} />;

  const tpl = plantilla.data?.template;
  const set = <K extends keyof SlipSettings>(k: K, v: SlipSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="space-y-4">
      <ol className="glass flex flex-wrap items-center gap-2 p-2">
        {pasos.map((p, i) => (
          <li key={p.key} className="flex items-center gap-2 px-2 py-1 text-sm">
            <span
              className="grid size-6 place-items-center rounded-full text-xs font-semibold tabular-nums"
              style={i <= indice ? { background: "var(--brand)", color: "var(--brand-ink, #fff)" } : { background: "var(--glass-sunken)", color: "var(--ink-faint)" }}
            >
              {i < indice ? <CheckCircle2 size={14} /> : i + 1}
            </span>
            <span style={{ color: i === indice ? "var(--ink)" : "var(--ink-soft)" }}>{p.label}</span>
          </li>
        ))}
      </ol>

      {paso === "pais" && (
        <Section icon={<Globe2 />} title={t("ui.RolesDePago.asistente.paisTitulo", "¿En qué país paga la empresa?")}>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("ui.RolesDePago.asistente.paisDesc", "Te proponemos la jornada, los recargos, los beneficios y descuentos de ley y, si existe, el catálogo oficial de conceptos de ese país. Todo queda editable: es tu punto de partida, no una regla fija.")}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label={t("ui.RolesDePago.asistente.pais", "País")}>
              <select className={FIELD_CLS} disabled={!canEdit} value={pais} onChange={(e) => setPais(e.target.value)}>
                <option value="">{t("ui.RolesDePago.asistente.elige", "Elige…")}</option>
                {paises.map((p) => <option key={p.code} value={p.code}>{p.nombre}</option>)}
              </select>
            </FormField>
          </div>
          {tpl && (
            <div className="glass-flat mt-3 grid grid-cols-2 gap-3 p-3 text-sm sm:grid-cols-4">
              <Dato label={t("ui.RolesDePago.asistente.moneda", "Moneda")} value={tpl.currency} />
              <Dato label={t("ui.RolesDePago.asistente.jornada", "Jornada")} value={t("ui.RolesDePago.asistente.horasSemana", "{{h}} h/semana", { h: tpl.weeklyHours })} />
              <Dato label={t("ui.RolesDePago.asistente.nocturno", "Nocturno")} value={tpl.night ? `${tpl.night.pct} % (${tpl.night.from}–${tpl.night.to})` : tpl.nightShiftHours ? t("ui.RolesDePago.asistente.jornadaReducida", "Jornada de {{h}} h", { h: tpl.nightShiftHours }) : "—"} />
              <Dato label={t("ui.RolesDePago.asistente.minimo", "Mínimo legal")} value={tpl.legalMinimumCents ? dinero(tpl.legalMinimumCents, tpl.currency, tpl.decimals) : "—"} />
              <div className="col-span-2 sm:col-span-4">
                <div className="cg-eyebrow mb-1">{t("ui.RolesDePago.asistente.conceptosPropuestos", "Conceptos propuestos")}</div>
                <div className="flex flex-wrap gap-1">
                  {(plantilla.data?.concepts ?? []).map((c) => (
                    <span key={c.code} className="rounded-full px-2 py-0.5 text-xs" style={{ background: c.kind === "earning" ? "var(--brand-wash)" : "var(--glass-sunken)" }}>
                      {nombreDeConcepto(c.name, i18n.language)}{c.officialCode ? ` · ${c.officialCode}` : ""}
                    </span>
                  ))}
                </div>
              </div>
              {tpl.notes.length > 0 && (
                <p className="col-span-2 text-xs sm:col-span-4" style={{ color: "var(--ink-faint)" }}>
                  {t("ui.RolesDePago.asistente.verificado", "Cifras de referencia revisadas el {{fecha}}.", { fecha: tpl.verifiedAt })} {tpl.notes.join(" · ")}
                </p>
              )}
            </div>
          )}
          <div className="cg-acciones mt-4 justify-end">
            <Button disabled={!pais || !canEdit || saving} variant="brand" onClick={aplicarPais}>
              {saving ? t("ui.RolesDePago.guardando", "Guardando…") : t("ui.RolesDePago.asistente.usarPlantilla", "Usar esta plantilla y continuar")}
            </Button>
          </div>
        </Section>
      )}

      {paso === "empresa" && (
        <Section icon={<Building2 />} title={t("ui.RolesDePago.asistente.empresaTitulo", "Cómo paga la empresa")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label={t("ui.RolesDePago.config.frecuencia", "Frecuencia de pago")}>
              <select className={FIELD_CLS} disabled={!canEdit} value={form.frequency} onChange={(e) => set("frequency", e.target.value as PayFrequency)}>
                {(Object.keys(etiquetas.frequency) as PayFrequency[]).map((f) => <option key={f} value={f}>{etiquetas.frequency[f]}</option>)}
              </select>
            </FormField>
            <FormField
              label={t("ui.RolesDePago.config.sueldoGlobal", "Sueldo base de la empresa ({{moneda}}/mes)", { moneda: form.currency })}
              hint={t("ui.RolesDePago.config.sueldoGlobalHint", "Lo cobra quien no tenga sueldo propio en su perfil. Puedes dejarlo vacío si todos tienen el suyo.")}
            >
              <MoneyInput cents={form.globalBaseSalaryCents || null} className={`${FIELD_CLS} tabular-nums`} decimals={form.decimals} disabled={!canEdit} onCents={(c) => set("globalBaseSalaryCents", c || 0)} />
            </FormField>
            <FormField label={t("ui.RolesDePago.config.jornadaSemanal", "Jornada semanal (horas)")}>
              <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} type="number" value={form.weeklyHours} onChange={(e) => set("weeklyHours", Number(e.target.value) || 0)} />
            </FormField>
            <FormField label={t("ui.RolesDePago.config.divisor", "Divisor de valor hora")} hint={t("ui.RolesDePago.config.divisorHint", "Sueldo mensual ÷ este número = valor hora. 0 = horas reales del periodo.")}>
              <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} type="number" value={form.hourDivisor} onChange={(e) => set("hourDivisor", Number(e.target.value) || 0)} />
            </FormField>
            <FormField label={t("ui.RolesDePago.config.doblada", "Cómo se paga una doblada (turno doble)")}>
              <select className={FIELD_CLS} disabled={!canEdit} value={form.doubleShift.mode} onChange={(e) => set("doubleShift", { ...form.doubleShift, mode: e.target.value as DoubleShiftMode })}>
                {(Object.keys(etiquetas.doubleShift) as DoubleShiftMode[]).map((m) => <option key={m} value={m}>{etiquetas.doubleShift[m]}</option>)}
              </select>
            </FormField>
            {form.doubleShift.mode === "bonus" && (
              <FormField label={t("ui.RolesDePago.config.premioDoblada", "Premio por doblete (% del turno)")}>
                <input className={`${FIELD_CLS} tabular-nums`} disabled={!canEdit} type="number" value={form.doubleShift.bonusPct} onChange={(e) => set("doubleShift", { ...form.doubleShift, bonusPct: Number(e.target.value) || 0 })} />
              </FormField>
            )}
          </div>
          <div className="cg-acciones mt-4 justify-between">
            <Button variant="outline" onClick={() => setPaso("pais")}>{t("ui.RolesDePago.atras", "Atrás")}</Button>
            <Button disabled={!canEdit || saving} variant="brand" onClick={guardarEmpresa}>{saving ? t("ui.RolesDePago.guardando", "Guardando…") : t("ui.RolesDePago.continuar", "Continuar")}</Button>
          </div>
        </Section>
      )}

      {paso === "personas" && (
        <Section icon={<Users />} title={t("ui.RolesDePago.asistente.personasTitulo", "El sueldo de cada persona")}>
          <p className="mb-3 text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("ui.RolesDePago.asistente.personasDesc", "Quien no tenga sueldo propio cobra el sueldo base de la empresa. Puedes completar el resto de la ficha después, desde Perfiles de pago.")}
          </p>
          <TablaDePerfiles compacta canEdit={canEdit} settings={form} />
          <div className="cg-acciones mt-4 justify-between">
            <Button variant="outline" onClick={() => setPaso("empresa")}>{t("ui.RolesDePago.atras", "Atrás")}</Button>
            <Button variant="brand" onClick={() => setPaso("listo")}>{t("ui.RolesDePago.continuar", "Continuar")}</Button>
          </div>
        </Section>
      )}

      {paso === "listo" && (
        <Section icon={<CheckCircle2 />} title={t("ui.RolesDePago.asistente.listoTitulo", "Todo listo")}>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("ui.RolesDePago.asistente.listoDesc", "Desde ahora puedes ajustar los conceptos, los perfiles y la configuración cuando quieras. Si activas «Roles de pago» en la app del equipo, cada trabajador verá sus roles publicados.")}
          </p>
          <div className="cg-acciones mt-4 justify-between">
            <Button variant="outline" onClick={() => setPaso("personas")}>{t("ui.RolesDePago.atras", "Atrás")}</Button>
            <Button disabled={!canEdit || saving} variant="brand" onClick={terminar}>{saving ? t("ui.RolesDePago.guardando", "Guardando…") : t("ui.RolesDePago.asistente.terminar", "Terminar")}</Button>
          </div>
        </Section>
      )}
    </div>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="cg-eyebrow mb-0.5">{label}</div>
      <div className="truncate font-medium tabular-nums">{value}</div>
    </div>
  );
}
