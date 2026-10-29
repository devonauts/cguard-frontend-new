import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";

import { Modal, SearchInput } from "@/components/kit";
import { stationLabel, type StationLike } from "@/lib/stationName";

/**
 * «ASIGNAR A UN PUESTO» from «Todo el personal».
 *
 * A guard with no assignment had one way into the Schedule: being dragged from
 * the side panel onto a seat, which the attendance sheet cannot offer. This
 * picks the seat (vacant ones first) and hands it to the EXISTING assign form,
 * the same one the drag opens — no second way of creating assignments.
 */

type Puesto = StationLike & { id: string };
type Plaza = {
  id: string;
  stationId: string;
  name?: string | null;
  type?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  guardsNeeded?: number | null;
};
type Asignacion = {
  positionId?: string | null;
  status?: string | null;
  isRelief?: boolean | null;
  role?: string | null;
};

export interface PlazaElegible {
  stationId: string;
  positionId: string;
  puesto: string;
  plaza: string;
  horas: string;
  libres: number;
}

/** Seats a guard can take, vacant first. Exported for tests. */
export function plazasElegibles(
  stations: Puesto[],
  positions: Plaza[],
  assignments: Asignacion[],
): PlazaElegible[] {
  const ocupadas = new Map<string, number>();

  for (const a of assignments) {
    if (!a.positionId || a.isRelief || a.role === "shadow") continue;
    if (a.status && a.status !== "active") continue;
    ocupadas.set(a.positionId, (ocupadas.get(a.positionId) || 0) + 1);
  }
  const porId = new Map(stations.map((s) => [s.id, s]));
  const hhmm = (x?: string | null) => (x ? String(x).slice(0, 5) : "");

  return positions
    .filter((p) => p.type !== "sacafranco" && porId.has(p.stationId))
    .map((p) => ({
      stationId: p.stationId,
      positionId: p.id,
      puesto: stationLabel(porId.get(p.stationId)),
      plaza: p.name || "",
      horas: [hhmm(p.startTime), hhmm(p.endTime)].filter(Boolean).join("–"),
      libres: Math.max(0, Math.max(1, Number(p.guardsNeeded) || 1) - (ocupadas.get(p.id) || 0)),
    }))
    .sort(
      (a, b) =>
        Number(b.libres > 0) - Number(a.libres > 0) ||
        a.puesto.localeCompare(b.puesto) ||
        a.plaza.localeCompare(b.plaza),
    );
}

export default function AsignarAPuestoModal({
  nombre,
  stations,
  positions,
  assignments,
  onPick,
  onClose,
}: {
  nombre: string;
  stations: Puesto[];
  positions: Plaza[];
  assignments: Asignacion[];
  onPick: (stationId: string, positionId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const todas = useMemo(
    () => plazasElegibles(stations, positions, assignments),
    [stations, positions, assignments],
  );
  const buscado = q.trim().toLowerCase();
  const lista = buscado
    ? todas.filter((p) => `${p.puesto} ${p.plaza}`.toLowerCase().includes(buscado))
    : todas;

  return (
    <Modal
      open
      description={nombre}
      icon={<MapPin size={16} />}
      size="md"
      title={t("ui.AllStaff.asignarAPuesto", "Asignar a un puesto")}
      onOpenChange={(o) => !o && onClose()}
    >
      <div className="space-y-3">
        <SearchInput
          placeholder={t("ui.AllStaff.buscarPuesto", "Buscar puesto…")}
          value={q}
          onChange={setQ}
        />
        {!lista.length ? (
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {t("ui.AllStaff.sinPlazas", "No hay plazas. Crea primero un puesto en la sede.")}
          </p>
        ) : (
          <div
            className="max-h-[50vh] divide-y overflow-y-auto rounded-xl border"
            style={{ borderColor: "var(--hairline)" }}
          >
            {lista.map((p) => (
              <button
                key={p.positionId}
                className="cg-focus flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--glass-sunken)]"
                style={{ borderColor: "var(--hairline)" }}
                type="button"
                onClick={() => onPick(p.stationId, p.positionId)}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{p.puesto}</div>
                  <div className="truncate text-[11px]" style={{ color: "var(--ink-soft)" }}>
                    {[p.plaza, p.horas].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span
                  className="shrink-0 text-[10px] font-semibold"
                  style={{ color: p.libres > 0 ? "var(--ok-text)" : "var(--ink-faint)" }}
                >
                  {p.libres > 0
                    ? t("ui.AllStaff.plazaVacante", "Vacante")
                    : t("ui.AllStaff.plazaOcupada", "Ocupada")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
