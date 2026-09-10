/**
 * Página de ESTACIONES — la vista general que pidió el dueño, como la de clientes
 * pero por estación: tarjetas con el logo del cliente, el «nominativo» de título,
 * el puesto y los vigilantes asignados. Para que una empresa de seguridad
 * encuentre y abra una estación de un vistazo.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RadioTower } from "lucide-react";

import StationCardsGrid from "./StationCardsGrid";

import AppLayout from "@/layouts/app-layout";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  PageContainer,
  PageHeader,
  Toolbar,
  SearchInput,
  IconTile,
} from "@/components/kit";
import { stationService, type StationCard } from "@/lib/api/stationService";

/** Normaliza para búsqueda: sin acentos. */
const sinAcentos = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export default function StationsPage() {
  const { t } = useTranslation();

  usePageTitle(t("stations.title", { defaultValue: "Estaciones" }));
  const navigate = useNavigate();

  const [stations, setStations] = useState<StationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;

    setLoading(true);
    stationService
      .getStationCards()
      .then((rows) => {
        if (alive) setStations(rows);
      })
      .catch(() => {
        if (alive) setStations([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = sinAcentos(query.trim().toLowerCase());

    if (!q) return stations;

    return stations.filter((s) => {
      const hay = sinAcentos(
        `${s.nickname ?? ""} ${s.stationName ?? ""} ${s.clientName ?? ""} ${s.postSiteName ?? ""}`.toLowerCase(),
      );

      return hay.includes(q);
    });
  }, [stations, query]);

  const openStation = (s: StationCard) => {
    // El detalle vive bajo el puesto. Sin puesto, no hay ruta de detalle todavía.
    if (s.postSiteId)
      navigate(`/post-sites/${s.postSiteId}/stations/${s.id}/overview`);
  };

  /* Entrar DIRECTO a lo que se va a hacer. Montar las rondas de un puesto y
     dar de alta el puesto son la misma tarea, pero la tarjeta caía siempre en
     el resumen y había que ir a buscar la pestaña. La pestaña es el último
     segmento de la ruta. */
  const openStationTab = (s: StationCard, tab: string) => {
    if (s.postSiteId)
      navigate(`/post-sites/${s.postSiteId}/stations/${s.id}/${tab}`);
  };

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          badges={
            !loading ? (
              <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
                {t("stations.count", {
                  defaultValue: "{{n}} estación(es)",
                  n: filtered.length,
                })}
              </span>
            ) : undefined
          }
          icon={
            <IconTile>
              <RadioTower />
            </IconTile>
          }
          subtitle={t("stations.subtitle", {
            defaultValue:
              "Todas tus estaciones, con su cliente y sus vigilantes.",
          })}
          title={t("stations.title", { defaultValue: "Estaciones" })}
        />

        <Toolbar>
          <SearchInput
            className="w-full sm:max-w-md"
            placeholder={t("stations.searchPlaceholder", {
              defaultValue: "Buscar por nominativo, puesto o cliente…",
            })}
            value={query}
            onChange={setQuery}
          />
        </Toolbar>

        <StationCardsGrid
          loading={loading}
          stations={filtered}
          onOpen={openStation}
          onOpenTab={openStationTab}
        />
      </PageContainer>
    </AppLayout>
  );
}
