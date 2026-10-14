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
import {
  eventoTerminado,
  relevosDeLaEstacion,
  tonoDeZonaPasada,
  ventanaDeRelevos,
  type SedeConVigencia,
  type ZonaDelHistorial,
} from "@/lib/eventos";
import { fechaYHora, soloHora } from "@/lib/horaDeLaEmpresa";
import { localeActual } from "@/lib/localeActual";

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
 *
 * EVENTO TERMINADO (el dueño, 2026-10-14: «debe salir un poco gris y mostrar
 * historial de lo que hubo para tener referencia»): sus asignaciones ya se
 * cerraron, así que contra el cupo todo salía «0 de N plazas cubiertas» en
 * rojo. Terminado, el mapa va apagado (`apagado` de `GoogleMapEmbed`) y cada
 * zona cuenta lo que HUBO —plazas, quién la cubrió, quién fichó y quién no,
 * horas, entrada y salida reales— desde `GET …/historial-del-evento`, que sale
 * de la misma nómina del evento (no se empareja nada dos veces).
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
  /** Sólo con el evento terminado: lo que hubo en la zona. */
  historial?: ZonaDelHistorial | null;
}

/** 24 h, como los relevos del evento («15:00–19:00»): «03:00 p. m.» al lado obliga a convertir. */
const H24: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
};

