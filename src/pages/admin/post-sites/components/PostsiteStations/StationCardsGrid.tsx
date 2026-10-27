/**
 * Vista de tarjetas de estaciones (toggle Tarjetas ⇄ Lista en la subpágina de
 * Estaciones), al mismo estilo que Clientes/Vigilantes. Cada tarjeta: ícono de
 * cristal, nombre → detalle de la estación, horario, vigilantes requeridos y
 * geocerca. Menú Ver/Eliminar inyectado desde la página.
 */
import { type RelevoDeEvento, ventanaDeRelevos } from "@/lib/eventos";
import { useTranslation } from "react-i18next";
import {
  EllipsisVertical,
  Building2,
  Users,
  Clock,
  MapPin,
  Eye,
  Trash,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge, EmptyState, IconTile } from "@/components/kit";
import { etiquetaDeHorario, resumenDeHorario } from "@/lib/jornadasDePlazas";

/* Constante de MÓDULO: guarda la CLAVE con el español de respaldo; se traduce
   al pintar, dentro del componente (llamar a t() aquí congelaría el idioma). */
const SCHEDULE_LABEL: Record<string, { label: string; labelKey: string }> = {
  "24h": { label: "24 horas", labelKey: "stations.scheduleType.24h" },
  "12h-day": { label: "12h Día", labelKey: "stations.scheduleType.12hDay" },
  "12h-night": {
    label: "12h Noche",
    labelKey: "stations.scheduleType.12hNight",
  },
  custom: { label: "Personalizado", labelKey: "stations.scheduleType.custom" },
};

// The normalized station card shape produced by Stations.tsx.
export interface StationCard {
  id?: string;
  stationId?: string;
  name?: string;
  nickname?: string;
  numberOfGuardsInStation?: string | number | null;
  assignedGuards?: unknown[];
  scheduleType?: string | null;
  /** La ventana propia del puesto: de ella salen las horas y el rango del rótulo. */
  startingTimeInDay?: string | null;
  finishTimeInDay?: string | null;
  jornadas?: unknown[];
  hasPolygon?: boolean;
  geofenceRadius?: number | null;
  /** Sólo en un evento: sus relevos (en vez de «12h Día/Noche»). */
  relevos?: RelevoDeEvento[] | null;
}

export default function StationCardsGrid({
  stations,
  onOpen,
  onDelete,
}: {
  stations: StationCard[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();

  if (!stations.length) {
    return (
      <EmptyState
        description={t(
          "ui.StationCardsGrid.agregaLaPrimeraEstacion",
          "Agrega la primera estación con “Crear estación”.",
        )}
        icon={<Building2 />}
        title={t("stations.empty.title", "Sin estaciones")}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {stations.map((st, i) => {
        const id = st.id || st.stationId || "";
        const name = st.name || t("station.details.station", "Estación");
        const guards =
          st.numberOfGuardsInStation ??
          (Array.isArray(st.assignedGuards) ? st.assignedGuards.length : null);
        const schedEntry = st.scheduleType
          ? SCHEDULE_LABEL[st.scheduleType]
          : undefined;
        const sched = st.relevos
          ? st.relevos.length > 1
            ? t("ui.eventos.rotuloRelevos", {
                defaultValue: "{{ventana}} · {{count}} relevos",
                ventana: ventanaDeRelevos(st.relevos),
                count: st.relevos.length,
              })
            : t("ui.eventos.rotuloEvento", {
                defaultValue: "Evento · {{ventana}}",
                ventana: ventanaDeRelevos(st.relevos),
              })
          : st.scheduleType
            ? (() => {
                // «8h Diurno · 09:00–17:00»: horas y rango del propio puesto.
                const r = resumenDeHorario(st.scheduleType, st);
                const texto = r.clave
                  ? etiquetaDeHorario(t, r)
                  : schedEntry
                    ? t(schedEntry.labelKey, schedEntry.label)
                    : st.scheduleType;

                return r.ventana ? `${texto} · ${r.ventana}` : texto;
              })()
            : Array.isArray(st.jornadas) && st.jornadas.length
              ? t("ui.StationCardsGrid.nJornadas", {
                  defaultValue: "{{count}} jornadas",
                  count: st.jornadas.length,
                })
              : null;
        const geo = st.hasPolygon
          ? t("ui.StationCardsGrid.poligono", "Polígono")
          : st.geofenceRadius
            ? `${st.geofenceRadius} m`
            : null;

        return (
          <div
            key={id || i}
            className="glass-flat glass-hover cg-focus group flex cursor-pointer flex-col p-4 animate-in fade-in slide-in-from-bottom-2"
            role="button"
            style={{
              animationDelay: `${Math.min(i, 12) * 30}ms`,
              animationFillMode: "backwards",
            }}
            tabIndex={0}
            onClick={() => onOpen(id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpen(id);
            }}
          >
            <div className="flex items-start gap-3">
              <IconTile size="lg">
                <Building2 />
              </IconTile>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight">{name}</p>
                {st.nickname ? (
                  <p
                    className="truncate text-xs"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {st.nickname}
                  </p>
                ) : null}
                {sched && (
                  <div className="mt-1">
                    <StatusBadge
                      className="max-w-full whitespace-nowrap"
                      dot={false}
                      tone="info"
                    >
                      {sched}
                    </StatusBadge>
                  </div>
                )}
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="h-8 w-8 shrink-0"
                      size="icon"
                      variant="ghost"
                    >
                      <EllipsisVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => onOpen(id)}>
                      <Eye className="mr-2 h-4 w-4" />{" "}
                      {t("siteTour.actions.view", "Ver detalles")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(id)}
                    >
                      <Trash className="mr-2 h-4 w-4" />{" "}
                      {t("common.delete", "Eliminar")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div
              className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-sm"
              style={{
                borderColor: "var(--hairline)",
                color: "var(--ink-soft)",
              }}
            >
              <span className="flex items-center gap-1.5">
                <Users
                  className="h-4 w-4"
                  style={{ color: "var(--brand-text)" }}
                />
                <span className="font-semibold" style={{ color: "var(--ink)" }}>
                  {guards ?? "—"}
                </span>{" "}
                {t("ui.StationCardsGrid.vigilantesSufijo", {
                  defaultValue: "vigilantes",
                  count: Number(guards) || 0,
                })}
              </span>
              {sched && (
                <span className="flex items-center gap-1.5">
                  <Clock
                    className="h-4 w-4"
                    style={{ color: "var(--brand-text)" }}
                  />{" "}
                  {sched}
                </span>
              )}
              {geo && (
                <span className="flex items-center gap-1.5">
                  <MapPin
                    className="h-4 w-4"
                    style={{ color: "var(--brand-text)" }}
                  />{" "}
                  {geo}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
