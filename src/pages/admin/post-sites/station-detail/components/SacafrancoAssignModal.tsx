import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Shield, CheckCircle2, CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ApiService } from "@/services/api/apiService";
import { getTenantTimezone } from "@/utils/tenantLocation";
import { EmptyState, Modal } from "@/components/kit";
import SecuenciaPropiaSelect from "@/components/schedule/SecuenciaPropiaSelect";

/** Local (tenant-tz) YYYY-MM-DD for a shift start. */
function localDateKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: getTenantTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value || "";

  return `${g("year")}-${g("month")}-${g("day")}`;
}

import { localToday } from "@/lib/utils";
import { hoyEnLaEmpresa, sumaDias } from "@/lib/horaDeLaEmpresa";
import { todosLosVigilantes, turnosEntre } from "@/lib/listarCompleto";
const today = () => localToday();

/** The window the gap dates span (a day of margin each side, for overnight
 *  shifts), as ISO instants. No gaps → the next 30 days. */
function ventanaDeHuecos(gapDates: string[]): [string, string] {
  const dias = [...gapDates].sort();
  const desde = dias[0] || localToday();
  const hasta = dias[dias.length - 1] || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const ini = new Date(`${desde}T00:00:00`);
  const fin = new Date(`${hasta}T23:59:59`);

  ini.setDate(ini.getDate() - 1);
  fin.setDate(fin.getDate() + 1);

  return [ini.toISOString(), fin.toISOString()];
}

interface Candidate {
  id: string;
  name: string;
  busy: Set<string>;
  freeForGaps: number;
  busyOnGaps: number;
}

// Raw API rows read while ranking candidates.
interface AssignmentRow {
  positionId?: string | null;
  isRelief?: boolean;
  guardId?: string;
  guard?: { id?: string } | null;
}
interface GuardAutoRow {
  guardId?: string;
  id?: string;
  fullName?: string;
  label?: string;
  name?: string;
}
interface ShiftRow {
  guardId?: string;
  guard?: { id?: string } | null;
  startTime?: string;
}
interface PositionRow {
  id: string;
  type?: string;
  startTime?: string | null;
  endTime?: string | null;
}

/**
 * Assign a Sacafranco (relief) to cover the fijos' rest-day gaps. Shows each
 * candidate as a card with the next-14-day availability strip — the station's gap
 * days are highlighted, and days the guard already works (at any station) are marked
 * busy — so you pick someone free on the days you need.
 *
 * ── POR QUÉ ESTE DIÁLOGO NO REGISTRABA NINGÚN TURNO ─────────────────────────
 * Mandaba el alta sin patrón, y el backend trataba «sacafranco sin patrón» como
 * «mes en blanco»: se saltaba la generación a propósito (MANUAL SACAFRANCO,
 * 2026-07-18). El aviso decía «asignado» y el vigilante se quedaba con cero
 * turnos, sin ninguna pista de que faltaba un segundo paso en otra pantalla.
 *
 * Ahora un sacafranco sin patrón SÍ genera: va cada día al descanso que dejen
 * los fijos. Aquí quedan las otras dos piezas del mismo fallo:
 *   · la plaza se creaba siempre 07:00–19:00, aunque la estación trabajara
 *     07:00–23:00 en dos bloques;
 *   · nadie contaba los turnos creados, así que un día SIN huecos que tapar se
 *     veía exactamente igual que el fallo. Ahora se dice cuántos salieron.
 */
