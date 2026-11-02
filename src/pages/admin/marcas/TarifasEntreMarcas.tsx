/**
 * TARIFAS ENTRE MARCAS (module «Multimarca», phase 5) — the dialog where the
 * tenant admin sets what the CLIENT's company pays the company that PROVIDES
 * the staff for each approved hour. A rate is effective from a date: a new
 * one does not rewrite the past, the server values every shift at the rate
 * in effect on its day. A pair keeps one currency.
 *
 * Read-only for everyone else who sees the report (a brand admin sees the
 * pairs where their brand is on one side).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, BadgeDollarSign, Loader2, Plus, Trash2 } from "lucide-react";

import {
  cambioDeTarifa,
  revisarTarifa,
  tarifasPorPar,
  tarifaVigente,
  textoDeImporte,
} from "./horasEntreMarcas";
import { mensajeDeMarca } from "./mensajesDeMarca";

import EtiquetaDeMarca from "@/components/multimarca/EtiquetaDeMarca";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { EmptyState, FIELD_CLS, FormField, InfoNote, Modal } from "@/components/kit";
import type { MarcaEtiqueta } from "@/hooks/useMarcas";
import {
  codigoDeError,
  tarifasEntreMarcasService,
  type Marca,
  type TarifaEntreMarcas,
} from "@/lib/api/marcasService";
import { hoyEnLaEmpresa, soloFechaCivil } from "@/lib/horaDeLaEmpresa";
import { localeActual } from "@/lib/localeActual";

export function useTarifasEntreMarcas(habilitado: boolean) {
  const tenant = typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;

  return useQuery({
    queryKey: ["marcas", "tarifas", tenant],
    queryFn: () => tarifasEntreMarcasService.leer(),
    enabled: habilitado && !!tenant,
    staleTime: 60_000,
    retry: false,
  });
}

export default function TarifasEntreMarcas({
  abierto,
  onCerrar,
  marcas,
  etiqueta,
  puedeEditar,
  parInicial,
  desdeInicial,
}: {
  abierto: boolean;
  onCerrar: () => void;
  /** Live brands, in order (principal first). */
  marcas: Marca[];
  etiqueta: (id: string) => MarcaEtiqueta | null;
  /** Tenant admin only. */
  puedeEditar: boolean;
  /** Pre-fill the form with a pair («Sin tarifa → Poner tarifa»). */
  parInicial?: { employerBrandId: string; siteBrandId: string } | null;
  /** Pre-fill «Desde» (the report's first day). */
  desdeInicial?: string;
}) {
  const { t } = useTranslation();
  const locale = localeActual();
  const qc = useQueryClient();
  const q = useTarifasEntreMarcas(abierto);
  const hoy = hoyEnLaEmpresa();
  const [empleadora, setEmpleadora] = useState("");
  const [cliente, setCliente] = useState("");
  const [monto, setMonto] = useState("");
  const [desde, setDesde] = useState(desdeInicial || hoy);
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const orden = useMemo(() => marcas.map((b) => b.id), [marcas]);
  const tarifas = q.data?.rates ?? [];
  const moneda = q.data?.currency || "USD";
  const grupos = useMemo(() => tarifasPorPar(tarifas, orden), [tarifas, orden]);

  useEffect(() => {
    if (!abierto) return;
    setEmpleadora(parInicial?.employerBrandId || "");
    setCliente(parInicial?.siteBrandId || "");
    setMonto("");
    setDesde(desdeInicial || hoy);
    setIntento(false);
  }, [abierto, parInicial, desdeInicial, hoy]);

  // A pair keeps its currency: the one of its first rate, else the company's.
  const monedaDelPar =
    tarifas.find((x) => x.employerBrandId === empleadora && x.siteBrandId === cliente)?.currency || moneda;
  const problema = revisarTarifa({ employerBrandId: empleadora, siteBrandId: cliente, monto, desde });
  const textoDelProblema =
    problema === "faltanMarcas"
      ? t("ui.TarifasEntreMarcas.faltanMarcas", "Elige las dos empresas.")
      : problema === "mismaMarca"
        ? t("ui.TarifasEntreMarcas.mismaMarca", "La tarifa es entre dos empresas distintas.")
        : problema === "montoMalo"
          ? t("ui.TarifasEntreMarcas.montoMalo", "Escribe un importe por hora (0 o más).")
          : problema === "fechaMala"
            ? t("ui.TarifasEntreMarcas.fechaMala", "Elige desde qué día rige.")
            : null;

  const refrescar = async () => {
    await qc.invalidateQueries({ queryKey: ["marcas", "tarifas"] });
    await qc.invalidateQueries({ queryKey: ["marcas", "horas"] });
  };

  const guardar = async () => {
    setIntento(true);
    if (problema) return;
    setGuardando(true);
    try {
      await tarifasEntreMarcasService.guardar([
        cambioDeTarifa({ employerBrandId: empleadora, siteBrandId: cliente, monto, desde, moneda: monedaDelPar }),
      ]);
      toast.success(t("ui.TarifasEntreMarcas.guardada", "Tarifa guardada"));
      setMonto("");
      setIntento(false);
      await refrescar();
    } catch (e) {
      toast.error(mensajeDeMarca(t, codigoDeError(e)));
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (x: TarifaEntreMarcas) => {
    const ok = await confirmDialog({
      title: t("ui.TarifasEntreMarcas.quitarTitulo", "¿Quitar esta tarifa?"),
      message: t(
        "ui.TarifasEntreMarcas.quitarMensaje",
        "Las horas desde el {{desde}} pasan a la tarifa anterior, o quedan sin tarifa.",
        { desde: soloFechaCivil(x.effectiveFrom) },
      ),
      confirmText: t("ui.TarifasEntreMarcas.quitar", "Quitar"),
      cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
      tone: "danger",
    });

    if (!ok) return;
    try {
      await tarifasEntreMarcasService.guardar([
        { employerBrandId: x.employerBrandId, siteBrandId: x.siteBrandId, rateCents: null, effectiveFrom: x.effectiveFrom },
      ]);
      await refrescar();
    } catch (e) {
      toast.error(mensajeDeMarca(t, codigoDeError(e)));
    }
  };

  const select = (id: string, valor: string, poner: (v: string) => void) => (
    <select className={FIELD_CLS} id={id} value={valor} onChange={(e) => poner(e.target.value)}>
      <option value="">{t("ui.TarifasEntreMarcas.elige", "Elige")}</option>
      {marcas.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );

  return (
    <Modal
      description={t(
        "ui.TarifasEntreMarcas.ayuda",
        "La empresa del cliente le paga a la empresa que pone el personal esta tarifa por cada hora aprobada. Cada tarifa rige desde su fecha; las horas anteriores mantienen la suya.",
      )}
      footer={
        <div className="flex w-full justify-end">
          <Button type="button" variant="outline" onClick={onCerrar}>
            {t("common.close", { defaultValue: "Cerrar" })}
          </Button>
        </div>
      }
      icon={<BadgeDollarSign />}
      open={abierto}
      size="lg"
      title={t("ui.TarifasEntreMarcas.titulo", "Tarifas por hora entre marcas")}
      onOpenChange={(o) => !o && onCerrar()}
    >
      <div className="space-y-4" data-testid="tarifas-entre-marcas">
        {puedeEditar ? (
          <div className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                htmlFor="tarifa-empleadora"
                label={t("ui.HorasEntreMarcas.empresaPersonal", "Empresa que pone el personal")}
              >
                {select("tarifa-empleadora", empleadora, setEmpleadora)}
              </FormField>
              <FormField
                htmlFor="tarifa-cliente"
                label={t("ui.HorasEntreMarcas.empresaCliente", "Empresa del cliente")}
              >
                {select("tarifa-cliente", cliente, setCliente)}
              </FormField>
              <FormField
                hint={monedaDelPar}
                htmlFor="tarifa-monto"
                label={t("ui.TarifasEntreMarcas.porHora", "Tarifa por hora")}
              >
                <input
                  className={`${FIELD_CLS} tabular-nums`}
                  id="tarifa-monto"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                />
              </FormField>
              <FormField htmlFor="tarifa-desde" label={t("ui.TarifasEntreMarcas.desde", "Rige desde")}>
                <input
                  className={FIELD_CLS}
                  id="tarifa-desde"
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </FormField>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium" role={intento && textoDelProblema ? "alert" : undefined} style={{ color: "var(--bad-text)" }}>
                {intento ? textoDelProblema : ""}
              </p>
              <Button disabled={guardando} type="button" variant="brand" onClick={guardar}>
                {guardando ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Plus className="mr-1.5 size-4" />}
                {t("ui.TarifasEntreMarcas.guardar", "Guardar tarifa")}
              </Button>
            </div>
          </div>
        ) : (
          <InfoNote tone="neutral">
            {t(
              "ui.TarifasEntreMarcas.soloLectura",
              "Las tarifas las fija la administración de la empresa.",
            )}
          </InfoNote>
        )}

        {q.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin" style={{ color: "var(--ink-faint)" }} />
          </div>
        ) : !grupos.length ? (
          <EmptyState
            description={t(
              "ui.TarifasEntreMarcas.vacioDesc",
              "Sin tarifa, el informe muestra las horas pero no el importe.",
            )}
            icon={<BadgeDollarSign />}
            title={t("ui.TarifasEntreMarcas.vacio", "Todavía no hay tarifas")}
          />
        ) : (
          <div className="space-y-3">
            {grupos.map((g) => {
              const vigente = tarifaVigente(tarifas, g.employerBrandId, g.siteBrandId, hoy);

              return (
                <div
                  key={`${g.employerBrandId}|${g.siteBrandId}`}
                  className="rounded-xl border p-3"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <EtiquetaDeMarca marca={etiqueta(g.employerBrandId)} />
                    <span className="truncate">{etiqueta(g.employerBrandId)?.nombre}</span>
                    <ArrowRight className="size-3.5" style={{ color: "var(--ink-faint)" }} />
                    <EtiquetaDeMarca marca={etiqueta(g.siteBrandId)} />
                    <span className="truncate">{etiqueta(g.siteBrandId)?.nombre}</span>
                  </div>
                  <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                    {g.tarifas.map((x) => (
                      <li key={x.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                        <span style={{ color: "var(--ink-soft)" }}>
                          {t("ui.TarifasEntreMarcas.desdeEl", "Desde el {{fecha}}", { fecha: soloFechaCivil(x.effectiveFrom) })}
                          {vigente?.id === x.id && (
                            <span
                              className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{ background: "color-mix(in oklab, var(--ok) 16%, transparent)", color: "var(--ok-text, var(--ok))" }}
                            >
                              {t("ui.TarifasEntreMarcas.vigente", "Vigente")}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">
                            {t("ui.TarifasEntreMarcas.porHoraValor", "{{monto}} / h", {
                              monto: textoDeImporte(x.rateCents, x.currency, locale),
                            })}
                          </span>
                          {puedeEditar && (
                            <Button
                              aria-label={t("ui.TarifasEntreMarcas.quitar", "Quitar")}
                              size="icon"
                              type="button"
                              variant="ghost"
                              onClick={() => void quitar(x)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
