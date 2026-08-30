import React, { useMemo } from 'react';
import { localeActual } from '@/lib/localeActual';
import { nombreDeVigilante } from '@/lib/guardName';
import { stationShort } from '@/lib/stationName';
import type { ShiftRecord, Station } from '@/types';

/**
 * ────────────────────────────────────────────────────────────────────────────
 * EL MES COMO CALENDARIO — la cuarta vista
 *
 * «Mes» en este producto es una hoja de cálculo de 365 columnas: la herramienta
 * operativa, y no se toca. Pero cuando alguien dice «quiero verlo como un
 * calendario» está pidiendo ESTO: seis filas de siete días, el mes de un
 * vistazo, cada turno una fichita dentro de su día.
 *
 * Son 42 celdas, no 20.000: aquí no hay nada que virtualizar. Lo único que sí
 * hay que acotar es cuántas fichas se pintan por día — un tenant con 30 puestos
 * mete 60 turnos en un martes, y sesenta fichitas en una celda no se leen ni se
 * pintan gratis. Se enseñan las primeras y el resto se cuenta («+N más»).
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Cuántas fichas caben en un día antes de resumir. */
const MAX_CHIPS = 4;

export type MonthCalendarProps = {
  /** Primer día del mes que se muestra. */
  monthAnchor: Date;
  shifts: ShiftRecord[];
  stationsById: Map<string, Station>;
  guardColorMap: Record<string, string>;
  /** `YYYY-MM-DD` de hoy en la zona del tenant. */
  todayStr: string;
  /** Fecha de calendario (en zona del tenant) de un instante. */
  dateStrOf: (iso: string) => string;
  /** HH:mm (en zona del tenant) de un instante. */
  timeOf: (iso: string) => string;
  onPickDay: (dateStr: string) => void;
  onPickShift: (shift: ShiftRecord) => void;
};

function MonthCalendarInner({
  monthAnchor, shifts, stationsById, guardColorMap, todayStr,
  dateStrOf, timeOf, onPickDay, onPickShift,
}: MonthCalendarProps) {
  const locale = localeActual();

  /** Las 6×7 celdas: lunes primero, con la cola del mes anterior y del siguiente. */
  const celdas = useMemo(() => {
    const primero = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
    const desplaz = (primero.getDay() + 6) % 7; // lunes = 0
    const inicio = new Date(primero);
    inicio.setDate(inicio.getDate() - desplaz);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(inicio);
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return {
        date: d,
        dateStr: `${y}-${m}-${dd}`,
        delMes: d.getMonth() === monthAnchor.getMonth(),
        domingo: d.getDay() === 0,
      };
    });
  }, [monthAnchor]);

  /** `YYYY-MM-DD` → turnos de ese día, ordenados por hora de entrada. */
  const porDia = useMemo(() => {
    const m = new Map<string, ShiftRecord[]>();
    for (const s of shifts) {
      if (!s.startTime) continue;
      const k = dateStrOf(s.startTime);
      const list = m.get(k);
      if (list) list.push(s); else m.set(k, [s]);
    }
    for (const list of m.values()) {
      list.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    }
    return m;
  }, [shifts, dateStrOf]);

  const diasSemana = useMemo(() => {
    // Nombres cortos en el idioma del usuario, empezando en lunes.
    const base = new Date(2026, 0, 5); // un lunes cualquiera
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      return d.toLocaleDateString(locale, { weekday: 'short' }).replace(/^./, (c) => c.toUpperCase());
    });
  }, [locale]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl" style={{ border: '1px solid var(--hairline)' }}>
      {/* Cabecera de días */}
      <div className="grid shrink-0" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: 'var(--glass-sunken)' }}>
        {diasSemana.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--ink-soft)', borderBottom: '1px solid var(--hairline)' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Seis semanas */}
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridTemplateRows: 'repeat(6, minmax(0, 1fr))' }}>
        {celdas.map((c) => {
          const delDia = porDia.get(c.dateStr) || [];
          const hoy = c.dateStr === todayStr;
          const visibles = delDia.slice(0, MAX_CHIPS);
          const resto = delDia.length - visibles.length;
          return (
            <div
              key={c.dateStr}
              className="flex min-h-0 flex-col gap-0.5 overflow-hidden p-1"
              style={{
                borderRight: '1px solid var(--hairline)',
                borderBottom: '1px solid var(--hairline)',
                background: hoy
                  ? 'color-mix(in oklab, var(--brand) 8%, transparent)'
                  : c.domingo ? 'color-mix(in oklab, var(--bad) 4%, transparent)' : undefined,
                opacity: c.delMes ? 1 : 0.45,
              }}
              onDoubleClick={() => onPickDay(c.dateStr)}
            >
              <div className="flex shrink-0 items-center justify-between">
                <span
                  className={`text-[11px] tabular-nums ${hoy ? 'font-bold' : 'font-medium'}`}
                  style={{ color: hoy ? 'var(--brand)' : 'var(--ink-soft)' }}
                >
                  {c.date.getDate()}
                </span>
                {delDia.length > 0 && (
                  <span className="text-[9px] tabular-nums" style={{ color: 'var(--ink-faint)' }}>{delDia.length}</span>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                {visibles.map((s) => {
                  const color = guardColorMap[s.guardId] || 'var(--ink-faint)';
                  const est = stationsById.get(s.stationId);
                  const quien = nombreDeVigilante(s.guard, 'Vigilante');
                  const aprendiz = (s as any).status === 'training';
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onPickShift(s); }}
                      className="cg-focus flex shrink-0 items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] transition-opacity hover:opacity-80"
                      style={{
                        background: 'var(--glass-sunken)',
                        borderLeft: `3px solid ${color}`,
                        // El aprendiz se ve, pero apagado: está en el puesto y no
                        // cubre la plaza (ver `lib/shiftStatus`).
                        ...(aprendiz ? { opacity: 0.6, borderStyle: 'dashed' } : null),
                      }}
                      title={`${quien}${est ? ` · ${est.stationName}` : ''} · ${timeOf(s.startTime)}–${timeOf(s.endTime)}${aprendiz ? ' · aprendiz' : ''}`}
                    >
                      <span className="tabular-nums" style={{ color: 'var(--ink-faint)' }}>{timeOf(s.startTime)}</span>
                      <span className="truncate font-medium">{quien.split(' ')[0]}</span>
                      {est && <span className="truncate" style={{ color: 'var(--ink-faint)' }}>{stationShort(est)}</span>}
                    </button>
                  );
                })}
                {resto > 0 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onPickDay(c.dateStr); }}
                    className="cg-focus shrink-0 rounded px-1 text-left text-[10px] font-semibold hover:underline"
                    style={{ color: 'var(--ink-soft)' }}
                  >
                    +{resto} más
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* 42 celdas se repintan baratas, pero el padre re-renderiza en cada scroll y en
   cada gesto de selección de la hoja: memoizar corta ese ruido. */
export default React.memo(MonthCalendarInner);