export default function SacafrancoAssignModal({
  open,
  onClose,
  stationId,
  tenantId,
  gapDates,
  onAssigned,
}: {
  open: boolean;
  onClose: () => void;
  stationId: string;
  tenantId: string;
  gapDates: string[]; // station rest-day gap dates (YYYY-MM-DD), next ~14 days
  onAssigned: () => void;
}) {
  const { t } = useTranslation();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  /** Ciclo propio del sacafranco. Vacío = tapa los huecos que haya, sin ciclo. */
  const [cicloPropio, setCicloPropio] = useState("");

  const days = (() => {
    // Ver la nota gemela en `StationRoster`: los días se cuentan desde hoy en la
    // empresa, no desde la medianoche del dispositivo pasada por UTC.
    const out: string[] = [];
    const hoy = hoyEnLaEmpresa();

    for (let i = 0; i < 14; i++) {
      out.push(sumaDias(hoy, i));
    }

    return out;
  })();
  const gapSet = new Set(gapDates);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [guardsRes, asgRes, shiftsRes] = await Promise.all([
        todosLosVigilantes(tenantId),
        ApiService.get(`/tenant/${tenantId}/guard-assignments?status=active`),
        turnosEntre(tenantId, ...ventanaDeHuecos(gapDates)),
      ]);
      const guards: GuardAutoRow[] = Array.isArray(guardsRes)
        ? guardsRes
        : guardsRes?.rows || [];
      const asg: AssignmentRow[] = Array.isArray(asgRes)
        ? asgRes
        : asgRes?.rows || [];
      const shifts: ShiftRow[] = Array.isArray(shiftsRes)
        ? shiftsRes
        : shiftsRes?.rows || [];

      // A guard with an active rotation (fijo or relief) can't take another.
      const occupied = new Set<string>(
        asg
          .filter((a: AssignmentRow) => a.positionId || a.isRelief)
          .map((a: AssignmentRow) => String(a.guardId || a.guard?.id || ""))
          .filter(Boolean),
      );
      // Busy dates per guard (works somewhere that day).
      const busyBy: Record<string, Set<string>> = {};

      for (const sh of shifts) {
        const gid = String(sh.guardId || sh.guard?.id || "");

        if (!gid || !sh.startTime) continue;
        (busyBy[gid] = busyBy[gid] || new Set()).add(
          localDateKey(sh.startTime),
        );
      }
      const cands: Candidate[] = guards
        .map((g: GuardAutoRow) => ({
          id: String(g.guardId || g.id || ""),
          name:
            g.fullName || g.label || g.name || t("guard.roleLabel", "Vigilante"),
        }))
        .filter((g) => g.id && !occupied.has(g.id))
        .map((g) => {
          const busy = busyBy[g.id] || new Set<string>();
          const busyOnGaps = gapDates.filter((d) => busy.has(d)).length;

          return {
            ...g,
            busy,
            busyOnGaps,
            freeForGaps: gapDates.length - busyOnGaps,
          };
        })
        .sort(
          (a: Candidate, b: Candidate) =>
            b.freeForGaps - a.freeForGaps || a.busy.size - b.busy.size,
        );

      setCandidates(cands);
    } catch {
      /* api client toasts */
    } finally {
      setLoading(false);
    }
  }, [tenantId, gapDates, t]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const assign = async (g: Candidate) => {
    setAssigning(g.id);
    try {
      // Ensure the station has a Sacafranco position to assign into.
      const posRes: any = await ApiService.get(
        `/tenant/${tenantId}/station/${stationId}/positions`,
      );
      const posList: PositionRow[] = Array.isArray(posRes)
        ? posRes
        : posRes?.rows || [];
      let sf = posList.find((p: PositionRow) => p.type === "sacafranco");

      if (!sf) {
        // La ventana de la plaza sale de la de los FIJOS de la estación, no de
        // un 07:00–19:00 escrito a mano: en una estación de 07:00 a 23:00 esa
        // plaza nacía con un horario que no existe en el puesto.
        const fijos = posList.filter(
          (p: PositionRow) => (p.type || "fijo") !== "sacafranco",
        );
        const primero = [...fijos].sort((a, b) =>
          String(a.startTime || "").localeCompare(String(b.startTime || "")),
        )[0];
        const created: any = await ApiService.post(
          `/tenant/${tenantId}/station/${stationId}/positions`,
          {
            data: {
              name: "Sacafranco",
              type: "sacafranco",
              startTime: String(primero?.startTime || "07:00").slice(0, 5),
              endTime: String(primero?.endTime || "19:00").slice(0, 5),
              sortOrder: 99,
              guardsNeeded: 1,
            },
          },
        );

        sf = created?.data || created;
      }
      await ApiService.post(`/tenant/${tenantId}/guard-assignment`, {
        data: {
          guardId: g.id,
          stationId,
          positionId: sf!.id,
          startDate: today(),
          isRelief: true,
          // Vacío ⇒ sin ciclo propio: va cada día al descanso que dejen los fijos.
          rotationStyleId: cicloPropio || null,
        },
      });

      /* ── ¿CUÁNTOS TURNOS LE SALIERON? ────────────────────────────────────
         La queja era literalmente «lo agregué y no registraba el turno». Un
         mensaje de éxito que no distingue entre «se generaron 12 turnos» y «no
         había ni un hueco que tapar» deja al operador exactamente igual de
         perdido que el fallo. Se cuentan y se dicen. */
      let turnos: number | null = null;

      try {
        const desde = today();
        const hasta = new Date(Date.now() + 30 * 86400000)
          .toISOString()
          .slice(0, 10);
        const res: any = await turnosEntre(
          tenantId,
          new Date(`${desde}T00:00:00`).toISOString(),
          new Date(`${hasta}T23:59:59`).toISOString(),
          { guardId: String(g.id) },
        );
        const filas: ShiftRow[] = Array.isArray(res) ? res : res?.rows || [];

        turnos = filas.filter((sh) => {
          if (!sh.startTime) return false;
          const gid = String(sh.guardId || sh.guard?.id || "");

          if (gid && gid !== String(g.id)) return false;
          const d = localDateKey(sh.startTime);

          return d >= desde && d <= hasta;
        }).length;
      } catch {
        /* el conteo es informativo */
      }

      if (turnos === null) {
        toast.success(
          t("ui.SacafrancoAssignModal.asignadoComoSacafranco", {
            defaultValue: "{{nombre}} quedó asignado como sacafranco.",
            nombre: g.name,
          }),
        );
      } else if (turnos > 0) {
        toast.success(
          t("ui.SacafrancoAssignModal.quedoConTurnos", {
            defaultValue:
              "{{nombre}} quedó como sacafranco — {{count}} turnos generados en los próximos 30 días.",
            nombre: g.name,
            count: turnos,
          }),
        );
      } else {
        toast.warning(
          t("ui.SacafrancoAssignModal.quedoSinTurnos", {
            defaultValue:
              "{{nombre}} quedó como sacafranco, pero no hay ningún descanso que tapar en los próximos 30 días, así que no se generó ningún turno. Revisa que los fijos de la estación tengan descansos en su ciclo, o dale un ciclo propio.",
            nombre: g.name,
          }),
          { duration: 9000 },
        );
      }
      onAssigned();
      onClose();
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t(
            "ui.SacafrancoAssignModal.noSePudoAsignarElSacafranco",
            "No se pudo asignar el sacafranco",
          ),
      );
    } finally {
      setAssigning(null);
    }
  };

  return (
    <Modal
      description={t("ui.SacafrancoAssignModal.cubreLosDiasDeDescanso")}
      icon={<Shield className="h-5 w-5" />}
      open={open}
      size="lg"
      title={t("ui.SacafrancoAssignModal.asignarSacafranco", "Asignar sacafranco")}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <div className="space-y-3">
        {/* Ciclo del sacafranco. El defecto —sin ciclo propio— es lo que la
            palabra significa: va donde los fijos libran. */}
        <div>
          <p className="cg-eyebrow mb-1.5">
            {t("ui.SacafrancoAssignModal.comoTrabaja", "Cómo trabaja")}
          </p>
          <SecuenciaPropiaSelect
            etiquetaPorDefecto={t(
              "ui.SacafrancoAssignModal.heredaElCicloDeLaEstacion",
              "Hereda el ciclo de la estación",
            )}
            tenantId={tenantId}
            value={cicloPropio}
            onChange={setCicloPropio}
          />
          {/* Esto prometía «cubre, día a día, el descanso que dejen los
              fijos», y el reparto automático se retiró: un sacafranco corre su
              ciclo en su puesto, igual que un fijo. Quien lo lea tiene que
              saber que colocarlo en otro puesto es un acto suyo. */}
          <p className="mt-1 text-[10px]" style={{ color: "var(--ink-soft)" }}>
            {t(
              "ui.SacafrancoAssignModal.correSuCiclo",
              "Corre su ciclo en este puesto, igual que un fijo. Sin ciclo propio hereda el de la estación. Para cubrir el descanso de un compañero, arrastra su día al puesto que quieras en el Programador.",
            )}
          </p>
        </div>

        {/* Legend */}
        <div
          className="flex flex-wrap items-center gap-4 text-[10px]"
          style={{ color: "var(--ink-soft)" }}
        >
          <span className="inline-flex items-center gap-1">
            <span
              className="h-3 w-3 rounded-sm"
              style={{
                background: "color-mix(in oklab, var(--bad) 45%, transparent)",
              }}
            />{" "}
            {t(
              "ui.SacafrancoAssignModal.diaACubrirDescansoDel",
              "Día a cubrir (descanso del fijo)",
            )}
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="h-3 w-3 rounded-sm"
              style={{
                background: "color-mix(in oklab, var(--warn) 55%, transparent)",
              }}
            />{" "}
            {t("ui.SacafrancoAssignModal.ocupadoEnOtroPuesto")}
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="h-3 w-3 rounded-sm"
              style={{
                background: "color-mix(in oklab, var(--ok) 45%, transparent)",
              }}
            />{" "}
            {t("ui.SacafrancoAssignModal.libre", "Libre")}
          </span>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div
              className="flex items-center justify-center py-12"
              style={{ color: "var(--ink-soft)" }}
            >
              <Loader2 className="animate-spin" />
            </div>
          ) : candidates.length === 0 ? (
            <EmptyState
              description={t(
                "ui.SacafrancoAssignModal.todosLosVigilantesTienenUna",
              )}
              icon={<Shield />}
              title={t("comun.sinVigilantesDisponibles")}
            />
          ) : (
            candidates.map((g) => (
              <div key={g.id} className="glass-flat p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
                      style={{
                        background:
                          "color-mix(in oklab, var(--ok) 16%, transparent)",
                        color: "var(--ok-text)",
                      }}
                    >
                      {g.name
                        .split(" ")
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{g.name}</p>
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        <CalendarDays className="inline mr-1" size={11} />
                        {t("ui.SacafrancoAssignModal.libreDiasACubrir", {
                          defaultValue: "Libre {{libres}}/{{total}} días a cubrir",
                          libres: g.freeForGaps,
                          total: gapDates.length,
                        })}
                        {g.busyOnGaps > 0
                          ? ` · ${t("ui.SacafrancoAssignModal.ocupadoN", {
                              defaultValue: "ocupado {{n}}",
                              n: g.busyOnGaps,
                            })}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    className="cg-focus flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    disabled={!!assigning}
                    style={{
                      background: "var(--ok)",
                      color: "var(--brand-ink)",
                    }}
                    onClick={() => assign(g)}
                  >
                    {assigning === g.id ? (
                      <Loader2 className="animate-spin" size={13} />
                    ) : (
                      <CheckCircle2 size={13} />
                    )}
                    {t("ui.SacafrancoAssignModal.asignar", "Asignar")}
                  </button>
                </div>
                {/* 14-day availability strip */}
                <div className="mt-2 flex gap-0.5">
                  {days.map((d) => {
                    const isGap = gapSet.has(d);
                    const isBusy = g.busy.has(d);
                    const fondo = isBusy
                      ? "color-mix(in oklab, var(--warn) 55%, transparent)"
                      : isGap
                        ? "color-mix(in oklab, var(--bad) 45%, transparent)"
                        : "color-mix(in oklab, var(--ok) 28%, transparent)";

                    return (
                      <div
                        key={d}
                        className="h-4 flex-1 rounded-sm"
                        style={{ background: fondo }}
                        title={`${d}${isGap ? ` · ${t("ui.SacafrancoAssignModal.descansoDelFijo", "descanso del fijo")}` : ""}${isBusy ? ` · ${t("ui.SacafrancoAssignModal.ocupado", "ocupado")}` : ""}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
