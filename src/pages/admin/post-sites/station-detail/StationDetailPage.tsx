import type { RecentShiftRow } from "./stationDetailTypes";

import React, { useEffect, useState } from "react";
import { useParams, useLocation, Navigate } from "react-router-dom";
import { Loader2, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

import StationOverview from "./components/StationOverview";
import StationHero from "./components/StationHero";
import StationVisitors from "./components/StationVisitors";
import StationGuards from "./components/StationGuards";
import StationShifts from "./components/StationShifts";
import StationSiteTours from "./components/StationSiteTours";
import StationRondaHistory from "./components/StationRondaHistory";
import StationInventory from "./components/StationInventory";
import StationIncidents from "./components/StationIncidents";
import StationPatrolQR from "./components/StationPatrolQR";
import StationParking from "./components/StationParking";
import StationOrders from "./components/StationOrders";
import StationPassdowns from "./components/StationPassdowns";
import { EventoTurnos, EventoVigilantes } from "./components/EventoDeLaEstacion";

import { EmptyState, FadeIn } from "@/components/kit";
import { ApiService } from "@/services/api/apiService";
import StationLayout from "@/layouts/StationLayout";
import { esEvento } from "@/lib/eventos";

export default function StationDetailPage() {
  const { t } = useTranslation();
  const { postSiteId, stationId } = useParams();
  const location = useLocation();

  // /post-sites/:postSiteId/stations/:stationId[/:tab]
  // parts: ['post-sites', postSiteId, 'stations', stationId, tab?]
  const parts = location.pathname.split("/").filter(Boolean);
  const currentTab = parts[4] || "overview";

  const [station, setStation] = useState<any | null>(null);
  /* ARRANCA EN `true`, Y ESO ES EL ARREGLO.
     Con `false`, el primer pintado entraba por la rama de abajo y montaba la
     cabecera y la pestaña ANTES de tener puesto; el efecto ponía `loading` a
     true acto seguido, las desmontaba para enseñar el giro, y al llegar la
     respuesta las volvía a montar. Dos montajes = dos rondas de peticiones de
     TODA la pantalla. Medido en producción: `guard-shift` 4x, `post-site` 2x y
     `station/:id/positions` 2x, con los pares separados justo por lo que tarda
     la lectura del puesto (~640 ms). */
  const [loading, setLoading] = useState(true);
  /* Las marcaciones recientes del puesto, leídas UNA vez aquí.
     Las pedían la cabecera (para «quién está de turno ahora») y el resumen
     (para la lista de actividad) con la MISMA url, cada una por su cuenta. */
  const [recentShifts, setRecentShifts] = useState<RecentShiftRow[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Sin puesto no hay nada que leer, pero hay que soltar el giro: `loading`
    // arranca en `true` y si nadie lo baja la pantalla se queda girando.
    if (!stationId) {
      setLoading(false);

      return;
    }
    let mounted = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const tenantId = localStorage.getItem("tenantId") || "";
        const res = await ApiService.get(
          `/tenant/${tenantId}/station/${encodeURIComponent(stationId)}`,
        );
        const data = (res && (res.data || res)) || res;

        if (mounted) setStation(data);
      } catch (e: any) {
        if (mounted)
          setError(
            e?.message ||
              t("station.details.loadError", "Error al cargar puesto"),
          );
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [stationId]);

  // Marcaciones recientes del puesto: una sola lectura para la cabecera y el
  // resumen, que antes pedían esto mismo por separado.
  useEffect(() => {
    if (!stationId) return;
    let alive = true;
    const tenantId = localStorage.getItem("tenantId") || "";

    ApiService.get(
      `/tenant/${tenantId}/guard-shift?filter[stationName]=${encodeURIComponent(
        stationId,
      )}&limit=15&orderBy=punchInTime_DESC`,
    )
      .then((res: any) => {
        if (!alive) return;
        setRecentShifts((res && (res.rows || res.data?.rows)) || []);
      })
      .catch(() => alive && setRecentShifts([]));

    return () => {
      alive = false;
    };
  }, [stationId]);

  // Redirect bare /post-sites/:postSiteId/stations/:stationId → overview
  if (parts.length === 4) {
    return (
      <Navigate
        replace
        to={`/post-sites/${postSiteId}/stations/${stationId}/overview`}
      />
    );
  }

  const tabProps = {
    station,
    stationId: stationId || "",
    postSiteId: postSiteId || "",
  };

  const evento = esEvento(station?.postSite);

  const renderTab = () => {
    switch (currentTab) {
      case "overview":
        return <StationOverview {...tabProps} recentShifts={recentShifts} />;
      case "visitors":
        return <StationVisitors {...tabProps} />;
      /* En un EVENTO, Vigilantes y Turnos sólo hablan del evento: quién cubre
         qué relevo y a qué hora. Sin rotación, sacafranco ni semanas. */
      case "guards":
        return evento ? (
          <EventoVigilantes {...tabProps} />
        ) : (
          <StationGuards {...tabProps} />
        );
      case "shifts":
        return evento ? (
          <EventoTurnos {...tabProps} />
        ) : (
          <StationShifts {...tabProps} />
        );
      case "orders":
        return <StationOrders {...tabProps} />;
      case "site-tours":
        return <StationSiteTours {...tabProps} />;
      case "tag-scans":
        return <StationRondaHistory {...tabProps} />;
      case "inventory":
        return <StationInventory {...tabProps} />;
      case "incidents":
        return <StationIncidents {...tabProps} />;
      case "etiquetas":
        return <StationPatrolQR {...tabProps} />;
      case "parking":
        return <StationParking {...tabProps} />;
      case "passdowns":
        return <StationPassdowns {...tabProps} />;
      default:
        return <StationOverview {...tabProps} recentShifts={recentShifts} />;
    }
  };

  return (
    <StationLayout station={station}>
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin brand-text" />
          </div>
        ) : error ? (
          <EmptyState
            description={error}
            icon={<AlertTriangle />}
            title={t("station.details.loadError", "Error al cargar puesto")}
          />
        ) : (
          <FadeIn className="space-y-4">
            <StationHero
              postSiteId={postSiteId || ""}
              recentShifts={recentShifts}
              station={station}
              stationId={stationId || ""}
              onNicknameChanged={(n) =>
                setStation((prev: any) => ({ ...prev, nickname: n }))
              }
              onRenamed={(n) =>
                setStation((prev: any) => ({
                  ...prev,
                  stationName: n,
                  name: n,
                }))
              }
            />
            {renderTab()}
            {/* Aire al final de la pestaña. La burbuja de VigIA está fija en la
              esquina inferior derecha y tapaba el «Guardar» de los formularios
              en línea que caen al final de una lista larga —el de añadir un
              punto a una ronda, sin ir más lejos: el clic abría el chat—. Sin
              este hueco no hay adónde desplazarse para despejarlo. Ver
              `apartarDelWidget`, que es quien hace el empujón. */}
            <div aria-hidden className="h-24" />
          </FadeIn>
        )}
      </div>
    </StationLayout>
  );
}
