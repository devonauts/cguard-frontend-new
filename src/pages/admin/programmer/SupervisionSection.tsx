import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, ShieldCheck, AlertTriangle, Settings2, Loader2, UserPlus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiService } from '@/services/api/apiService';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/ui/confirmDialog';
import { codePill, CODE_LABEL, columnRules } from './codeTones';

/**
 * ────────────────────────────────────────────────────────────────────────────
 * LA SUPERVISIÓN, ARRIBA DEL TODO Y CON FORMA DE ESTACIÓN
 *
 * El puesto de supervisión ya tenía rotación, gente asignada y motor propio,
 * pero vivía en OTRA pantalla (Supervisores › Puestos). El resultado medido en
 * producción: un puesto creado y cuatro supervisores sin asignar. La máquina
 * funcionaba; nadie entraba a usarla.
 *
 * Aquí se pinta con la MISMA rejilla, la MISMA geometría de columnas y LOS
 * MISMOS códigos (D/N/L/V/PM/F) que los vigilantes — importados de `codeTones`,
 * no copiados, para que un cambio de paleta no deje la supervisión pintando de
 * otro color el mismo permiso.
 *
 * Es un componente aparte a propósito: `Schedule.tsx` pasa de 2.700 líneas y se
 * edita a menudo. Todo lo de supervisión vive aquí y allí sólo hay una línea.
 *
 * Sólo LECTURA por ahora: los datos salen de `/supervision/grid`, que ya
 * respeta las novedades. Asignar y configurar sigue en Puestos, enlazado desde
 * la cabecera — enseñar un control que no escribe sería peor que no enseñarlo.
 * ────────────────────────────────────────────────────────────────────────────
 */

type Dia = { date: string; code: string };
type Supervisor = { assignmentId: string; userId: string | null; name: string; isRelief: boolean; days: Dia[] };
type Puesto = {
  id: string; name: string; zone: string | null;
  startTime: string | null; endTime: string | null;
  rotationStyle: { id: string; name: string } | null;
  coverage: { needed: number; assigned: number; missing: number };
  supervisors: Supervisor[];
};
type SinPuesto = { userId: string; name: string };
type Rejilla = {
  positions: Puesto[];
  unassigned?: SinPuesto[];
  totals: { positions: number; supervisors: number; missing: number; unassigned?: number };
};

const tenantId = () => localStorage.getItem('tenantId') || '';

