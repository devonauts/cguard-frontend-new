import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import GoogleMapEmbed, {
  type MapEmbedMarker,
} from "@/components/GoogleMap/GoogleMapEmbed";
import {
  mapPopupActions,
  mapPopupItems,
  type MapPopupTone,
} from "@/components/maps/MapPopup";
import { ApiService } from "@/services/api/apiService";
import { relevosDeLaEstacion, ventanaDeRelevos } from "@/lib/eventos";

/**
 * LAS ZONAS DE UN EVENTO SOBRE EL RECINTO.
 *
 * Un evento no se lee como una dirección: se lee como un plano. «Puerta
 * principal 12/12, Pista 8/8, Taquilla 0/2» dicho encima del satélite del
 * estadio es lo que el supervisor necesita ver de un vistazo —qué zona está
 * cubierta, cuál no y quién está en cada una—. Cada estación ya guarda el punto
 * exacto donde se arrastró su pin al crearla; aquí sólo se pintan.
 *
 * Misma disciplina de coste que `SitesMap`: imagen estática hasta que alguien
 * pulsa; sólo entonces el mapa dinámico, en satélite y encuadrado a las zonas.
 */

interface Zona {
  id: string;
  nombre: string;
  /** Sin pin (la sede se creó sin ubicación): sale en la lista, no en el mapa. */
  lat: number | null;
  lng: number | null;
  cupo: number;
  horario: string;
  vigilantes: string[];
}

const num = (v: unknown): number | null => {
  const n = Number(v);

  return Number.isFinite(n) && n !== 0 ? n : null;
};

const filas = (r: any): any[] =>
  Array.isArray(r)
    ? r
    : Array.isArray(r?.rows)
      ? r.rows
      : Array.isArray(r?.data)
        ? r.data
        : [];