/** Cuántas personas del historial se nombran en el globo antes de «y N más». */
const EN_EL_GLOBO = 12;

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
  sede,
  height = "520px",
}: {
  tenantId: string;
  postSiteId: string;
  /** La sede-evento (fechas): si ya terminó, el mapa enseña su historial. */
  sede?: SedeConVigencia | null;
  height?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [zonas, setZonas] = useState<Zona[] | null>(null);
  const terminado = eventoTerminado(sede);
  /** Sin permiso para ver fichajes el historial no llega: el mapa sale gris igual. */
  const [conHistorial, setConHistorial] = useState(false);

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
      /* Terminado: las asignaciones activas ya no dicen nada (se cerraron);
         lo que vale es el historial por zona. */
      const historial: Map<string, ZonaDelHistorial> | null = terminado
        ? await ApiService.get(
            `/tenant/${tenantId}/post-site/${encodeURIComponent(postSiteId)}/historial-del-evento`,
          )
            .then((r: any) => {
              const zs: ZonaDelHistorial[] = (r?.data ?? r)?.zonas || [];

              return new Map(zs.map((z) => [String(z.estacionId), z]));
            })
            .catch(() => null)
        : null;
      const asignaciones = terminado
        ? conPunto.map(() => [] as any[])
        : await Promise.all(
            conPunto.map(({ s }) =>
              ApiService.get(
                `/tenant/${tenantId}/guard-assignments?stationId=${encodeURIComponent(s.id)}&status=active`,
              )
                .then(filas)
                .catch(() => []),
            ),
          );

      if (!vivo) return;
      setConHistorial(!!historial);
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
          historial: historial ? historial.get(String(s.id)) || null : null,
        })),
      );
    })();

    return () => {
      vivo = false;
    };
  }, [tenantId, postSiteId, terminado]);

  const tono = (z: Zona): MapPopupTone =>
    terminado
      ? tonoDeZonaPasada(z.historial)
      : z.vigilantes.length >= z.cupo && z.cupo > 0
        ? "ok"
        : z.vigilantes.length > 0
          ? "warn"
          : "bad";

  const horas = (h: number) =>
    new Intl.NumberFormat(localeActual(), { maximumFractionDigits: 2 }).format(
      h,
    );
  /** «Ana — 19:55 → 00:02 · 4 h», «Beto — no fichó», «Eva — sin turno». */
  const lineaDePersona = (p: ZonaDelHistorial["personas"][number]) => {
    if (!p.turnos.length)
      return t("ui.ZonasDelEventoMap.h.sinTurno", "sin turno ni fichaje");

    return p.turnos
      .map((x) =>
        x.estado === "noFicho" || !x.entrada
          ? t("ui.ZonasDelEventoMap.h.noFicho", {
              defaultValue: "no fichó (turno {{inicio}}–{{fin}})",
              inicio: soloHora(x.programadoInicio, H24),
              fin: soloHora(x.programadoFin, H24),
            })
          : x.salida
            ? t("ui.ZonasDelEventoMap.h.fichado", {
                defaultValue: "{{entrada}} → {{salida}} · {{horas}} h",
                entrada: soloHora(x.entrada, H24),
                salida: soloHora(x.salida, H24),
                horas: horas(x.horas),
              })
            : t("ui.ZonasDelEventoMap.h.sinSalida", {
                defaultValue: "entró {{entrada}} · sin salida",
                entrada: soloHora(x.entrada, H24),
              }),
      )
      .join(" · ");
  };

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
          // Terminado: todas apagadas; el gris del mapa ya dice «esto pasó».
          role: terminado ? "muted" : z.vigilantes.length ? undefined : "muted",
          status: terminado
            ? {
                label: t("ui.ZonasDelEventoMap.h.historial", "Historial"),
                tone: tono(z),
              }
            : {
                label: `${z.vigilantes.length}/${z.cupo}`,
                tone: tono(z),
              },
        })),
    [zonas, terminado],
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
  /* Lo que hubo en el evento entero (sólo terminado). Las personas se cuentan
     una vez aunque cubrieran dos zonas. */
  const hubo = (() => {
    const gente = new Set<string>();
    let fichados = 0;
    let noFicho = 0;
    let sinSalida = 0;
    let h = 0;
    let turnos = 0;

    for (const z of zonas) {
      if (!z.historial) continue;
      turnos += z.historial.turnos;
      z.historial.personas.forEach((p) => gente.add(p.userId));
      fichados += z.historial.cumplidos + z.historial.sinSalida;
      noFicho += z.historial.noFicho;
      sinSalida += z.historial.sinSalida;
      h += z.historial.horas;
    }

    return { gente: gente.size, turnos, fichados, noFicho, sinSalida, horas: h };
  })();
  const finDelEvento = terminado
    ? fechaYHora(sede?.vigenteHasta, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).replace(/,/g, "")
    : "";

  /** El globo de una zona de un evento terminado: lo que hubo. */
  const globoPasado = (z: Zona) => {
    const h = z.historial;
    const personas = h?.personas || [];

    return {
      fields: [
        ...personas.slice(0, EN_EL_GLOBO).map((p) => ({
          label: p.archivado
            ? t("ui.ZonasDelEventoMap.h.archivado", {
                defaultValue: "{{nombre}} (archivado)",
                nombre: p.nombre,
              })
            : p.nombre,
          value: lineaDePersona(p),
          wide: true,
          tone:
            p.turnos.some((x) => x.estado === "noFicho" || !x.salida) &&
            p.turnos.length
              ? ("warn" as const)
              : undefined,
        })),
        ...(personas.length > EN_EL_GLOBO
          ? [
              {
                label: "",
                value: t("ui.ZonasDelEventoMap.h.yMas", {
                  defaultValue: "y {{count}} más",
                  count: personas.length - EN_EL_GLOBO,
                }),
                wide: true,
              },
            ]
          : []),
      ],
      metrics: [
        {
          label: t("ui.ZonasDelEventoMap.h.plazas", "Plazas"),
          value: z.cupo,
        },
        {
          label: t("ui.ZonasDelEventoMap.h.fichados", "Fichados"),
          value: h ? h.cumplidos + h.sinSalida : "—",
        },
        {
          label: t("ui.ZonasDelEventoMap.h.sinFichar", "Sin fichar"),
          value: h ? h.noFicho : "—",
          tone: h?.noFicho ? ("warn" as const) : undefined,
        },
        {
          label: t("ui.ZonasDelEventoMap.h.horas", "Horas"),
          value: h ? horas(h.horas) : "—",
        },
      ],
      note: !h
        ? t(
            "ui.ZonasDelEventoMap.h.sinPermiso",
            "Para ver quién fichó en esta zona hace falta el permiso de ver asistencia.",
          )
        : !personas.length
          ? t(
              "ui.ZonasDelEventoMap.h.nadie",
              "Nadie cubrió esta zona: no hay turnos ni fichajes registrados.",
            )
          : h.sinSalida
            ? t("ui.ZonasDelEventoMap.h.notaSinSalida", {
                defaultValue:
                  "{{count}} turnos sin salida: no se pagan hasta cerrarlos en Registros de asistencia.",
                count: h.sinSalida,
              })
            : !h.turnos
              ? t(
                  "ui.ZonasDelEventoMap.h.sinHoras",
                  "Estuvieron asignados, pero no hay horas registradas: el evento no llegó a tener turnos.",
                )
              : undefined,
      actions: mapPopupItems(
        mapPopupActions.detail(
          () => irAZona(z.id),
          t("ui.ZonasDelEventoMap.verVigilantes", "Ver vigilantes"),
        ),
      ),
    };
  };

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
                apagado={terminado}
                draggable={false}
                mapType="satellite"
                markerPopup={(m) => {
                  const z = porId.get(m.id);

                  if (!z) return null;
                  if (terminado) return globoPasado(z);

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
        {terminado ? (
          <span className="basis-full" style={{ color: "var(--ink-soft)" }}>
            <span className="font-semibold" style={{ color: "var(--ink)" }}>
              {t("ui.ZonasDelEventoMap.h.rotulo", {
                defaultValue: "Evento terminado el {{fecha}} · historial",
                fecha: finDelEvento,
              })}
            </span>
            {" · "}
            {[
              t("ui.eventos.nPlazas", { defaultValue: "{{count}} plazas", count: cupo }),
              ...(conHistorial && !hubo.turnos
                ? [
                    t("ui.eventos.nVigilantes", {
                      defaultValue: "{{count}} vigilantes",
                      count: hubo.gente,
                    }),
                    // Movido al pasado: nunca tuvo turnos. «0 fichados · 0 h» se
                    // leía como un fallo; se dice lo que es.
                    t(
                      "ui.ZonasDelEventoMap.h.sinHorasCorto",
                      "sin horas registradas",
                    ),
                  ]
                : []),
              ...(conHistorial && hubo.turnos
                ? [
                    t("ui.eventos.nVigilantes", {
                      defaultValue: "{{count}} vigilantes",
                      count: hubo.gente,
                    }),
                    t("ui.ZonasDelEventoMap.h.nFichados", {
                      defaultValue: "{{count}} turnos fichados",
                      count: hubo.fichados,
                    }),
                    ...(hubo.noFicho
                      ? [
                          t("ui.ZonasDelEventoMap.h.nSinFichar", {
                            defaultValue: "{{count}} sin fichar",
                            count: hubo.noFicho,
                          }),
                        ]
                      : []),
                    ...(hubo.sinSalida
                      ? [
                          t("ui.ZonasDelEventoMap.h.nSinSalida", {
                            defaultValue: "{{count}} sin salida",
                            count: hubo.sinSalida,
                          }),
                        ]
                      : []),
                    t("ui.ZonasDelEventoMap.h.totalHoras", {
                      defaultValue: "{{horas}} h trabajadas",
                      horas: horas(hubo.horas),
                    }),
                  ]
                : []),
            ].join(" · ")}
          </span>
        ) : (
          <span style={{ color: "var(--ink-soft)" }}>
            {t("ui.ZonasDelEventoMap.resumen", {
              defaultValue: "{{cubiertas}} de {{cupo}} plazas cubiertas",
              cubiertas,
              cupo,
            })}
          </span>
        )}
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
              style={{
                // «neutral» no es un color de estado: la tinta tenue.
                background:
                  tono(z) === "neutral"
                    ? "var(--ink-faint)"
                    : `var(--${tono(z)})`,
              }}
            />
            {z.nombre}
            <span className="tabular-nums" style={{ color: "var(--ink-soft)" }}>
              {terminado
                ? z.historial
                  ? t("ui.ZonasDelEventoMap.h.chip", {
                      defaultValue: "{{personas}} · {{horas}} h",
                      personas: z.historial.personas.length,
                      horas: horas(z.historial.horas),
                    })
                  : z.cupo
                : `${z.vigilantes.length}/${z.cupo}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
