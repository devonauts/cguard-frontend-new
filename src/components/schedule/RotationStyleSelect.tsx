import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiService } from '@/services/api/apiService';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';

export type RotationStyle = {
  id: string;
  name: string;
  dayShifts: number;
  nightShifts: number;
  restDays: number;
  isSystem?: boolean;
};

/**
 * Patrón de rotación picker, chosen at STATION level (create/edit) and inherited
 * by every guard assigned there. Options are filtered to the station's horario:
 *  - 24h  → day+night patterns (nightShifts > 0), e.g. 4-4-2
 *  - 12h  → work/rest patterns (nightShifts = 0), e.g. 8-2, 5-2, 6-1
 * Plus an inline "Personalizado" that creates a new rotationStyle on the fly.
 */
export default function RotationStyleSelect({
  scheduleType,
  value,
  onChange,
  onStyleChange,
}: {
  scheduleType: string;            // '24h' | '12h-day' | '12h-night' | 'custom'
  value: string;                   // rotationStyleId
  onChange: (id: string) => void;
  /** Fires with the FULL selected style (or null) so callers can derive counts (e.g. alternation fijos = cycle/workDays). */
  onStyleChange?: (style: RotationStyle | null) => void;
}) {
  const { t } = useTranslation();
  const tenantId = localStorage.getItem('tenantId') || '';
  const is24h = scheduleType === '24h';
  const [styles, setStyles] = useState<RotationStyle[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [custom, setCustom] = useState(false);
  const [cWork, setCWork] = useState(is24h ? '4' : '8');
  const [cNight, setCNight] = useState('4');
  const [cRest, setCRest] = useState('2');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res: any = await ApiService.get(`/tenant/${tenantId}/rotation-styles`);
        if (alive) setStyles(Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : []));
      } catch { /* leave empty */ } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [tenantId]);

  /**
   * TODOS los patrones, con los propios del horario PRIMERO.
   *
   * Antes esto era un `.filter()`: en un puesto de 24 h sólo se veían los
   * patrones con noches. Eso cerraba una operación que el motor SÍ sabe hacer
   * —un diurno fijo y un nocturno fijo en el mismo puesto, cada uno con sus
   * horas, con un patrón SIN noches— porque el detector de huecos del backend
   * decide la mitad por las horas del puesto cuando los fijos las tienen
   * distintas (`hoursDecideHalf`). El filtro escondía la mitad del motor.
   *
   * Se ordena en vez de esconder: lo habitual arriba, lo demás disponible.
   */
  const encaja = (s: RotationStyle) => (is24h ? (s.nightShifts || 0) > 0 : (s.nightShifts || 0) === 0);
  const options = useMemo(
    () => [...styles].sort((a, b) => Number(encaja(b)) - Number(encaja(a))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [styles, is24h],
  );
  const recomendados = useMemo(() => options.filter(encaja), [options]);

  // Auto-pick a sensible default when nothing valid is selected for this horario.
  useEffect(() => {
    if (!options.length) return;
    if (value && options.some((o) => o.id === value)) return;
    // El defecto sigue siendo el de siempre: quien no toque nada no nota el
    // cambio. Lo que se abrió es el catálogo, no el valor por defecto.
    const base = recomendados.length ? recomendados : options;
    const preferred = is24h
      ? (base.find((o) => o.name === '4-4-2') || base[0])
      : (base.find((o) => o.name === '8-2') || base.find((o) => o.name === '5-2') || base[0]);
    if (preferred) onChange(preferred.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, is24h]);

  // Surface the selected style object to the parent (for derived counts).
  useEffect(() => {
    if (!onStyleChange) return;
    onStyleChange(styles.find((s) => s.id === value) || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, styles]);

  const describe = (s: RotationStyle) => {
    // `restDays: 0` es un patrón legítimo —el vigilante trabaja todos los días—
    // y "0 descanso" se lee como un dato a medio escribir. Se nombra.
    const descanso = s.restDays === 0 ? 'sin descanso' : `${s.restDays} descans${is24h ? 'o' : 'a'}`;
    return is24h
      ? `${s.dayShifts} día · ${s.nightShifts} noche · ${descanso}`
      : `${s.dayShifts} trabaja · ${descanso}`;
  };

  const createCustom = async () => {
    // En un 24 h los dos campos pueden bajar a 0 —un patrón sólo-noches o
    // sólo-días es legítimo y el backend lo guarda tal cual—, siempre que entre
    // los dos sumen al menos un día de trabajo.
    const work = is24h ? Math.max(0, parseInt(cWork) || 0) : Math.max(1, parseInt(cWork) || 0);
    // CERO DESCANSOS ES VÁLIDO: hay puestos que se cubren todos los días con la
    // misma persona. El backend ya lo guardaba tal cual («an explicit 0 must
    // persist as 0 — e.g. a no-rest pattern»); era este `Math.max(1, …)` —y el
    // `min={1}` del campo— lo único que lo impedía. Los días de TRABAJO sí
    // siguen con mínimo 1: un ciclo de 0 días no es un patrón, es una división
    // por cero en `getRotationStatus`.
    const rest = Math.max(0, parseInt(cRest) || 0);
    const night = is24h ? Math.max(0, parseInt(cNight) || 0) : 0;
    if (work + night < 1) {
      toast.error('El patrón necesita al menos un día de trabajo.');
      return;
    }
    const name = is24h ? `${work}-${night}-${rest}` : `${work}-${rest}`;
    setCreating(true);
    try {
      const res: any = await ApiService.post(`/tenant/${tenantId}/rotation-style`, {
        data: { name, dayShifts: work, nightShifts: night, restDays: rest },
      });
      const created = res?.data ?? res;
      if (created?.id) {
        setStyles((prev) => (prev.some((p) => p.id === created.id) ? prev : [...prev, created]));
        onChange(created.id);
        setCustom(false);
        toast.success(t('ui.RotationStyleSelect.patronDeRotacionCreado'));
      }
    } catch (e: any) {
      toast.error(e?.message || t('ui.RotationStyleSelect.errorCrearPatron', 'No se pudo crear el patrón'));
    } finally { setCreating(false); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t("ui.RotationStyleSelect.patronDeRotacion", "Patrón de rotación")}</label>
        <button type="button" onClick={() => setCustom((v) => !v)} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
          <Plus size={12} /> Personalizado
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" />{" "}{t('ui.RotationStyleSelect.cargandoPatrones')}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {options.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              className={`rounded-xl border px-3 py-2 text-left transition-all ${value === s.id ? 'border-primary bg-primary/10' : 'border-border/40 hover:border-primary/40'}`}
            >
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold text-foreground">{s.name}</span>
                {!encaja(s) && (
                  <span
                    className="rounded px-1 text-[8px] font-bold uppercase text-muted-foreground"
                    title={is24h
                      ? 'Sin noches: cada fijo se queda en SU horario. Úsalo con un Fijo diurno y un Fijo nocturno con horas distintas.'
                      : 'Con noches: pensado para puestos de 24 h que rotan día/noche.'}
                  >
                    {is24h ? 'sin noches' : 'con noches'}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground">{describe(s)}</div>
            </button>
          ))}
          {!options.length && <div className="col-span-full text-xs text-muted-foreground">{t('ui.RotationStyleSelect.noHayPatronesCreaUno')}</div>}
        </div>
      )}

      {custom && (
        <div className="mt-1 flex flex-wrap items-end gap-2 rounded-xl border border-border/40 bg-muted/10 p-3">
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">{is24h ? t('ui.RotationStyleSelect.dias', 'Días') : t('ui.RotationStyleSelect.trabaja', 'Trabaja')}</label>
            <input type="number" min={is24h ? 0 : 1} max={30} value={cWork} onChange={(e) => setCWork(e.target.value)} className="w-20 rounded-lg border border-border/40 bg-background px-2 py-1.5 text-sm font-mono outline-none focus:border-primary" />
          </div>
          {is24h && (
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Noches</label>
              <input type="number" min={0} max={30} value={cNight} onChange={(e) => setCNight(e.target.value)} className="w-20 rounded-lg border border-border/40 bg-background px-2 py-1.5 text-sm font-mono outline-none focus:border-primary" />
            </div>
          )}
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Descansa</label>
            <input type="number" min={0} max={30} value={cRest} onChange={(e) => setCRest(e.target.value)} className="w-20 rounded-lg border border-border/40 bg-background px-2 py-1.5 text-sm font-mono outline-none focus:border-primary" />
          </div>
          {(parseInt(cRest) || 0) === 0 && (
            <div className="basis-full text-[10px]" style={{ color: 'var(--ink-soft)' }}>
              Sin descanso: el vigilante trabaja todos los días, sin sacafranco que lo releve.
            </div>
          )}
          {/* La tinta sobre el relleno de marca es `--brand-ink`, no blanco:
              `.cg-btn-brand` ya trae las dos y sigue al acento configurado. */}
          <button type="button" onClick={createCustom} disabled={creating} className="cg-btn-brand cg-focus inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-[filter] hover:brightness-105 disabled:opacity-50">
            {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Crear y usar
          </button>
        </div>
      )}
    </div>
  );
}
