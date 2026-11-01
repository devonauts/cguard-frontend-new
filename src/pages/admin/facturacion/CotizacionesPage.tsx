/**
 * QUOTES — proposals to prospects (or to existing clients): the pipeline at a
 * glance, the list by status, and the way into a new one. A quote is signed
 * online by the prospect and then converted into a client + draft contract.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileSignature, Plus, Target, Trophy, Wallet } from "lucide-react";

import {
  QK,
  dinero,
  destinatarioDeCotizacion,
  useEtiquetasDeFacturacion,
  conModuloDeFacturacion,
} from "./comun";

import EtiquetaDeSucursal from "@/components/sucursales/EtiquetaDeSucursal";
import { useEtiquetasDeSucursal } from "@/hooks/useEtiquetasDeSucursal";
import { useEtiquetasDeMarca } from "@/hooks/useMarcas";
import EtiquetaDeMarca from "@/components/multimarca/EtiquetaDeMarca";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/table/DataTable";
import {
  PageContainer,
  PageHeader,
  Section,
  EmptyState,
  StatusBadge,
  Toolbar,
  StatsStrip,
  StatCard,
  SearchInput,
} from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import { soloFechaCivil } from "@/lib/horaDeLaEmpresa";
import clientBillingService, {
  QUOTE_STATUSES,
  type Quote,
  type QuoteFilterStatus,
  type QuoteStatus,
} from "@/lib/api/clientBillingService";

type Filtro = QuoteFilterStatus | "all";

function CotizacionesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { hasPermission } = usePermissions();
  const etiquetas = useEtiquetasDeFacturacion();
  const status = (params.get("status") || "all") as Filtro;
  const [busqueda, setBusqueda] = useState(params.get("q") || "");
  const q = params.get("q") || "";
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);

    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const lista = useQuery({
    queryKey: [QK, "quotes", { status, q }],
    queryFn: () =>
      clientBillingService.quotes({
        status: status === "all" ? undefined : status,
        q: q || undefined,
      }),
  });
  const filas: Quote[] = lista.data?.quotes ?? [];
  const pipeline = lista.data?.pipeline;
  const moneda = filas[0]?.currency || "USD";
  const conteo = (s: QuoteStatus) => pipeline?.byStatus?.[s]?.count ?? 0;
  const abiertas = conteo("draft") + conteo("sent") + conteo("viewed");
  const ganadas = conteo("accepted") + conteo("converted");
  const puedeCrear = hasPermission("estimateCreate");

  // Sucursales (vista global): de qué sucursal es cada propuesta.
  const etiquetasSuc = useEtiquetasDeSucursal();
  // Multimarca («Todas las marcas»): which brand issues each quote.
  const etiquetasMarca = useEtiquetasDeMarca();
  const columnas: Column<Quote>[] = [
    {
      key: "number",
      header: t("ui.Cotizaciones.lista.numero", "Número"),
      titulo: true,
      render: (_v, r) => (
        <span className="font-medium tabular-nums">
          {r.number}
          {Number(r.revision) > 1 && (
            <span
              className="ml-1 text-xs"
              style={{ color: "var(--ink-faint)" }}
            >
              {t("ui.Cotizaciones.revisionCorta", "rev. {{n}}", {
                n: r.revision,
              })}
            </span>
          )}
          {etiquetasSuc.activo && (
            <EtiquetaDeSucursal
              empresa
              className="ml-1.5"
              sucursal={etiquetasSuc.sucursal(r.branchId)}
            />
          )}
          <EtiquetaDeMarca
            className="ml-1.5"
            marca={etiquetasMarca.marca(r.brandId)}
          />
        </span>
      ),
    },
    {
      key: "prospect",
      header: t("ui.Cotizaciones.lista.para", "Prospecto / cliente"),
      render: (_v, r) => destinatarioDeCotizacion(r),
    },
    {
      key: "title",
      header: t("ui.Cotizaciones.lista.titulo", "Título"),
      render: (v) => <span className="line-clamp-1">{v || "—"}</span>,
    },
    {
      key: "monthlyTotalCents",
      header: t("ui.Cotizaciones.lista.mensual", "Total mensual"),
      numeric: true,
      render: (v, r) => dinero(Number(v), r.currency),
    },
    {
      key: "oneTimeCents",
      header: t("ui.Cotizaciones.lista.unico", "Pago único"),
      numeric: true,
      render: (v, r) => (Number(v) ? dinero(Number(v), r.currency) : "—"),
    },
    {
      key: "validUntil",
      header: t("ui.Cotizaciones.lista.validaHasta", "Válida hasta"),
      render: (v) => soloFechaCivil(v),
    },
    {
      key: "status",
      header: t("ui.Cotizaciones.lista.estado", "Estado"),
      render: (v: QuoteStatus) => (
        <StatusBadge tone={etiquetas.quoteTone[v]}>
          {etiquetas.quoteStatus[v] || v}
        </StatusBadge>
      ),
    },
  ];

  const nueva = puedeCrear ? (
    <Button
      variant="brand"
      onClick={() => navigate("/facturacion/cotizaciones/nueva")}
    >
      <Plus size={14} /> {t("ui.Cotizaciones.nueva", "Nueva cotización")}
    </Button>
  ) : undefined;

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          actions={nueva}
          icon={<FileSignature />}
          subtitle={t(
            "ui.Cotizaciones.subtitulo",
            "Propuestas de servicio a prospectos: se firman en línea y, al aceptarse, se convierten en cliente y contrato con un clic.",
          )}
          title={t("ui.Cotizaciones.titulo", "Cotizaciones")}
        />

        <StatsStrip className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            accent="info"
            hint={t("ui.Cotizaciones.pipeline.abiertasN", "{{n}} abiertas", {
              n: abiertas,
            })}
            icon={<Wallet className="h-4 w-4" />}
            label={t(
              "ui.Cotizaciones.pipeline.abiertoMensual",
              "Valor mensual abierto",
            )}
            value={dinero(pipeline?.openMonthlyCents ?? 0, moneda)}
          />
          <StatCard
            accent="ok"
            hint={t("ui.Cotizaciones.pipeline.ganadasN", "{{n}} ganadas", {
              n: ganadas,
            })}
            icon={<Trophy className="h-4 w-4" />}
            label={t("ui.Cotizaciones.pipeline.tasaDeCierre", "Tasa de cierre")}
            value={pipeline?.winRate == null ? "—" : `${pipeline.winRate} %`}
          />
          <StatCard
            accent="neutral"
            icon={<Target className="h-4 w-4" />}
            label={t("ui.Cotizaciones.pipeline.porEstado", "Por estado")}
            value={
              <span className="flex flex-wrap gap-1 text-sm font-normal">
                {QUOTE_STATUSES.filter((s) => conteo(s) > 0).map((s) => (
                  <button
                    key={s}
                    className="cg-focus rounded-full"
                    type="button"
                    onClick={() => setParam("status", s)}
                  >
                    <StatusBadge tone={etiquetas.quoteTone[s]}>
                      {etiquetas.quoteStatus[s]} · {conteo(s)}
                    </StatusBadge>
                  </button>
                ))}
                {!QUOTE_STATUSES.some((s) => conteo(s) > 0) && (
                  <span style={{ color: "var(--ink-faint)" }}>—</span>
                )}
              </span>
            }
          />
        </StatsStrip>

        <Toolbar>
          <select
            className="cg-input"
            value={status}
            onChange={(e) =>
              setParam("status", e.target.value === "all" ? "" : e.target.value)
            }
          >
            <option value="all">
              {t("ui.Cotizaciones.filtro.todas", "Todas")}
            </option>
            <option value="open">
              {t(
                "ui.Cotizaciones.filtro.abiertas",
                "Abiertas (borrador, enviadas, vistas)",
              )}
            </option>
            {QUOTE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {etiquetas.quoteStatus[s]}
              </option>
            ))}
          </select>
          <form
            className="min-w-[14rem] flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              setParam("q", busqueda.trim());
            }}
          >
            <SearchInput
              placeholder={t(
                "ui.Cotizaciones.filtro.buscar",
                "Buscar por número, título, empresa o contacto",
              )}
              value={busqueda}
              onBlur={() => setParam("q", busqueda.trim())}
              onChange={(v) => {
                setBusqueda(v);
                if (!v) setParam("q", "");
              }}
            />
          </form>
        </Toolbar>

        <Section bare>
          <DataTable
            columns={columnas}
            data={filas}
            emptyState={
              <EmptyState
                action={nueva}
                description={t(
                  "ui.Cotizaciones.vacioDesc",
                  "Escribe la primera: puestos por hora, cuotas mensuales y pagos únicos. El prospecto la firma desde el enlace del correo.",
                )}
                icon={<FileSignature />}
                title={
                  q || status !== "all"
                    ? t(
                        "ui.Cotizaciones.vacioFiltro",
                        "Ninguna cotización con ese filtro",
                      )
                    : t("ui.Cotizaciones.vacio", "Todavía no hay cotizaciones")
                }
              />
            }
            loading={lista.isLoading}
            onRowClick={(r) => navigate(`/facturacion/cotizaciones/${r.id}`)}
          />
        </Section>
      </PageContainer>
    </AppLayout>
  );
}

export default conModuloDeFacturacion(CotizacionesPage);
