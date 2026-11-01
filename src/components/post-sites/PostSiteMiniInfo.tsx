import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import IncidentMap from "@/components/IncidentMap/IncidentMap";
import { stationService } from "@/lib/api/stationService";

export default function PostSiteMiniInfo({
  postSiteId,
}: {
  postSiteId: string;
}) {
  const [site, setSite] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (!postSiteId) return;
    let mounted = true;

    setLoading(true);
    stationService
      .get(postSiteId)
      .then((data) => {
        if (mounted) setSite(data);
      })
      .catch((e) => {
        console.error("PostSiteMiniInfo: failed to load postSite", e);
        if (mounted)
          setError(
            t("guards.assignSites.postSiteLoadError", {
              defaultValue: "No se pudo cargar la sede",
            }),
          );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [postSiteId]);

  if (loading)
    return (
      <div className="text-xs text-muted-foreground">
        {t("guards.assignSites.postSiteLoading", {
          defaultValue: "Cargando información de la sede...",
        })}
      </div>
    );
  if (error) return <div className="text-xs text-red-400">{error}</div>;
  if (!site) return null;

  return (
    <div className="border rounded p-3 bg-muted/30 mb-2">
      <div className="font-semibold text-sm mb-1">
        {site.companyName || site.name}
      </div>
      <div className="text-xs text-foreground/70 mb-1">{site.address}</div>
      {site.latitud && site.longitud && (
        <IncidentMap
          label={site.companyName || site.name}
          lat={parseFloat(site.latitud)}
          lng={parseFloat(site.longitud)}
        />
      )}
      <div className="text-xs text-muted-foreground">
        {site.city}, {site.country}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="px-2 py-1 text-xs rounded-full bg-blue-500/10 text-blue-600">
          {t("clients.stations.guardsCount", "Vigilantes")}:{" "}
          {site.guardsCount ??
            (Array.isArray(site.assignedGuards)
              ? site.assignedGuards.length
              : (site.numberOfGuardsInStation ?? 0))}
        </div>
        {site.latitud && site.longitud && (
          <div className="px-2 py-1 text-xs rounded-full bg-muted/30 text-foreground">
            {parseFloat(site.latitud).toFixed(4)},{" "}
            {parseFloat(site.longitud).toFixed(4)}
          </div>
        )}
      </div>
    </div>
  );
}
