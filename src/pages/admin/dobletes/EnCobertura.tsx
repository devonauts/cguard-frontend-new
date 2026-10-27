/**
 * The Dobletes pieces that live inside Cobertura en vivo: the live state of a
 * gap's offer search (a chip that links to it) and the hook that knows which
 * gaps have one. Without the module nothing here renders or polls.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Radio } from "lucide-react";

import { MODULO, usePuedeGestionarDobletes } from "./comun";

import { useEntitlement } from "@/hooks/useEntitlement";
import dobletesService, { type OfferSearch } from "@/lib/api/dobletesService";

/** Live searches by gap id, plus whether this person may launch new ones. */
export function useDobletesEnCobertura() {
  const tiene = useEntitlement(MODULO);
  const puede = usePuedeGestionarDobletes();
  const activas = useQuery({
    queryKey: ["dobletes", "searches", "activas"],
    queryFn: () => dobletesService.searches({ status: "active" }),
    enabled: tiene,
    refetchInterval: 15_000,
    retry: false,
  });
  const porHueco = useMemo(() => {
    const m = new Map<string, OfferSearch>();

    for (const s of activas.data ?? []) m.set(s.coverageEventId, s);

    return m;
  }, [activas.data]);

  return {
    tiene,
    puede: tiene && puede,
    porHueco,
    recargar: () => activas.refetch(),
  };
}

/** «Buscando · oleada 1 · 3 esperando» — opens the search in Dobletes. */
export function ChipDeBusqueda({ s }: { s: OfferSearch }) {
  const { t } = useTranslation();
  const pendientes = (s.offers ?? []).filter(
    (o) => o.status === "pending",
  ).length;

  return (
    <Link
      className="cg-focus inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold"
      style={{
        borderColor: "color-mix(in oklab, var(--info) 35%, transparent)",
        background: "color-mix(in oklab, var(--info) 12%, transparent)",
        color: "var(--info-text)",
      }}
      title={t("dobletes.cobertura.verBusqueda", "Ver la búsqueda en Dobletes")}
      to={`/dobletes?tab=ofertas&busqueda=${encodeURIComponent(s.id)}`}
    >
      <Radio className="size-3.5 motion-safe:animate-pulse" />
      {t("dobletes.cobertura.buscando", {
        defaultValue: "Doblete ofrecido · {{n}} esperando",
        n: pendientes,
      })}
    </Link>
  );
}