export default function SupervisionSection({
  monthDays,
  colA,
  colB,
  gridCols,
  tintFor,
  colWidth,
}: {
  /** Los MISMOS días que pinta la hoja — así las columnas cuadran solas. */
  monthDays: Date[];
  /* Ventana virtualizada de la hoja: sólo se pintan las columnas [colA, colB).
     `gridCols` ya trae las dos columnas de relleno que conservan el ancho del
     año entero, así que aquí basta con abrir y cerrar cada fila con un div. */
  colA: number;
  colB: number;
  gridCols: string;
  /** Tinte de columna (hoy / domingo) que ya calcula la hoja. */
  tintFor?: (day: Date, index: number) => string | undefined;
  /** Ancho de columna, para que las rayitas verticales cuadren. La hoja del año
   *  usa 44 px; la línea de tiempo reparte el ancho entre 7 días. */
  colWidth?: number;
}) {
  const { t } = useTranslation();
  const visibleDays = monthDays.slice(colA, colB);
  const [abierta, setAbierta] = useState(true);
  const [datos, setDatos] = useState<Rejilla | null>(null);
  const [cargando, setCargando] = useState(true);
  /* ── ESTA SECCIÓN YA NO ES DE SOLO LECTURA ──────────────────────────────
     Nació mirando y su propio encabezado registró el resultado: «un puesto
     creado y cuatro supervisores sin asignar. La máquina funcionaba; nadie
     entraba a usarla». Los endpoints de asignar y quitar EXISTÍAN desde el
     principio (`/supervisor-positions/:id/assignments`); lo que faltaba era un
     sitio donde pulsarlos que no obligara a irse a otra pantalla. */
  const [asignar, setAsignar] = useState<{ positionId: string; posName: string; userId: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const desde = monthDays.length ? ymd(monthDays[0]) : '';
  const hasta = monthDays.length ? ymd(monthDays[monthDays.length - 1]) : '';

  /* Se saca del efecto para que asignar y quitar puedan volver a pedirla sin
     duplicar la llamada. */
  const cargar = useCallback(async () => {
    if (!desde || !hasta) return;
    setCargando(true);
    try {
      const r: any = await ApiService.get(`/tenant/${tenantId()}/supervision/grid?from=${desde}&to=${hasta}`);
      setDatos((r && (r.positions ? r : r.data)) || null);
    } catch {
      // Un fallo aquí no puede tumbar el Horario de vigilantes: la sección
      // simplemente no se pinta.
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  /** Índice por fecha, para no recorrer el array en cada celda (365 columnas). */
  const porFecha = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const p of datos?.positions || []) {
      for (const s of p.supervisors) {
        const dm = new Map<string, string>();
        for (const d of s.days) dm.set(d.date, d.code);
        m.set(s.assignmentId, dm);
      }
    }
    return m;
  }, [datos]);

  if (cargando && !datos) return null;
  if (!datos) return null;

  const asignarSupervisor = async () => {
    if (!asignar || !asignar.userId) { toast.error('Elige un supervisor'); return; }
    setGuardando(true);
    try {
      await ApiService.post(`/tenant/${tenantId()}/supervisor-positions/${asignar.positionId}/assignments`, {
        data: { supervisorUserId: asignar.userId, startDate: new Date().toISOString().slice(0, 10) },
      });
      toast.success('Supervisor asignado al puesto');
      setAsignar(null);
      cargar();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || 'No se pudo asignar');
    } finally { setGuardando(false); }
  };

  const quitarSupervisor = async (positionId: string, assignmentId: string, nombre: string) => {
    if (!(await confirmDialog({
      title: 'Quitar del puesto',
      message: `¿Quitar a ${nombre} de este puesto de supervisión? Se eliminan sus turnos planificados.`,
      confirmText: 'Quitar', tone: 'danger',
    }))) return;
    try {
      await ApiService.delete(`/tenant/${tenantId()}/supervisor-positions/${positionId}/assignments/${assignmentId}`);
      toast.success('Supervisor quitado del puesto');
      cargar();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || 'No se pudo quitar');
    }
  };

  const sinPuesto = datos.unassigned || [];
  // Una empresa con supervisores y SIN puestos tiene que ver la sección igual:
  // si no se pinta nada, parece que la función no existe — cuando lo que falta
  // es crear el puesto. Sólo se calla del todo si no hay ni puestos ni
  // supervisores, que es la única empresa a la que esto no le concierne.
  if (!datos.positions.length && !sinPuesto.length) return null;

  const faltan = datos.totals.missing;

  return (
    <div style={{ borderBottom: '2px solid var(--hairline)' }}>
      {/* Cabecera de la sección */}
      <div className="grid" style={{ gridTemplateColumns: gridCols, background: 'var(--glass-sunken)' }}>
        <div className="sticky left-0 z-20 flex items-center gap-2 px-4 py-2" style={{ background: 'var(--glass-sunken)' }}>
          <button
            onClick={() => setAbierta((v) => !v)}
            className="cg-btn-ghost cg-focus rounded p-0.5"
            aria-label={abierta ? t('ui.SupervisionSection.contraerSupervision', 'Contraer supervisión') : t('ui.SupervisionSection.expandirSupervision', 'Expandir supervisión')}
          >
            {abierta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <ShieldCheck size={14} style={{ color: 'var(--brand-text)' }} />
          <span className="truncate text-xs font-semibold uppercase tracking-wide">{t('ui.SupervisionSection.supervision', 'Supervisión')}</span>
          {(faltan > 0 || sinPuesto.length > 0) && (
            <span
              className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: 'color-mix(in oklab, var(--warn) 16%, transparent)', color: 'var(--warn-text)' }}
              title={t('ui.SupervisionSection.puestosDeSupervisionSinCubrir', 'Puestos de supervisión sin cubrir')}
            >
              <AlertTriangle size={11} />
              {faltan > 0 ? `faltan ${faltan}` : `${sinPuesto.length} sin puesto`}
            </span>
          )}
          <Link
            to="/supervisor-positions"
            className="cg-btn-ghost cg-focus rounded p-1"
            title={t('ui.SupervisionSection.configurarPuestosDeSupervision', 'Configurar puestos de supervisión')}
          >
            <Settings2 size={14} />
          </Link>
        </div>
        <div style={{ gridColumn: '2 / -1', ...columnRules(colWidth) }} />
      </div>

      {/* Supervisores con rol y sin puesto: el caso real de 3 de las 4 empresas
          que tienen supervisores. Es lo que hay que resolver, así que se dice. */}
      {abierta && sinPuesto.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: gridCols, borderTop: '1px solid var(--hairline)' }}>
          <div
            className="sticky left-0 z-20 flex items-center gap-2 px-4 py-2"
            style={{ background: 'var(--card)' }}
          >
            <AlertTriangle size={13} style={{ color: 'var(--warn-text)', flexShrink: 0 }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium" style={{ color: 'var(--warn-text)' }}>
                {sinPuesto.length === 1
                  ? '1 supervisor sin puesto'
                  : `${sinPuesto.length} supervisores sin puesto`}
              </p>
              <p className="truncate text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                {sinPuesto.map((u) => u.name).join(' · ')}
              </p>
            </div>
            <Link
              to="/supervisor-positions"
              className="cg-focus shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold hover:underline"
              style={{ color: 'var(--brand-text)' }}
            >
              Crear puesto
            </Link>
          </div>
          <div style={{ gridColumn: '2 / -1', ...columnRules(colWidth) }} />
        </div>
      )}

      {/* Asignar un supervisor a un puesto, sin salir del Horario */}
      {asignar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'oklch(0 0 0 / 0.55)' }} onClick={() => setAsignar(null)}>
          <div className="glass-raised mx-4 w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <div>
                <h4 className="text-sm font-semibold">Asignar supervisor</h4>
                <p className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>{asignar.posName}</p>
              </div>
              <button onClick={() => setAsignar(null)} className="cg-btn-ghost cg-focus rounded-lg p-1.5"><X size={15} /></button>
            </div>
            <div className="space-y-3 p-5">
              <label className="block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-soft)' }}>Supervisor</label>
              <select
                value={asignar.userId}
                onChange={(e) => setAsignar((m) => (m ? { ...m, userId: e.target.value } : m))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }}
              >
                <option value="">Selecciona…</option>
                {sinPuesto.map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}
              </select>
              {!sinPuesto.length && (
                <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                  Todos los supervisores con rol ya tienen puesto. Para añadir a alguien más, dale el rol de supervisor primero.
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--hairline)', background: 'var(--glass-sunken)' }}>
              <button onClick={() => setAsignar(null)} className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold">Cancelar</button>
              <button onClick={asignarSupervisor} disabled={guardando || !asignar.userId} className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-40">
                {guardando ? <Loader2 size={14} className="animate-spin" /> : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {abierta && datos.positions.map((p) => (
        <div key={p.id}>
          {/* Fila del puesto */}
          <div className="grid" style={{ gridTemplateColumns: gridCols, borderTop: '1px solid var(--hairline)' }}>
            <div className="sticky left-0 z-20 flex items-center gap-2 px-4 py-2" style={{ background: 'var(--card)' }}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                  {[p.zone, p.rotationStyle?.name, p.startTime && p.endTime ? `${p.startTime}–${p.endTime}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                style={
                  p.coverage.missing > 0
                    ? { background: 'color-mix(in oklab, var(--warn) 16%, transparent)', color: 'var(--warn-text)' }
                    : { background: 'color-mix(in oklab, var(--ok) 14%, transparent)', color: 'var(--ok-text)' }
                }
                title="Supervisores asignados vs. necesarios"
              >
                {p.coverage.assigned}/{p.coverage.needed}
              </span>
              {/* La acción donde está el problema: si al puesto le falta gente,
                  se asigna aquí mismo en vez de mandar al usuario a otra
                  pantalla — que es lo que hacía que esta sección no se usara. */}
              <button
                onClick={() => setAsignar({ positionId: p.id, posName: p.name, userId: '' })}
                className="cg-btn-ghost cg-focus shrink-0 rounded p-1"
                title="Asignar un supervisor a este puesto"
              >
                <UserPlus size={13} />
              </button>
            </div>
            <div />
            {visibleDays.map((d, k) => (
              <div key={colA + k} style={{ borderRight: '1px solid var(--hairline)', background: tintFor?.(d, colA + k) }} />
            ))}
            <div />
          </div>

          {/* Una fila por supervisor asignado */}
          {p.supervisors.map((s) => {
            const dm = porFecha.get(s.assignmentId);
            return (
              <div key={s.assignmentId} className="grid" style={{ gridTemplateColumns: gridCols, borderTop: '1px solid var(--hairline)' }}>
                <div className="sticky left-0 z-20 flex items-center gap-2 px-4 py-1.5 pl-10" style={{ background: 'var(--card)' }}>
                  <span className="truncate text-xs">{s.name}</span>
                  {s.isRelief && (
                    <span className="shrink-0 text-[10px]" style={{ color: 'var(--ink-faint)' }}>relevo</span>
                  )}
                  <span className="flex-1" />
                  <button
                    onClick={() => void quitarSupervisor(p.id, s.assignmentId, s.name)}
                    className="cg-btn-ghost cg-focus shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
                    title={`Quitar a ${s.name} de este puesto`}
                  >
                    <X size={12} />
                  </button>
                </div>
                <div />
                {visibleDays.map((d, k) => {
                  const i = colA + k;
                  const code = dm?.get(ymd(d)) || '';
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-center"
                      style={{ borderRight: '1px solid var(--hairline)', background: code ? undefined : tintFor?.(d, i) }}
                      title={code ? CODE_LABEL[code] || code : undefined}
                    >
                      {code ? (
                        <span
                          className="flex h-[22px] w-[34px] items-center justify-center rounded text-[10px] font-semibold"
                          style={codePill(code)}
                        >
                          {code}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
                <div />
              </div>
            );
          })}

          {/* Un puesto sin nadie asignado no puede verse como una fila vacía:
              es exactamente el caso que hay que resolver. */}
          {!p.supervisors.length && (
            <div className="grid" style={{ gridTemplateColumns: gridCols, borderTop: '1px solid var(--hairline)' }}>
              <div className="sticky left-0 z-20 px-4 py-1.5 pl-10 text-[11px]" style={{ background: 'var(--card)', color: 'var(--warn-text)' }}>
                {t('ui.SupervisionSection.sinSupervisoresAsignados', 'Sin supervisores asignados')}
              </div>
              <div style={{ gridColumn: '2 / -1', ...columnRules(colWidth) }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Fecha local en YYYY-MM-DD (las columnas de la hoja ya vienen en hora local). */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
