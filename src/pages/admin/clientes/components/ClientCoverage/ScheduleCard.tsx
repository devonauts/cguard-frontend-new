import type React from "react";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  UserPlus,
  UserMinus,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { FIELD_CLS } from "../_shared/tab-kit";

import { clientService } from "@/lib/api/clientService";
import { usePermissions } from "@/hooks/usePermissions";
import { Section, EmptyState, Modal, SkeletonBlock } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { localeActual } from "@/lib/localeActual";

/** Tinte de celda desde los tokens: el día usa el informativo, la noche el
 *  acento configurable, el hueco el semántico de peligro. Ningún color a mano. */
const tint = (token: string, pct = 16): React.CSSProperties => ({
  background: `color-mix(in oklab, var(--${token}) ${pct}%, transparent)`,
  color: `var(--${token}-text)`,
});

/* Constante de MÓDULO: guarda la CLAVE junto al español de respaldo. Nunca se
   llama a t() aquí —congelaría el idioma de arranque—: se traduce al pintar.
   La letra de la celda también es una etiqueta (D/N/L), así que lleva clave. */
const CELL: Record<
  string,
  {
    label: string;
    labelKey: string;
    style: React.CSSProperties;
    title: string;
    titleKey: string;
    legend: string;
    legendKey: string;
  }
