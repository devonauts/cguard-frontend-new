/**
 * HORAS ENTRE MARCAS (module «Multimarca», phase 4).
 *
 * Each person is paid by the brand they registered in (payroll is not
 * shared), also for the hours they work at sites of another brand. This
 * page says, for a period, how many hours people of brand X (employer) did
 * at sites of brand Y (the client's brand), so the companies can settle
 * between them: a matrix employer × site brand, the detail per person and
 * site, and the same report as CSV, Excel or PDF (built by the server, in
 * the company's time zone).
 *
 * By default only CROSS pairs (X ≠ Y); «Incluir horas en la propia marca»
 * adds the rest. Someone limited to some brands sees the rows where their
 * brand is the employer or the site (the server narrows it).
 *
 * Phase 5 (Mike, 2026-11-02): with MONEY and two filters that tell one brand
 * from the other — «Empresa que pone el personal» and «Empresa del cliente».
 * Only approved hours count; each one is valued at the pair's hour rate in
 * effect that day. A card per pair says what the client's company owes the
 * other; rows without a rate say «Sin tarifa» and, for the tenant admin,
 * open the rates dialog on that pair.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  ArrowRight,
  BadgeDollarSign,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Layers,
  Users,
} from "lucide-react";

import {
  construirMatriz,
  horasSinTarifa,
  importesPorMoneda,
  periodoRapido,
  periodoValido,
  redondearHoras,
  textoDeHoras,
  textoDeImporte,
  type PeriodoRapido,
} from "./horasEntreMarcas";
import TarifasEntreMarcas from "./TarifasEntreMarcas";

import AppLayout from "@/layouts/app-layout";
import EtiquetaDeMarca from "@/components/multimarca/EtiquetaDeMarca";
import MobileCardList from "@/components/responsive/MobileCardList";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  EmptyState,
  FIELD_CLS,
  FormField,
  InfoNote,
  PageContainer,
  PageHeader,
  SearchInput,
  Section,
  Segmented,
  SkeletonCards,
  StatCard,
  StatsStrip,
} from "@/components/kit";
import { ErrorDeCarga } from "@/components/kit/ErrorDeCarga";
import { useEsTelefono } from "@/hooks/useEsTelefono";
import { useMarcas, type MarcaEtiqueta } from "@/hooks/useMarcas";
import { useAccesoDeMarca } from "@/hooks/useAccesoDeMarca";
import { usePermissions } from "@/hooks/usePermissions";
import {
  horasEntreMarcasService,
  type FilaDeHoras,
  type FiltroDeHoras,
} from "@/lib/api/marcasService";
import { descargarInforme } from "@/lib/export/serverDownload";
import { hoyEnLaEmpresa, soloFechaCivil } from "@/lib/horaDeLaEmpresa";
import { localeActual } from "@/lib/localeActual";

type Formato = "csv" | "xlsx" | "pdf";

export default function HorasEntreMarcasPage() {
  const { t } = useTranslation();
  const locale = localeActual();
  const telefono = useEsTelefono();
  const { activo, todas, marcas } = useMarcas({ archivadas: true });
  const { restringido } = useAccesoDeMarca();
  const { hasPermission } = usePermissions();
  // Phase 5: the rates are an agreement between the companies: tenant admin only.
  const puedeTarifar = hasPermission("tenantEdit") && !restringido;
  const [tarifasAbiertas, setTarifasAbiertas] = useState(false);
  const [parInicial, setParInicial] = useState<{ employerBrandId: string; siteBrandId: string } | null>(null);
  const hoy = hoyEnLaEmpresa();
  const inicial = periodoRapido("mesPasado", hoy);
  const [rapido, setRapido] = useState<PeriodoRapido | "otro">("mesPasado");
  const [desde, setDesde] = useState(inicial.from);
  const [hasta, setHasta] = useState(inicial.to);
  const [empleadora, setEmpleadora] = useState("");
  const [sitio, setSitio] = useState("");
  const [incluirPropias, setIncluirPropias] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [bajando, setBajando] = useState<Formato | null>(null);
  const valido = periodoValido(desde, hasta);
  const tenant =
    typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;

  const filtro: FiltroDeHoras = {
    from: desde,
    to: hasta,
    employerBrandId: empleadora || null,
    siteBrandId: sitio || null,
    all: incluirPropias,
  };
  const q = useQuery({
    queryKey: ["marcas", "horas", tenant, filtro],
    queryFn: () => horasEntreMarcasService.leer(filtro),
    enabled: activo && valido && !!tenant,
    staleTime: 60_000,
    retry: false,
  });

  // Brand labels (archived ones too: past hours may belong to them).
  const orden = useMemo(() => (todas.length ? todas : marcas).map((b) => b.id), [todas, marcas]);
  const etiqueta = useMemo(() => {
    const m = new Map<string, MarcaEtiqueta>();

    for (const b of todas.length ? todas : marcas)
      m.set(b.id, {
        id: b.id,
        nombre: b.name,
        codigo: b.code,
        color: b.color || "var(--brand)",
        logoUrl: b.logoUrl,
        principal: !!b.isPrincipal,
      });

    return (id: string) => m.get(id) ?? null;
  }, [todas, marcas]);
  const nombreDe = (id: string) => etiqueta(id)?.nombre ?? "—";

  const matriz = useMemo(
    () => construirMatriz(q.data?.matrix ?? [], orden),
    [q.data, orden],
  );
  const filas = useMemo(() => {
    const s = busqueda.trim().toLowerCase();
    const l = q.data?.rows ?? [];

    return s
      ? l.filter((r) =>
          [r.name, r.clientName, r.siteName, nombreDe(r.employerBrandId), nombreDe(r.siteBrandId)]
            .filter(Boolean)
            .some((x) => String(x).toLowerCase().includes(s)),
        )
      : l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, busqueda, etiqueta]);
  const personas = new Set((q.data?.rows ?? []).map((r) => r.userId)).size;
  const turnos = (q.data?.matrix ?? []).reduce((s, p) => s + (p.shifts || 0), 0);
  // Phase 5: the money.
  const importes = importesPorMoneda(q.data?.matrix ?? []);
  const sinTarifa = horasSinTarifa(q.data?.matrix ?? []);
  const dinero = (cents: number | null | undefined, currency: string | null | undefined) =>
    textoDeImporte(cents, currency, locale);
  const textoImporteTotal = importes.length
    ? importes.map((x) => dinero(x.cents, x.currency)).join(" · ")
    : t("ui.HorasEntreMarcas.sinTarifa", "Sin tarifa");
  const abrirTarifas = (par?: { employerBrandId: string; siteBrandId: string } | null) => {
    setParInicial(par ?? null);
    setTarifasAbiertas(true);
  };
  /** «Sin tarifa», a button that opens the rates on that pair for the tenant admin. */
  const sinTarifaDe = (par: { employerBrandId: string; siteBrandId: string }) =>
    puedeTarifar ? (
      <button
        className="cg-focus rounded-full px-2 py-0.5 text-[11px] font-semibold underline-offset-2 hover:underline"
        style={{ background: "color-mix(in oklab, var(--warn) 14%, transparent)", color: "var(--warn-text)" }}
        title={t("ui.HorasEntreMarcas.ponerTarifa", "Poner tarifa")}
        type="button"
        onClick={() => abrirTarifas(par)}
      >
        {t("ui.HorasEntreMarcas.sinTarifa", "Sin tarifa")}
      </button>
    ) : (
      <span
        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
        style={{ background: "color-mix(in oklab, var(--warn) 14%, transparent)", color: "var(--warn-text)" }}
      >
        {t("ui.HorasEntreMarcas.sinTarifa", "Sin tarifa")}
      </span>
    );

  const elegirRapido = (p: PeriodoRapido | "otro") => {
    setRapido(p);
    if (p === "otro") return;
    const r = periodoRapido(p, hoy);

    setDesde(r.from);
    setHasta(r.to);
  };

  const bajar = async (f: Formato) => {
    if (!valido || bajando) return;
    setBajando(f);
    try {
      await descargarInforme(horasEntreMarcasService.urlDeDescarga(filtro, f), {
        format: f === "xlsx" ? "excel" : f,
        nombreBase: `${t("ui.HorasEntreMarcas.archivo", "horas-entre-marcas")}_${desde}_${hasta}`,
      });
    } catch (e: any) {
      if (!e?.toastShown)
        toast.error(
          t("ui.HorasEntreMarcas.errorDescarga", "No se pudo preparar el archivo. Inténtalo otra vez."),
        );
    } finally {
      setBajando(null);
    }
  };

  const horas = (h: number | null | undefined) => textoDeHoras(h, locale);

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          actions={
            activo ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" type="button" variant="outline" onClick={() => abrirTarifas(null)}>
                  <BadgeDollarSign className="mr-1.5 size-4" />
                  {t("ui.HorasEntreMarcas.tarifas", "Tarifas")}
                </Button>
                <Button
                  disabled={!valido || !!bajando}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => bajar("csv")}
                >
                  <Download className="mr-1.5 size-4" />
                  CSV
                </Button>
                <Button
                  disabled={!valido || !!bajando}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => bajar("xlsx")}
                >
                  <FileSpreadsheet className="mr-1.5 size-4" />
                  Excel
                </Button>
                <Button
                  disabled={!valido || !!bajando}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => bajar("pdf")}
                >
                  <FileText className="mr-1.5 size-4" />
                  PDF
                </Button>
              </div>
            ) : undefined
          }
          icon={<ArrowLeftRight />}
          subtitle={t(
            "ui.HorasEntreMarcas.subtitulo",
            "Cada persona cobra en la marca en la que se registró. Aquí ves las horas aprobadas que gente de una empresa trabajó en sitios de otra, y cuánto le debe una a la otra.",
          )}
          title={t("ui.HorasEntreMarcas.titulo", "Horas entre marcas")}
        />

        {!activo ? (
          <EmptyState
            action={
              <Button asChild variant="brand">
                <Link to="/modulos-adicionales">
                  {t("ui.MarcasPage.irALaTienda", "Ver en Módulos adicionales")}
                </Link>
              </Button>
            }
            description={t(
              "ui.MarcasPage.sinModuloDesc",
              "Con el módulo Multimarca manejas varias marcas de seguridad en una sola cuenta.",
            )}
            icon={<Layers />}
            title={t("ui.MarcasPage.sinModulo", "El módulo Multimarca no está activo")}
          />
        ) : (
          <div className="space-y-4">
            {/* ── Period and filters ─────────────────────────────── */}
            <Section>
              <div className="space-y-3">
                <Segmented
                  expandir
                  options={[
                    { value: "mesPasado", label: t("ui.HorasEntreMarcas.mesPasado", "Mes pasado") },
                    { value: "esteMes", label: t("ui.HorasEntreMarcas.esteMes", "Este mes") },
                    { value: "ultimos30", label: t("ui.HorasEntreMarcas.ultimos30", "30 días") },
                    { value: "otro", label: t("ui.HorasEntreMarcas.otro", "Otro") },
                  ]}
                  value={rapido}
                  onChange={elegirRapido}
                />
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <FormField htmlFor="horas-desde" label={t("ui.HorasEntreMarcas.desde", "Desde")}>
                    <input
                      className={FIELD_CLS}
                      id="horas-desde"
                      max={hasta || undefined}
                      type="date"
                      value={desde}
                      onChange={(e) => {
                        setRapido("otro");
                        setDesde(e.target.value);
                      }}
                    />
                  </FormField>
                  <FormField htmlFor="horas-hasta" label={t("ui.HorasEntreMarcas.hasta", "Hasta")}>
                    <input
                      className={FIELD_CLS}
                      id="horas-hasta"
                      min={desde || undefined}
                      type="date"
                      value={hasta}
                      onChange={(e) => {
                        setRapido("otro");
                        setHasta(e.target.value);
                      }}
                    />
                  </FormField>
                  <FormField
                    htmlFor="horas-empleadora"
                    label={t("ui.HorasEntreMarcas.empresaPersonal", "Empresa que pone el personal")}
                  >
                    <select
                      className={FIELD_CLS}
                      id="horas-empleadora"
                      value={empleadora}
                      onChange={(e) => setEmpleadora(e.target.value)}
                    >
                      <option value="">{t("ui.HorasEntreMarcas.cualquiera", "Cualquiera")}</option>
                      {marcas.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField
                    htmlFor="horas-sitio"
                    label={t("ui.HorasEntreMarcas.empresaCliente", "Empresa del cliente")}
                  >
                    <select
                      className={FIELD_CLS}
                      id="horas-sitio"
                      value={sitio}
                      onChange={(e) => setSitio(e.target.value)}
                    >
                      <option value="">{t("ui.HorasEntreMarcas.cualquiera", "Cualquiera")}</option>
                      {marcas.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <label
                  className="flex cursor-pointer items-center gap-2 text-sm"
                  htmlFor="horas-propias"
                  style={{ color: "var(--ink-soft)" }}
                >
                  <Switch
                    checked={incluirPropias}
                    id="horas-propias"
                    onCheckedChange={setIncluirPropias}
                  />
                  {t(
                    "ui.HorasEntreMarcas.incluirPropias",
                    "Incluir horas en sitios de la propia marca",
                  )}
                </label>
                {!valido && (
                  <p className="text-xs font-medium" role="alert" style={{ color: "var(--bad-text)" }}>
                    {t(
                      "ui.HorasEntreMarcas.periodoMalo",
                      "Elige un periodo válido: la fecha inicial antes de la final, hasta un año.",
                    )}
                  </p>
                )}
              </div>
            </Section>

            {restringido && (
              <InfoNote icon={<Layers />} tone="neutral">
                {t(
                  "ui.HorasEntreMarcas.restringido",
                  "Ves las horas en las que una de tus marcas paga o es la marca del sitio.",
                )}
              </InfoNote>
            )}

            {!valido ? null : q.isLoading ? (
              <SkeletonCards count={3} />
            ) : q.isError ? (
              <ErrorDeCarga onRetry={() => q.refetch()} />
            ) : !q.data || !(q.data.rows?.length || q.data.matrix?.length) ? (
              <EmptyState
                description={
                  incluirPropias
                    ? t(
                        "ui.HorasEntreMarcas.vacioTodasDesc",
                        "No hay horas trabajadas registradas en este periodo con estos filtros.",
                      )
                    : t(
                        "ui.HorasEntreMarcas.vacioDesc",
                        "Nadie trabajó en sitios de otra marca en este periodo. Activa «Incluir horas en sitios de la propia marca» para ver todas.",
                      )
                }
                icon={<Clock />}
                title={t("ui.HorasEntreMarcas.vacio", "Sin horas entre marcas")}
              />
            ) : (
              <>
                <StatsStrip className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatCard
                    flat
                    icon={<Clock />}
                    label={t("ui.HorasEntreMarcas.horasAprobadas", "Horas aprobadas")}
                    value={horas(matriz.total)}
                  />
                  <StatCard
                    flat
                    hint={
                      sinTarifa > 0
                        ? t("ui.HorasEntreMarcas.horasSinTarifa", "{{horas}} sin tarifa", { horas: horas(sinTarifa) })
                        : undefined
                    }
                    icon={<BadgeDollarSign />}
                    label={t("ui.HorasEntreMarcas.importe", "Importe")}
                    value={textoImporteTotal}
                  />
                  <StatCard
                    flat
                    icon={<Users />}
                    label={t("ui.HorasEntreMarcas.personas", "Personas")}
                    value={personas}
                  />
                  <StatCard
                    flat
                    icon={<ArrowLeftRight />}
                    label={t("ui.HorasEntreMarcas.turnos", "Turnos")}
                    value={turnos}
                  />
                </StatsStrip>

                {/* ── Phase 5: what each client's company owes, per pair ── */}
                <Section
                  icon={<BadgeDollarSign />}
                  title={t("ui.HorasEntreMarcas.liquidacion", "Liquidación entre marcas")}
                >
                  <p className="mb-3 text-xs" style={{ color: "var(--ink-soft)" }}>
                    {t(
                      "ui.HorasEntreMarcas.liquidacionAyuda",
                      "La empresa del cliente le paga a la empresa que puso el personal las horas aprobadas por la tarifa vigente de cada día.",
                    )}
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="totales-por-par">
                    {(q.data.matrix ?? []).map((c) => (
                      <div
                        key={`${c.employerBrandId}|${c.siteBrandId}`}
                        className="glass-flat space-y-2 rounded-xl p-3"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 text-sm">
                          <EtiquetaDeMarca marca={etiqueta(c.siteBrandId)} />
                          <span className="truncate font-medium">{nombreDe(c.siteBrandId)}</span>
                          <ArrowRight className="size-3.5" style={{ color: "var(--ink-faint)" }} />
                          <EtiquetaDeMarca marca={etiqueta(c.employerBrandId)} />
                          <span className="truncate font-medium">{nombreDe(c.employerBrandId)}</span>
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                          {t("ui.HorasEntreMarcas.debeA", "{{cliente}} le paga a {{personal}}", {
                            cliente: nombreDe(c.siteBrandId),
                            personal: nombreDe(c.employerBrandId),
                          })}
                        </div>
                        <div className="flex items-end justify-between gap-2">
                          <div>
                            <div className="text-xl font-bold tabular-nums">
                              {c.amountCents != null ? dinero(c.amountCents, c.currency) : sinTarifaDe(c)}
                            </div>
                            {c.amountCents != null && (c.unratedHours ?? 0) > 0 && (
                              <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]" style={{ color: "var(--warn-text)" }}>
                                {t("ui.HorasEntreMarcas.horasSinTarifa", "{{horas}} sin tarifa", { horas: horas(c.unratedHours) })}
                                {puedeTarifar && (
                                  <button className="underline" type="button" onClick={() => abrirTarifas(c)}>
                                    {t("ui.HorasEntreMarcas.ponerTarifa", "Poner tarifa")}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="text-right text-xs" style={{ color: "var(--ink-soft)" }}>
                            <div className="font-semibold tabular-nums" style={{ color: "var(--ink)" }}>{horas(c.hours)}</div>
                            {t("ui.HorasEntreMarcas.personasYTurnos", "{{personas}} pers. · {{count}} turnos", {
                              personas: c.people,
                              count: c.shifts,
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                {/* ── Matrix employer × site brand ───────────────── */}
                <Section
                  icon={<ArrowLeftRight />}
                  title={t("ui.HorasEntreMarcas.matriz", "Quién trabajó dónde")}
                >
                  <p className="mb-3 text-xs" style={{ color: "var(--ink-soft)" }}>
                    {t(
                      "ui.HorasEntreMarcas.matrizAyuda",
                      "Filas: la empresa que pone el personal. Columnas: la empresa del cliente donde trabajó. Periodo {{desde}} – {{hasta}}.",
                      {
                        desde: soloFechaCivil(q.data.from || desde),
                        hasta: soloFechaCivil(q.data.to || hasta),
                      },
                    )}
                  </p>
                  {telefono ? (
                    <div className="space-y-2" data-testid="matriz-telefono">
                      {matriz.filas.flatMap((e) =>
                        matriz.columnas
                          .map((s) => ({ e, s, c: matriz.celda(e, s) }))
                          .filter((x) => x.c && x.c.hours)
                          .map(({ e: emp, s: sit, c }) => (
                            <div
                              key={`${emp}|${sit}`}
                              className="glass-flat flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                            >
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <EtiquetaDeMarca marca={etiqueta(emp)} />
                                <ArrowRight className="size-3.5" style={{ color: "var(--ink-faint)" }} />
                                <EtiquetaDeMarca marca={etiqueta(sit)} />
                              </div>
                              <div className="text-right">
                                <div className="font-semibold tabular-nums">{horas(c!.hours)}</div>
                                {c!.amountCents != null && (
                                  <div className="text-xs font-medium tabular-nums">{dinero(c!.amountCents, c!.currency)}</div>
                                )}
                                <div className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                                  {t("ui.HorasEntreMarcas.personasYTurnos", "{{personas}} pers. · {{count}} turnos", {
                                    personas: c!.people,
                                    count: c!.shifts,
                                  })}
                                </div>
                              </div>
                            </div>
                          )),
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="matriz">
                        <thead>
                          <tr className="border-b" style={{ borderColor: "var(--hairline)" }}>
                            <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "var(--ink-faint)" }}>
                              {t("ui.HorasEntreMarcas.pagaTrabajaEn", "Paga / Trabajó en")}
                            </th>
                            {matriz.columnas.map((s) => (
                              <th key={s} className="px-3 py-2 text-right">
                                <EtiquetaDeMarca marca={etiqueta(s)} />
                              </th>
                            ))}
                            <th className="px-3 py-2 text-right text-xs font-semibold">
                              {t("ui.HorasEntreMarcas.total", "Total")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {matriz.filas.map((e) => (
                            <tr key={e} className="border-b" style={{ borderColor: "var(--hairline)" }}>
                              <th className="px-3 py-2 text-left font-medium">
                                <span className="inline-flex items-center gap-1.5">
                                  <EtiquetaDeMarca marca={etiqueta(e)} />
                                  <span className="truncate">{nombreDe(e)}</span>
                                </span>
                              </th>
                              {matriz.columnas.map((s) => {
                                const c = matriz.celda(e, s);
                                const misma = e === s;

                                return (
                                  <td
                                    key={s}
                                    className="px-3 py-2 text-right tabular-nums"
                                    style={{
                                      background: misma ? "var(--glass-sunken)" : undefined,
                                      color: misma ? "var(--ink-faint)" : undefined,
                                    }}
                                    title={
                                      c
                                        ? t("ui.HorasEntreMarcas.personasYTurnos", "{{personas}} pers. · {{count}} turnos", {
                                            personas: c.people,
                                            count: c.shifts,
                                          })
                                        : undefined
                                    }
                                  >
                                    <div className="font-semibold">{horas(c?.hours)}</div>
                                    {c && c.amountCents != null && (
                                      <div className="text-xs font-medium" style={{ color: "var(--ok-text, var(--ink-soft))" }}>
                                        {dinero(c.amountCents, c.currency)}
                                      </div>
                                    )}
                                    {c && (
                                      <div className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                                        {t("ui.HorasEntreMarcas.personasYTurnos", "{{personas}} pers. · {{count}} turnos", {
                                          personas: c.people,
                                          count: c.shifts,
                                        })}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                {horas(matriz.totalFila(e))}
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold">
                              {t("ui.HorasEntreMarcas.total", "Total")}
                            </th>
                            {matriz.columnas.map((s) => (
                              <td key={s} className="px-3 py-2 text-right font-semibold tabular-nums">
                                {horas(matriz.totalColumna(s))}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right font-bold tabular-nums">
                              {horas(matriz.total)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>

                {/* ── Detail per person and site ─────────────────── */}
                <Section
                  action={
                    <SearchInput
                      className="w-full sm:w-64"
                      placeholder={t("ui.HorasEntreMarcas.buscar", "Buscar persona, cliente o sitio")}
                      value={busqueda}
                      onChange={setBusqueda}
                    />
                  }
                  icon={<Users />}
                  title={t("ui.HorasEntreMarcas.detalle", "Detalle")}
                >
                  {telefono ? (
                    <MobileCardList<FilaDeHoras>
                      emptyMessage={t("ui.HorasEntreMarcas.sinCoincidencias", "Nada coincide con la búsqueda.")}
                      items={filas}
                      renderCard={(r) => (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-semibold">{r.name}</span>
                            <span className="font-semibold tabular-nums">{horas(r.hours)}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <EtiquetaDeMarca marca={etiqueta(r.employerBrandId)} />
                            <ArrowRight className="size-3" style={{ color: "var(--ink-faint)" }} />
                            <EtiquetaDeMarca marca={etiqueta(r.siteBrandId)} />
                            <span className="truncate" style={{ color: "var(--ink-soft)" }}>
                              {[r.clientName, r.siteName].filter(Boolean).join(" · ")}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--ink-faint)" }}>
                            <span>
                              {t("ui.HorasEntreMarcas.nTurnos", "{{count}} turnos", { count: r.shifts })}
                              {r.rateCents != null &&
                                ` · ${t("ui.TarifasEntreMarcas.porHoraValor", "{{monto}} / h", { monto: dinero(r.rateCents, r.currency) })}`}
                            </span>
                            {r.amountCents != null ? (
                              <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--ink)" }}>
                                {dinero(r.amountCents, r.currency)}
                              </span>
                            ) : (
                              sinTarifaDe(r)
                            )}
                          </div>
                        </div>
                      )}
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="detalle">
                        <thead>
                          <tr
                            className="border-b text-left text-xs"
                            style={{ borderColor: "var(--hairline)", color: "var(--ink-faint)" }}
                          >
                            <th className="px-3 py-2 font-semibold">{t("ui.HorasEntreMarcas.persona", "Persona")}</th>
                            <th className="px-3 py-2 font-semibold">{t("ui.HorasEntreMarcas.empresaPersonalCorta", "Pone el personal")}</th>
                            <th className="px-3 py-2 font-semibold">{t("ui.HorasEntreMarcas.empresaClienteCorta", "Empresa del cliente")}</th>
                            <th className="px-3 py-2 font-semibold">{t("ui.HorasEntreMarcas.cliente", "Cliente")}</th>
                            <th className="px-3 py-2 font-semibold">{t("ui.HorasEntreMarcas.sitio", "Sitio")}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t("ui.HorasEntreMarcas.turnos", "Turnos")}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t("ui.HorasEntreMarcas.totalHoras", "Horas")}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t("ui.TarifasEntreMarcas.porHora", "Tarifa por hora")}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t("ui.HorasEntreMarcas.importe", "Importe")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filas.map((r, i) => (
                            <tr
                              key={`${r.userId}|${r.postSiteId}|${r.siteBrandId}|${i}`}
                              className="border-b"
                              style={{ borderColor: "var(--hairline)" }}
                            >
                              <td className="px-3 py-2 font-medium">{r.name}</td>
                              <td className="px-3 py-2">
                                <EtiquetaDeMarca marca={etiqueta(r.employerBrandId)} />
                              </td>
                              <td className="px-3 py-2">
                                <EtiquetaDeMarca marca={etiqueta(r.siteBrandId)} />
                              </td>
                              <td className="px-3 py-2">{r.clientName || "—"}</td>
                              <td className="px-3 py-2">{r.siteName || "—"}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{r.shifts}</td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums">{horas(r.hours)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {r.rateCents != null ? dinero(r.rateCents, r.currency) : sinTarifaDe(r)}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                {r.amountCents != null ? dinero(r.amountCents, r.currency) : "—"}
                              </td>
                            </tr>
                          ))}
                          {!filas.length && (
                            <tr>
                              <td className="px-3 py-6 text-center" colSpan={9} style={{ color: "var(--ink-faint)" }}>
                                {t("ui.HorasEntreMarcas.sinCoincidencias", "Nada coincide con la búsqueda.")}
                              </td>
                            </tr>
                          )}
                        </tbody>
                        {filas.length > 0 && (
                          <tfoot>
                            <tr>
                              <td className="px-3 py-2 text-xs font-semibold" colSpan={6}>
                                {t("ui.HorasEntreMarcas.total", "Total")}
                              </td>
                              <td className="px-3 py-2 text-right font-bold tabular-nums">
                                {horas(redondearHoras(filas.reduce((s, r) => s + (Number(r.hours) || 0), 0)))}
                              </td>
                              <td />
                              <td className="px-3 py-2 text-right font-bold tabular-nums">
                                {importesPorMoneda(
                                  filas.map((r) => ({
                                    employerBrandId: r.employerBrandId,
                                    siteBrandId: r.siteBrandId,
                                    hours: r.hours,
                                    people: 1,
                                    shifts: r.shifts,
                                    amountCents: r.amountCents ?? null,
                                    currency: r.currency ?? null,
                                  })),
                                )
                                  .map((x) => dinero(x.cents, x.currency))
                                  .join(" · ") || "—"}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}
                </Section>
              </>
            )}
          </div>
        )}
        <TarifasEntreMarcas
          abierto={tarifasAbiertas}
          desdeInicial={desde}
          etiqueta={etiqueta}
          marcas={marcas}
          parInicial={parInicial}
          puedeEditar={puedeTarifar}
          onCerrar={() => setTarifasAbiertas(false)}
        />
      </PageContainer>
    </AppLayout>
  );
}
