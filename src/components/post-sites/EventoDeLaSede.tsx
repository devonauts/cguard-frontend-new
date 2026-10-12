/**
 * Las piezas de interfaz de una sede-EVENTO, para que todas las pantallas lo
 * digan igual: la ficha, el armazón de la sede y los diálogos de asignación.
 * La aritmética vive en `lib/eventos` (sin React).
 */
import { useEffect, useMemo, useState } from "react";
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

/** La sede de un puesto, leída aparte (los diálogos sólo conocen su id). */
export function useSede(postSiteId?: string | null, activo = true) {
  const [sede, setSede] = useState<any | null>(null);

  useEffect(() => {
    if (!activo || !postSiteId) return;
    let viva = true;

    postSiteService
      .get(String(postSiteId))
      .then((d) => viva && setSede(d))
      .catch(() => viva && setSede(null));

    return () => {
      viva = false;
    };
  }, [postSiteId, activo]);

  return sede;
}

/**
 * Píldora con las fechas del evento: «sáb 15 nov 14:00 → dom 16 nov 03:00».
 * Si ya pasó, «Evento terminado». No pinta nada si la sede no es un evento.
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
          {t("eventos.terminado", "Evento terminado")}
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
