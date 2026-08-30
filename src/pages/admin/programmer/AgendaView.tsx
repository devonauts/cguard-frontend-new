import React, { useMemo } from 'react';
import { localeActual } from '@/lib/localeActual';
import { nombreDeVigilante } from '@/lib/guardName';
import { stationLabel } from '@/lib/stationName';
import type { ShiftRecord, Station } from '@/types';

/**
 * ────────────────────────────────────────────────────────────────────────────
 * AGENDA — la vista que sirve en un teléfono
 *
 * Las otras tres son rejillas: filas por puesto y columnas por día. En una
 * pantalla de 390 px una rejilla obliga a desplazarse en las DOS direcciones
 * para leer un dato, que es la manera más rápida de que nadie abra el horario
 * desde el móvil.
 *
 * La agenda es una lista: un día detrás de otro, y dentro de cada día sus
 * turnos ordenados por hora. Se lee con el pulgar y sin desplazamiento lateral.
 * Es también la vista que mejor responde a la pregunta que más se hace fuera de
 * la oficina — «¿quién entra hoy y a qué hora?».
 * ────────────────────────────────────────────────────────────────────────────
 */

export type AgendaViewProps = {
  days: Date[];
  shifts: ShiftRecord[];
  stationsById: Map<string, Station>;
  guardColorMap: Record<string, string>;
  todayStr: string;
  dateStrOf: (iso: string) => string;
  timeOf: (iso: string) => string;
  onPickShift: (s: ShiftRecord) => void;
};

function AgendaViewInner({
  days, shifts, stationsById, guardColorMap, todayStr, dateStrOf, timeOf, onPickShift,
}: AgendaViewProps) {
  const locale = localeActual();

  const porDia = useMemo(() => {
    const m = new Map<string, ShiftRecord[]>();
    for (const s of shifts) {
      if (!s.startTime) continue;
      const k = dateStrOf(s.startTime);
      const l = m.get(k);
      if (l) l.push(s); else m.set(k, [s]);
    }
    for (const l of m.values()) l.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    return m;
  }, [shifts, dateStrOf]);

  const fechas = useMemo(() => days.map((d) => {
    const y = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return { date: d, dateStr: `${y}-${mm}-${dd}` };
  }), [days]);

  const conTurnos = fechas.filter((f) => (porDia.get(f.dateStr) || []).length > 0);

  if (!conTurnos.length) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-2xl p-8 text-center"
        style={{ border: '1px solid var(--hairline)' }}>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          No hay turnos en este rango.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl" style={{ border: '1px solid var(--hairline)' }}>
      {conTurnos.map(({ date, dateStr }) => {
        const lista = porDia.get(dateStr) || [];
        const hoy = dateStr === todayStr;
        return (
          <div key={dateStr}>
            {/* Cabecera de día — pegajosa, para no perder de vista qué día se lee */}
            <div
              className="sticky top-0 z-10 flex items-baseline gap-2 px-4 py-2"
              style={{
                background: hoy ? 'color-mix(in oklab, var(--brand) 12%, var(--glass-solid))' : 'var(--glass-sunken)',
                borderBottom: '1px solid var(--hairline)',
              }}
            >
              <span className="text-sm font-semibold" style={{ color: hoy ? 'var(--brand-text)' : undefined }}>
                {date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
                  .replace(/^./, (c) => c.toUpperCase())}
              </span>
              <span className="text-[11px] tabular-nums" style={{ color: 'var(--ink-faint)' }}>
                {lista.length} turno{lista.length === 1 ? '' : 's'}
              </span>
            </div>

            {lista.map((s) => {
              const color = guardColorMap[s.guardId] || 'var(--ink-faint)';
              const est = stationsById.get(s.stationId);
              const aprendiz = (s as any).status === 'training';
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onPickShift(s)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--glass-sunken)]"
                  style={{ borderBottom: '1px solid var(--hairline)' }}
                >
                  {/* La hora primero: es lo que se busca al abrir esto */}
                  <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: 'var(--ink-soft)', minWidth: 82 }}>
                    {timeOf(s.startTime)}–{timeOf(s.endTime)}
                  </span>
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: color, opacity: aprendiz ? 0.5 : 1 }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {nombreDeVigilante(s.guard, 'Vigilante')}
                      {aprendiz && (
                        <span className="ml-1.5 text-[10px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
                          · aprendiz
                        </span>
                      )}
                    </span>
                    {est && (
                      <span className="block truncate text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                        {stationLabel(est)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default React.memo(AgendaViewInner);