> = {
  day: {
    label: "D",
    labelKey: "clients.coverage.cell.day.letter",
    style: tint("info"),
    title: "Turno de día",
    titleKey: "clients.coverage.cell.day.title",
    legend: "Día",
    legendKey: "clients.coverage.cell.day.legend",
  },
  night: {
    label: "N",
    labelKey: "clients.coverage.cell.night.letter",
    style: { background: "var(--brand-wash)", color: "var(--brand-text)" },
    title: "Turno de noche",
    titleKey: "clients.coverage.cell.night.title",
    legend: "Noche",
    legendKey: "clients.coverage.cell.night.legend",
  },
  rest: {
    label: "L",
    labelKey: "clients.coverage.cell.rest.letter",
    style: { background: "var(--glass-sunken)", color: "var(--ink-soft)" },
    title: "Libre",
    titleKey: "clients.coverage.cell.rest.title",
    legend: "Libre",
    legendKey: "clients.coverage.cell.rest.legend",
  },
  // The rotation expected a work day but no turno was generated — a real hole in
  // the schedule, not a rest day. Painting it as 'L' hid missing coverage.
  gap: {
    label: "!",
    labelKey: "clients.coverage.cell.gap.letter",
    style: tint("bad"),
    title: "Sin turno generado (hueco de cobertura)",
    titleKey: "clients.coverage.cell.gap.title",
    legend: "Sin turno generado",
    legendKey: "clients.coverage.cell.gap.legend",
  },
  none: {
    label: "·",
    labelKey: "clients.coverage.cell.none.letter",
    style: { color: "var(--ink-faint)" },
    title: "Sin rotación configurada",
    titleKey: "clients.coverage.cell.none.title",
    legend: "Sin rotación",
    legendKey: "clients.coverage.cell.none.legend",
  },
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ── Shape of GET /client-account/:id/schedule (clientAccountSchedule.ts) ──
type CellStatus = "day" | "night" | "rest" | "gap" | "none";
interface ScheduleDay {
  date: string;
  dow: string;
  day: number;
  isToday: boolean;
  weekend: boolean;
}
interface ScheduleCell {
  date: string;
  status: CellStatus;
  hours: string | null; // real turno window, e.g. "07:00 - 19:00"
  guardName: string | null; // who actually covers that day
  covering: boolean; // true when it isn't the row's titular vigilante
}
interface ScheduleRow {
  stationId: string;
  stationName: string;
  positionId: string;
  positionName: string;
  positionType: string;
  window: string | null;
  assignmentId: string | null;
  guardId: string | null;
  guardName: string | null;
  rotationStyleName: string | null;
  cells: ScheduleCell[];
}
interface ScheduleData {
  sedes: Array<{ id: string; name: string }>;
  selectedSedeId: string | null;
  startDate: string;
  endDate: string;
  days: ScheduleDay[];
  stations: Array<{
    id: string;
    name: string;
    scheduleType: string | null;
    rotationStyleName: string | null;
  }>;
  rows: ScheduleRow[];
  updatedAt: string;
}

export default function ScheduleCard({
  clientId,
  sedeId,
}: {
  clientId: string;
  sedeId: string;
}) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("stationEdit");
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState<string | undefined>(undefined);
  const [guardOptions, setGuardOptions] = useState<
    Array<{ id: string; label: string }>
  >([]);

  const [editRow, setEditRow] = useState<ScheduleRow | null>(null);
  const [pickGuard, setPickGuard] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async (quiet = false) => {
    if (!sedeId) {
      setLoading(false);

      return;
    }
    if (!quiet) setLoading(true);
    try {
      const d = await clientService.getClientSchedule(clientId, {
        postSiteId: sedeId,
        startDate: start,
      });

      setData(d);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [clientId, sedeId, start]);
  useEffect(() => {
    clientService
      .guardAutocomplete("", 300)
      .then(setGuardOptions)
      .catch(() => setGuardOptions([]));
  }, [clientId]);

  const days: ScheduleDay[] = data?.days || [];
  const rows: ScheduleRow[] = data?.rows || [];

  // Group rows by station for a station label spanning its positions.
  const grouped = useMemo(() => {
    const out: Array<{ stationName: string; rows: ScheduleRow[] }> = [];

    for (const r of rows) {
      const last = out[out.length - 1];

      if (last && last.stationName === r.stationName) last.rows.push(r);
      else out.push({ stationName: r.stationName, rows: [r] });
    }

    return out;
  }, [rows]);

  const shiftWindow = (deltaDays: number) => {
    const cur = data?.startDate
      ? new Date(`${data.startDate}T00:00:00`)
      : new Date();

    cur.setDate(cur.getDate() + deltaDays);
    setStart(ymd(cur));
  };

  const openEdit = (row: ScheduleRow) => {
    if (!canEdit) return;
    setEditRow(row);
    setPickGuard(row.guardId || "");
  };
  const saveGuard = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      if (pickGuard) {
        // Create the NEW assignment first (the unique slot index is keyed on
        // guardId, so it can coexist with the old one), THEN remove the old. A
        // failed create never leaves the position unassigned / nukes old shifts.
        await clientService.assignGuardToPosition({
          guardId: pickGuard,
          stationId: editRow.stationId,
          positionId: editRow.positionId,
          isRelief: editRow.positionType === "sacafranco",
        });
        if (editRow.assignmentId) {
          try {
            await clientService.removeGuardAssignment(editRow.assignmentId);
          } catch {
            /* old row lingers harmlessly; refetch reflects truth */
          }
        }
        toast.success(
          editRow.positionType === "sacafranco"
            ? "Sacafranco asignado (los turnos se colocan según los huecos de la operación)"
            : "Vigilante asignado",
        );
      } else if (editRow.assignmentId) {
        await clientService.removeGuardAssignment(editRow.assignmentId);
        toast.success("Asignación removida");
      }
      setEditRow(null);
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          t(
            "clients.coverage.assignUpdateError",
            "No se pudo actualizar la asignación",
          ),
      );
    } finally {
      setSaving(false);
      await load(true);
    }
  };
  const removeGuard = async () => {
    if (!editRow?.assignmentId) {
      setEditRow(null);

      return;
    }
    setSaving(true);
    try {
      await clientService.removeGuardAssignment(editRow.assignmentId);
      toast.success("Asignación removida");
      setEditRow(null);
      await load(true);
    } catch {
      toast.error(
        t("clients.coverage.assignRemoveError", "No se pudo remover"),
      );
    } finally {
      setSaving(false);
    }
  };

  const rangeLabel =
    data?.startDate && data?.endDate
      ? `${new Date(`${data.startDate}T00:00:00`).toLocaleDateString(localeActual(), { day: "2-digit", month: "short" })} – ${new Date(`${data.endDate}T00:00:00`).toLocaleDateString(localeActual(), { day: "2-digit", month: "short" })}`
      : "";

  return (
    <Section
      action={
        <div className="flex items-center gap-1.5">
          <span
            className="hidden text-xs sm:inline"
            style={{ color: "var(--ink-soft)" }}
          >
            {rangeLabel}
          </span>
          <Button
            className="h-7 w-7"
            size="icon"
            title="Quincena anterior"
            variant="outline"
            onClick={() => shiftWindow(-14)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            className="h-7 px-2 text-xs"
            size="sm"
            variant="outline"
            onClick={() => setStart(undefined)}
          >
            Hoy
          </Button>
          <Button
            className="h-7 w-7"
            size="icon"
            title="Quincena siguiente"
            variant="outline"
            onClick={() => shiftWindow(14)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            className="h-7 w-7"
            size="icon"
            title="Actualizar"
            variant="outline"
            onClick={() => load()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      }
      icon={<CalendarDays />}
      title="Horarios"
    >
      {loading && !data ? (
        <div className="space-y-2 py-2">
          <SkeletonBlock className="h-6" />
          <SkeletonBlock className="h-6" />
          <SkeletonBlock className="h-6" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          description="Esta sede no tiene puestos con rotación configurada. Configúralos en el Programador."
          icon={<CalendarDays />}
          title={t("ui.ScheduleCard.sinHorario", "Sin horario")}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th
                    className="cg-eyebrow sticky left-0 z-10 min-w-[200px] border-b px-2 py-2 text-left"
                    style={{
                      borderColor: "var(--hairline)",
                      background: "var(--glass-solid)",
                    }}
                  >
                    Puesto · Posición · Vigilante
                  </th>
                  {days.map((d) => (
                    <th
                      key={d.date}
                      className="border-b px-1 py-1 text-center text-[11px] font-semibold"
                      style={{
                        borderColor: "var(--hairline)",
                        color: d.isToday
                          ? "var(--brand-text)"
                          : d.weekend
                            ? "var(--ink-faint)"
                            : "var(--ink-soft)",
                      }}
                    >
                      <div>{d.dow}</div>
                      <div
                        className={`tabular-nums ${d.isToday ? "font-bold" : ""}`}
                      >
                        {d.day}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map((g) =>
                  g.rows.map((r, ri) => (
                    <tr key={r.positionId}>
                      <td
                        className="sticky left-0 z-10 min-w-[200px] border-b px-2 py-1.5"
                        style={{
                          borderColor: "var(--hairline)",
                          background: "var(--glass-solid)",
                        }}
                      >
                        {ri === 0 && (
                          <div className="text-xs font-semibold text-foreground">
                            {g.stationName}
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span
                              className="text-xs"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              {r.positionName}
                              {r.positionType === "sacafranco" ? " · SF" : ""}
                            </span>
                            {canEdit ? (
                              <button
                                className="cg-focus block truncate rounded-md text-left text-sm font-medium hover:underline"
                                title="Cambiar vigilante"
                                onClick={() => openEdit(r)}
                              >
                                {r.guardName || (
                                  <span style={{ color: "var(--warn-text)" }}>
                                    {t("comun.sinAsignar", "Sin asignar")}
                                  </span>
                                )}
                              </button>
                            ) : (
                              <div className="truncate text-sm font-medium">
                                {r.guardName || (
                                  <span style={{ color: "var(--warn-text)" }}>
                                    {t("comun.sinAsignar", "Sin asignar")}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {canEdit && (
                            <button
                              className="cg-focus shrink-0 rounded-md p-1 transition-opacity hover:opacity-70"
                              style={{ color: "var(--ink-faint)" }}
                              title="Cambiar vigilante"
                              onClick={() => openEdit(r)}
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      {r.cells.map((c) => {
                        const m = CELL[c.status] || CELL.none;
                        // Tooltip carries the real turno data so the compact grid
                        // stays readable while still answering "¿qué turno es?".
                        const tip = [
                          t(m.titleKey, m.title),
                          c.hours,
                          c.covering && c.guardName
                            ? t(
                                "clients.coverage.cell.coveredBy",
                                "Cubre: {{name}}",
                                { name: c.guardName },
                              )
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ");

                        return (
                          <td
                            key={c.date}
                            className="border-b p-0.5 text-center"
                            style={{ borderColor: "var(--hairline)" }}
                          >
                            <span
                              className="relative grid h-7 w-full min-w-[26px] place-items-center rounded text-[11px] font-bold"
                              style={m.style}
                              title={tip}
                            >
                              {t(m.labelKey, m.label)}
                              {/* El punto marca que ese día lo cubre otro vigilante (sacafranco) */}
                              {c.covering && (
                                <span
                                  className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full"
                                  style={{ background: "var(--warn)" }}
                                />
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <div
            className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
            style={{ color: "var(--ink-soft)" }}
          >
            {(["day", "night", "rest", "gap"] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span
                  className="grid h-4 w-4 place-items-center rounded text-[10px] font-bold"
                  style={CELL[k].style}
                >
                  {t(CELL[k].labelKey, CELL[k].label)}
                </span>
                {t(CELL[k].legendKey, CELL[k].legend)}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--warn)" }}
              />{" "}
              Cubre otro vigilante
            </span>
            {canEdit && (
              <span className="ml-auto">
                {t(
                  "ui.ScheduleCard.tocaUnVigilanteParaCambiarlo",
                  "Toca un vigilante para cambiarlo.",
                )}
              </span>
            )}
          </div>
        </>
      )}

      {/* Change-guard modal */}
      <Modal
        footer={
          <>
            <Button
              disabled={saving}
              variant="outline"
              onClick={() => setEditRow(null)}
            >
              Cancelar
            </Button>
            {editRow?.assignmentId && (
              <Button
                disabled={saving}
                style={{ color: "var(--bad-text)" }}
                variant="outline"
                onClick={removeGuard}
              >
                <UserMinus className="mr-1.5 h-4 w-4" /> Quitar
              </Button>
            )}
            <Button
              disabled={saving || pickGuard === (editRow?.guardId || "")}
              onClick={saveGuard}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Guardando…
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </>
        }
        icon={<UserPlus className="h-5 w-5" />}
        open={!!editRow}
        size="sm"
        title="Cambiar vigilante"
        onOpenChange={(o) => {
          if (!o && !saving) setEditRow(null);
        }}
      >
        {editRow && (
          <div className="space-y-3">
            <div
              className="glass-sunken px-3 py-2 text-sm"
              style={{ color: "var(--ink-soft)" }}
            >
              <span>
                {editRow.stationName} · {editRow.positionName}
              </span>
              {editRow.rotationStyleName && (
                <span> · {editRow.rotationStyleName}</span>
              )}
            </div>
            <div>
              <label className="cg-eyebrow mb-1 block">Vigilante</label>
              <select
                className={FIELD_CLS}
                value={pickGuard}
                onChange={(e) => setPickGuard(e.target.value)}
              >
                <option value="">— Sin asignar —</option>
                {guardOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
              El vigilante seguirá la rotación del puesto. Cambiar reemplaza la
              asignación actual del puesto.
            </p>
          </div>
        )}
      </Modal>
    </Section>
  );
}
