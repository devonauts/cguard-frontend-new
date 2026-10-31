import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TimeOffRecord } from "@/lib/api/timeOffRequestService";
import { localeActual } from "@/lib/localeActual";
import {
  diasDelMes,
  diasDePermiso,
  mesSiguiente,
  type FilaDeCalendario,
  filasPorPersona,
  filasPorPuesto,
} from "./ausenciasCalendario";

/**
 * Ausencias y permisos · month calendar.
 *
 * One row per person (or per post), one column per day of the month. A day
 * painted solid is an approved leave; outlined is a pending request. By post,
 * the cell says how many people of that post are off that day. The grid
 * scrolls sideways inside its own box on a phone; the first column stays put.
 */
export default function AusenciasCalendario({
  records,
  month,
  onMonth,
  by,
  onPick,
  typeLabel,
}: {
  records: TimeOffRecord[];
  /** YYYY-MM */
  month: string;
  onMonth: (m: string) => void;
  by: "person" | "station";
  onPick: (r: TimeOffRecord) => void;
  typeLabel: (t: string | null | undefined) => string;
}) {
  const { t } = useTranslation();
  const days = useMemo(() => diasDelMes(month), [month]);
  const rows: FilaDeCalendario[] = useMemo(
    () => (by === "person" ? filasPorPersona(records, month) : filasPorPuesto(records, month)),
    [records, month, by],
  );
  const title = useMemo(() => {
    const [y, m] = month.split("-").map(Number);

    const s = new Date(y, m - 1, 1).toLocaleDateString(localeActual(), {
      month: "long",
      year: "numeric",
    });

    // Only the first letter: «noviembre de 2026» → «Noviembre de 2026».
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [month]);
  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const weekdayShort = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);

    return new Date(y, m - 1, d)
      .toLocaleDateString(localeActual(), { weekday: "narrow" })
      .toUpperCase();
  };

  const tone = (type: string | null | undefined) =>
    type === "vacation"
      ? "var(--info)"
      : type === "sick"
        ? "var(--bad)"
        : type === "training"
          ? "var(--ok)"
          : "var(--warn)";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          aria-label={t("ui.TimeOff.mesAnterior", "Mes anterior")}
          size="icon"
          variant="outline"
          onClick={() => onMonth(mesSiguiente(month, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="font-display text-base font-semibold">{title}</div>
        <Button
          aria-label={t("ui.TimeOff.mesSiguiente", "Mes siguiente")}
          size="icon"
          variant="outline"
          onClick={() => onMonth(mesSiguiente(month, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--ink-soft)" }}>
        {(["vacation", "personal", "sick", "training"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: tone(k) }} />
            {typeLabel(k)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ border: "2px dashed var(--ink-soft)" }}
          />
          {t("comun.pendiente", "Pendiente")}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm" style={{ color: "var(--ink-soft)" }}>
          {t("ui.TimeOff.nadieFueraEsteMes", "Nadie tiene ausencias este mes con estos filtros.")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--hairline)" }}>
          <table className="w-max min-w-full border-collapse text-xs" data-testid="ausencias-calendario">
            <thead>
              <tr>
                <th
                  className="sticky left-0 z-10 min-w-[9rem] max-w-[12rem] p-2 text-left font-medium"
                  style={{ background: "var(--glass-solid)" }}
                >
                  {by === "person" ? t("comun.vigilante", "Vigilante") : t("ui.TimeOff.puesto", "Puesto")}
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    className="w-7 min-w-[1.75rem] p-1 text-center font-normal tabular-nums"
                    style={{
                      color: d === todayYmd ? "var(--brand-text)" : "var(--ink-soft)",
                      fontWeight: d === todayYmd ? 700 : 400,
                    }}
                  >
                    <div>{weekdayShort(d)}</div>
                    <div>{Number(d.slice(8))}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                  <th
                    className="sticky left-0 z-10 max-w-[12rem] truncate p-2 text-left font-normal"
                    scope="row"
                    style={{ background: "var(--glass-solid)" }}
                    title={row.label}
                  >
                    {row.label}
                  </th>
                  {days.map((d) => {
                    const hits = row.byDay.get(d) || [];

                    if (!hits.length) return <td key={d} className="p-0.5" />;
                    if (by === "station") {
                      const names = hits.map((h) => h.guard?.fullName ?? h.guardName ?? "—").join(", ");

                      return (
                        <td key={d} className="p-0.5 text-center">
                          <button
                            className="h-6 w-6 rounded-sm text-[11px] font-semibold tabular-nums"
                            style={{ background: "var(--warn)", color: "var(--ink)" }}
                            title={`${d}: ${names}`}
                            type="button"
                            onClick={() => onPick(hits[0])}
                          >
                            {hits.length}
                          </button>
                        </td>
                      );
                    }
                    const r = hits[0];
                    const pending = r.status === "pending";

                    return (
                      <td key={d} className="p-0.5 text-center">
                        <button
                          aria-label={`${row.label} · ${d} · ${typeLabel(r.type)}`}
                          className="h-6 w-6 rounded-sm"
                          style={
                            pending
                              ? { border: `2px dashed ${tone(r.type)}`, background: "transparent" }
                              : { background: tone(r.type) }
                          }
                          title={`${typeLabel(r.type)} · ${r.startDate} → ${r.endDate ?? r.startDate}`}
                          type="button"
                          onClick={() => onPick(r)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export { diasDePermiso };
