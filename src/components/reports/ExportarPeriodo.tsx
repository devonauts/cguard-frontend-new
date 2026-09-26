/**
 * ════════════════════════════════════════════════════════════════════════════
 * EXPORTAR UN PERIODO — hoy, esta semana, o el rango que haga falta
 *
 * ── QUÉ RESUELVE ───────────────────────────────────────────────────────────
 * `ExportMenu` ya resuelve «en qué formato». Faltaba «de cuándo», y no es un
 * detalle: los registros de garita se piden SIEMPRE por periodo —el parte del
 * día para el supervisor, la semana para el cliente, un rango concreto cuando
 * hay que reconstruir un incidente—. Sin esto, exportar bajaba lo que hubiera
 * cargado la pantalla y el usuario tenía que recortar en Excel.
 *
 * ── POR QUÉ EL RANGO NACE RELLENO ──────────────────────────────────────────
 * Al elegir «Rango» las dos fechas ya vienen con los últimos 30 días. Un par de
 * campos vacíos obliga a escribir dos fechas antes de ver nada, y la mitad de
 * las veces lo que se quería era justo eso.
 *
 * ── LA VENTANA SE MANDA SIEMPRE ────────────────────────────────────────────
 * También en «Hoy» y en «Semana»: el servidor no adivina el periodo, lo recibe.
 * Y lo interpreta en la zona horaria del PUESTO, no en la del navegador ni en
 * la del servidor (ver lib/tenantTz en el backend) — un «hoy» calculado en UTC
 * se come las entradas de la tarde en cualquier garita de América.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import ExportMenu from '@/components/reports/ExportMenu';
import type { ExportFormat } from '@/lib/export/reportExport';

export type Periodo = 'dia' | 'semana' | 'rango';

export interface Ventana {
  /** YYYY-MM-DD, inclusive. */
  from: string;
  /** YYYY-MM-DD, inclusive. */
  to: string;
  /** Cómo se llama este periodo, para el aviso y el nombre del archivo. */
  etiqueta: string;
}

/** Hoy en el reloj de QUIEN MIRA, en YYYY-MM-DD y sin pasar por UTC.
 *  `toISOString()` habría devuelto el día de mañana cada tarde al oeste de
 *  Greenwich, que es donde están todos nuestros puestos. */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function haceDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}

interface Props {
  /** Recibe el formato y la ventana ya resuelta. Si devuelve promesa, se espera. */
  onExport: (format: ExportFormat, ventana: Ventana) => void | Promise<void>;
  /** Sin filas: el menú se deshabilita en vez de bajar un archivo vacío. */
  disabled?: boolean;
  className?: string;
}

const OPCIONES: Array<{ id: Periodo; label: string; labelKey: string }> = [
  { id: 'dia', label: 'Hoy', labelKey: 'kit.dateRange.today' },
  { id: 'semana', label: 'Semana', labelKey: 'ui.ExportarPeriodo.semana' },
  { id: 'rango', label: 'Rango', labelKey: 'ui.ExportarPeriodo.rango' },
];

export default function ExportarPeriodo({ onExport, disabled = false, className }: Props) {
  const { t } = useTranslation();
  const [periodo, setPeriodo] = useState<Periodo>('dia');
  const [desde, setDesde] = useState<string>(haceDias(29));
  const [hasta, setHasta] = useState<string>(ymd(new Date()));

  const ventana = useMemo<Ventana>(() => {
    if (periodo === 'dia') {
      const hoy = ymd(new Date());
      return { from: hoy, to: hoy, etiqueta: 'hoy' };
    }
    if (periodo === 'semana') {
      // Los últimos 7 días incluido hoy, no «la semana natural»: quien pide el
      // parte semanal un miércoles quiere los siete días anteriores, no dos.
      return { from: haceDias(6), to: ymd(new Date()), etiqueta: 'ultimos-7-dias' };
    }
    // Un rango al revés no es un error del usuario, es un despiste: se ordena.
    const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
    return { from: a, to: b, etiqueta: `${a}_${b}` };
  }, [periodo, desde, hasta]);

  const campo =
    'cg-focus h-9 rounded-lg border px-2 text-sm';
  const estiloCampo = { borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className || ''}`}>
      {/* Segmentado: los tres periodos siempre visibles, sin desplegar nada. */}
      <div
        className="inline-flex items-center rounded-xl p-0.5"
        style={{ background: 'var(--glass-sunken)' }}
        role="group"
        aria-label={t('ui.ExportarPeriodo.periodoAExportar', 'Periodo a exportar')}
      >
        {OPCIONES.map((o) => {
          const activo = periodo === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setPeriodo(o.id)}
              aria-pressed={activo}
              className="cg-focus rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              style={
                activo
                  ? { background: 'var(--glass)', color: 'var(--ink)' }
                  : { color: 'var(--ink-soft)' }
              }
            >
              {t(o.labelKey, o.label)}
            </button>
          );
        })}
      </div>

      {periodo === 'rango' && (
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4" style={{ color: 'var(--ink-faint)' }} aria-hidden />
          <input
            type="date"
            aria-label={t('guards.availability.table.from', 'Desde')}
            className={campo}
            style={estiloCampo}
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value)}
          />
          <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>a</span>
          <input
            type="date"
            aria-label={t('guards.availability.table.to', 'Hasta')}
            className={campo}
            style={estiloCampo}
            value={hasta}
            min={desde}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
      )}

      <ExportMenu
        size="sm"
        disabled={disabled}
        onExport={(f) => onExport(f, ventana)}
      />
    </div>
  );
}
