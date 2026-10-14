/**
 * Las piezas de interfaz de una sede-EVENTO, para que todas las pantallas lo
 * digan igual: la ficha, el armazón de la sede y los diálogos de asignación.
 * La aritmética vive en `lib/eventos` (sin React).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarClock } from "lucide-react";

import { InfoNote, StatusBadge } from "@/components/kit";
import { postSiteService } from "@/lib/api/postSiteService";
import { coverageService } from "@/lib/api/coverageService";
import {
  esEvento,
  eventoEnCurso,
  eventoTerminado,
  rangoDelEvento,
  type SedeConVigencia,
} from "@/lib/eventos";

/** La clave de la ficha de UNA sede en el caché compartido. Cuelga de
 *  `["stations", tenant, "business-info", …]` —la familia de `postSiteService.list`—
 *  para que cualquier escritura en `/business-info` o `/station` la invalide sola
 *  (`autoInvalidateForMutation`), sin llamadas sueltas por pantalla. */
export const claveDeLaSede = (postSiteId: string) =>
  [
    "stations",
    localStorage.getItem("tenantId") || "",
    "business-info",
    "detalle",
    String(postSiteId),
  ] as const;

/**
 * La sede de un puesto, leída aparte (los diálogos sólo conocen su id). Va por
 * el caché de react-query: la ficha del puesto y el diálogo de asignar la
 * comparten y ya no se pide una vez por cada estación que se abre.
 *
 * `conocida`: si quien llama ya tiene la sede con su `serviceType` (p. ej. venía
 * en el propio puesto), se usa esa y no se pide nada.
 */
export function useSede(
  postSiteId?: string | null,
  activo = true,
  conocida?: (SedeConVigencia & Record<string, any>) | null,
) {
  const yaLaTengo = !!conocida && conocida.serviceType !== undefined;
  const q = useQuery({
    queryKey: claveDeLaSede(String(postSiteId || "")),
    queryFn: () => postSiteService.get(String(postSiteId)),
    enabled: activo && !!postSiteId && !yaLaTengo,
    staleTime: 30_000,
    retry: false,
  });

  if (yaLaTengo) return conocida as any;

  return (q.data as any) ?? null;
}

/**
 * Píldora con las fechas del evento: «sáb 15 nov 14:00 → dom 16 nov 03:00».
 * Si ya pasó, «Evento pasado · historial»: un evento terminado (o movido al
 * pasado) sólo sirve de referencia —sin turnos ni nómina nuevos—, y así se
 * dice en la cabecera. No pinta nada si la sede no es un evento.
 */
export function FechasDelEvento({
  sede,
  className,
}: {
  sede?: SedeConVigencia | null;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!esEvento(sede)) return null;
  const rango = rangoDelEvento(sede?.vigenteDesde, sede?.vigenteHasta);
  const terminado = eventoTerminado(sede);
  const enCurso = eventoEnCurso(sede);

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1.5 ${className ?? ""}`}
    >
      {rango && (
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium tabular-nums"
          style={{ color: "var(--ink-soft)" }}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          {rango}
        </span>
      )}
      {terminado ? (
        <StatusBadge dot={false} tone="neutral">
          {t("eventos.pasadoHistorial", "Evento pasado · historial")}
        </StatusBadge>
      ) : enCurso ? (
        <StatusBadge tone="ok">{t("eventos.enCurso", "En curso")}</StatusBadge>
      ) : null}
    </span>
  );
}

/**
 * La línea de sólo lectura que sustituye a «fecha de inicio / fin / ciclo» al
 * asignar a alguien a un evento: las fechas las pone el evento.
 */
export function AvisoFechasDelEvento({
  sede,
  className,
}: {
  sede?: SedeConVigencia | null;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!esEvento(sede)) return null;
  const rango = rangoDelEvento(sede?.vigenteDesde, sede?.vigenteHasta);

  if (eventoTerminado(sede))
    return (
      <InfoNote
        className={className}
        icon={<CalendarClock />}
        title={t("eventos.yaTermino", "Este evento ya terminó")}
        tone="warn"
      >
        {t(
          "eventos.yaTerminoExplica",
          "Ya no se puede asignar a nadie. Si las fechas cambiaron, corrígelas en la sede.",
        )}
      </InfoNote>
    );

  return (
    <InfoNote
      className={className}
      icon={<CalendarClock />}
      title={
        rango
          ? t("eventos.fechasDelEvento", {
              defaultValue: "Fechas del evento: {{rango}}",
              rango,
            })
          : t("eventos.sinFechas", "Este evento no tiene fechas")
      }
      tone="brand"
    >
      {t(
        "eventos.fechasLasPoneElEvento",
        "El vigilante trabaja las horas de su plaza dentro de esas fechas. No hace falta elegir inicio, fin ni ciclo.",
      )}
    </InfoNote>
  );
}

export interface CandidatoLibre {
  guardId: string;
  reason?: string | null;
  warning?: string | null;
  orden: number;
}

/**
 * Quién está LIBRE en la ventana del evento (`GET /coverage/candidates`). El que
 * no sale en la lista tiene un turno que se cruza: se marca, no se esconde —
 * el servidor rechaza el choque real con un mensaje legible.
 */
export function useCandidatosLibres(
  stationId: string | null | undefined,
  ventana: { start: Date; end: Date } | null,
  activo: boolean,
) {
  const [libres, setLibres] = useState<Map<string, CandidatoLibre> | null>(
    null,
  );
  const [cargando, setCargando] = useState(false);
  const clave = ventana
    ? `${ventana.start.toISOString()}|${ventana.end.toISOString()}`
    : "";

  useEffect(() => {
    if (!activo || !stationId || !ventana) {
      setLibres(null);

      return;
    }
    let vivo = true;

    setCargando(true);
    coverageService
      .candidates({
        stationId,
        windowStart: ventana.start.toISOString(),
        windowEnd: ventana.end.toISOString(),
        limit: 500,
      })
      .then((rows) => {
        if (!vivo) return;
        const m = new Map<string, CandidatoLibre>();

        (Array.isArray(rows) ? rows : []).forEach((r: any, i: number) => {
          if (r?.guardId)
            m.set(String(r.guardId), {
              guardId: String(r.guardId),
              reason: r.reason ?? null,
              warning: r.warning ?? null,
              orden: i,
            });
        });
        setLibres(m);
      })
      // Sin la lista no se sabe quién está libre: se enseñan todos sin marcar.
      .catch(() => vivo && setLibres(null))
      .finally(() => vivo && setCargando(false));

    return () => {
      vivo = false;
    };
  }, [activo, stationId, clave]);

  return { libres, cargando };
}

/**
 * Ordena una lista de vigilantes con los LIBRES primero (en el orden que
 * sugiere el servidor) y marca a los ocupados.
 */
export function useVigilantesOrdenados<T extends { id: string }>(
  lista: T[],
  libres: Map<string, CandidatoLibre> | null,
): Array<T & { libre: boolean | null; motivo?: string | null }> {
  return useMemo(() => {
    if (!libres)
      return lista.map((g) => ({ ...g, libre: null as boolean | null }));
    const conMarca = lista.map((g) => {
      const c = libres.get(String(g.id));

      return {
        ...g,
        libre: !!c as boolean | null,
        motivo: c?.warning || c?.reason || null,
        _o: c ? c.orden : Number.MAX_SAFE_INTEGER,
      };
    });

    conMarca.sort((a, b) => a._o - b._o);

    return conMarca.map(({ _o, ...g }) => g as any);
  }, [lista, libres]);
}