export default function ZonasDelEventoMap({
  tenantId,
  postSiteId,
  height = "520px",
}: {
  tenantId: string;
  postSiteId: string;
  height?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [zonas, setZonas] = useState<Zona[] | null>(null);

  useEffect(() => {
    let vivo = true;

    (async () => {
      const est = filas(
        await ApiService.get(
          `/tenant/${tenantId}/station?filter[postSite]=${encodeURIComponent(postSiteId)}&limit=999`,
        ).catch(() => []),
      );
      const conPunto = est.map((s: any) => ({
        s,
        lat: num(s.latitud ?? s.latitude),
        lng: num(s.longitud ?? s.longitude),
      }));
      const asignaciones = await Promise.all(
        conPunto.map(({ s }) =>
          ApiService.get(
            `/tenant/${tenantId}/guard-assignments?stationId=${encodeURIComponent(s.id)}&status=active`,
          )
            .then(filas)
            .catch(() => []),
        ),
      );

      if (!vivo) return;
      setZonas(
        conPunto.map(({ s, lat, lng }, i) => ({
          id: String(s.id),
          nombre: String(s.stationName || ""),
          lat,
          lng,
          // El cupo son las PLAZAS (con relevos, plazas × relevos); la cifra
          // de la fila del puesto sólo es el respaldo si no vinieron.
          cupo:
            (Array.isArray(s.positions) && s.positions.length) ||
            Number(s.numberOfGuardsInStation) ||
            0,
          horario: (() => {
            const r = relevosDeLaEstacion(s.positions);

            return r.length > 1
              ? t("ui.eventos.rotuloRelevos", {
                  defaultValue: "{{ventana}} · {{count}} relevos",
                  ventana: ventanaDeRelevos(r, s),
                  count: r.length,
                })
              : ventanaDeRelevos(r, s);
          })(),
          // Los relevos de cobertura (`isRelief`) no ocupan plaza del evento:
          // la pestaña Vigilantes tampoco los cuenta.
          vigilantes: asignaciones[i]
            .filter((a: any) => !a.isRelief)
            .map(
              (a: any) =>
                a.guard?.fullName ||
                [a.guard?.firstName, a.guard?.lastName]
                  .filter(Boolean)
                  .join(" "),
            )
            .filter(Boolean),
        })),
      );
    })();

    return () => {
      vivo = false;
    };
  }, [tenantId, postSiteId]);

  const tono = (z: Zona): MapPopupTone =>
    z.vigilantes.length >= z.cupo && z.cupo > 0
      ? "ok"
      : z.vigilantes.length > 0
        ? "warn"
        : "bad";

  const markers = useMemo<MapEmbedMarker[]>(
    () =>
      (zonas || [])
        .filter((z) => z.lat !== null && z.lng !== null)
        .map((z) => ({
          id: z.id,
          lat: z.lat as number,
          lng: z.lng as number,
          label: z.nombre,
          kind: "station" as const,
          subtitle: z.horario || undefined,
          role: z.vigilantes.length ? undefined : "muted",
          status: {
            label: `${z.vigilantes.length}/${z.cupo}`,
            tone: tono(z),
          },
        })),
    [zonas],
  );

  const porId = useMemo(
    () => new Map((zonas || []).map((z) => [z.id, z])),
    [zonas],
  );
  const irAZona = (id: string) =>
    navigate(`/post-sites/${postSiteId}/stations/${id}/guards`);

  if (!zonas) {
    return (
      <div
        className="animate-pulse rounded-xl"
        style={{ height, background: "var(--glass-sunken)" }}
      />
    );
  }
  if (!zonas.length) return null;

  const cupo = zonas.reduce((n, z) => n + z.cupo, 0);
  const cubiertas = zonas.reduce(
    (n, z) => n + Math.min(z.vigilantes.length, z.cupo),
    0,
  );

  return (
    <div className="flex flex-col gap-3">
      {markers.length ? (
        <div
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--hairline)" }}
        >
            <div style={{ height }}>
              <GoogleMapEmbed
                fitMarkers
                draggable={false}
                mapType="satellite"
                markerPopup={(m) => {
                  const z = porId.get(m.id);

                  if (!z) return null;

                  return {
                    fields: mapPopupItems(
                      z.vigilantes.length
                        ? {
                            label: t(
                              "ui.ZonasDelEventoMap.quienes",
                              "Vigilantes",
                            ),
                            value: z.vigilantes.join(", "),
                            wide: true,
                          }
                        : null,
                    ),
                    metrics: [
                      {
                        label: t("ui.ZonasDelEventoMap.asignados", "Asignados"),
                        value: z.vigilantes.length,
                        tone: tono(z),
                      },
                      {
                        label: t("ui.ZonasDelEventoMap.cupo", "Cupo"),
                        value: z.cupo,
                      },
                    ],
                    actions: mapPopupItems(
                      mapPopupActions.detail(
                        () => irAZona(z.id),
                        t(
                          "ui.ZonasDelEventoMap.verVigilantes",
                          "Ver vigilantes",
                        ),
                      ),
                    ),
                  };
                }}
                markers={markers}
                zoom={17}
              />
            </div>
        </div>
      ) : (
        <div
          className="rounded-xl border border-dashed p-4 text-sm"
          style={{ borderColor: "var(--hairline)", color: "var(--ink-soft)" }}
        >
          {t(
            "ui.ZonasDelEventoMap.sinUbicacion",
            "Las zonas de este evento no tienen ubicación: edita cada estación y arrastra su pin para verlas sobre el recinto.",
          )}
        </div>
      )}

      {/* La misma lectura en lista: en el teléfono el mapa es pequeño y aquí
          se ve de un golpe qué zona falta. */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span style={{ color: "var(--ink-soft)" }}>
          {t("ui.ZonasDelEventoMap.resumen", {
            defaultValue: "{{cubiertas}} de {{cupo}} plazas cubiertas",
            cubiertas,
            cupo,
          })}
        </span>
        {zonas.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => irAZona(z.id)}
            className="cg-focus inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1"
            style={{
              borderColor: "var(--hairline)",
              background: "var(--glass-flat)",
            }}
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ background: `var(--${tono(z)})` }}
            />
            {z.nombre}
            <span className="tabular-nums" style={{ color: "var(--ink-soft)" }}>
              {z.vigilantes.length}/{z.cupo}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
