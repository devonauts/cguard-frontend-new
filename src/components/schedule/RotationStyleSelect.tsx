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
 * by every guard assigned there.
 *
 * ── POR QUÉ HAY UN SEGUNDO CAMPO Y CUÁNDO SE ENSEÑA ────────────────────────
 * El ciclo que guarda el motor tiene DOS tramos de trabajo y unos libres
 * (`dayShifts` / `nightShifts` / `restDays`). Hasta ahora el segundo campo sólo
 * aparecía en los puestos de 24 h, donde ese tramo es la noche.
 *
 * Eso dejaba fuera la operación de una estación PERSONALIZADA partida en
 * bloques. BIOMAR BAHIA cubre 07:00–23:00 en dos tramos (07:00–15:00 y
 * 15:00–23:00) y tiene vigilantes que hacen unos días la mañana, otros la tarde
 * y otros libran. El generador sabe hacerlo desde siempre —al entrar en el
 * segundo tramo del ciclo toma el bloque SIGUIENTE al propio— pero el
 * formulario sólo ofrecía «trabaja / descansa», así que ese ciclo no había
 * forma de escribirlo: se acababa guardando un 8-2 que no era lo pedido.
 *
 * Ahora el segundo campo aparece siempre que la estación tenga dos tramos o
 * más (`bloques`), y se llama por su nombre real —«tarde», «mañana», «noche»—
 * en vez de «noches» a secas.
 */
export default function RotationStyleSelect({
  scheduleType,
  value,
  onChange,
  onStyleChange,
  bloques = 1,
  etiquetaPrimerBloque,
  etiquetaSegundoBloque,
}: {
  scheduleType: string;            // '24h' | '12h-day' | '12h-night' | 'custom'
  value: string;                   // rotationStyleId
  onChange: (id: string) => void;
  /** Fires with the FULL selected style (or null) so callers can derive counts (e.g. alternation fijos = cycle/workDays). */
  onStyleChange?: (style: RotationStyle | null) => void;
  /** En cuántos tramos está partida la cobertura de la estación (custom). 1 = uno solo. */
  bloques?: number;
  /** Cómo se llama el primer tramo aquí ('mañana', 'tarde'…). Por defecto, 'día'. */
  etiquetaPrimerBloque?: string;
  /** Cómo se llama el segundo tramo aquí ('tarde', 'noche'…). Por defecto, 'noche'. */
  etiquetaSegundoBloque?: string;
}) {
  const { t } = useTranslation();
  const tenantId = localStorage.getItem('tenantId') || '';
  const is24h = scheduleType === '24h';
  /**
   * Hay dos tramos que repartir cuando el puesto es de 24 h (día y noche) o
   * cuando la estación parte su cobertura en dos bloques o más. Es la condición
   * que gobierna TODO lo de abajo; `is24h` sólo decide ya los textos propios de
   * un 24 h (ventanas espejo 07:00–19:00 / 19:00–07:00).
   */
  const tramos = Math.max(1, Math.floor(Number(bloques) || 1));
  const dosTramos = is24h || tramos >= 2;
  /* Los dos tramos se nombran con las horas REALES de la estación —«mañana» y
     «tarde» en 07:00–15:00 + 15:00–23:00, «tarde» y «noche» en 15:00–07:00— y
     no se adivina uno a partir del otro: en un puesto de 24 h siguen siendo el
     día y la noche de siempre. */
  const lblSegundo = (etiquetaSegundoBloque || 'noche').trim() || 'noche';
  const lblPrimero = is24h ? 'día' : ((etiquetaPrimerBloque || 'día').trim() || 'día');
  const [styles, setStyles] = useState<RotationStyle[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [custom, setCustom] = useState(false);
  const [cWork, setCWork] = useState(dosTramos ? (is24h ? '4' : '2') : '8');
  const [cNight, setCNight] = useState(is24h ? '4' : '2');
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
  /* ─── CÓMO TRABAJAN LOS FIJOS DE UN PUESTO CON DOS TRAMOS ────────────────
     Son dos operaciones distintas y el catálogo no las distinguía:

       · ROTATIVO — un patrón CON segundo tramo (4-4-2, o 2-2-2 en una estación
         de mañana y tarde): el mismo vigilante hace unos días un tramo y otros
         días el otro.
       · TURNOS FIJOS — un patrón SIN segundo tramo: cada uno se queda SIEMPRE
         en su franja, y lo único que se decide es cada cuántos días libra.

     El motor sabía hacer las dos desde siempre, pero la única pista era una
     etiquetita «sin noches» con un tooltip. Se pregunta directamente. */
  const estiloActual = styles.find((s) => s.id === value) || null;
  const [modoFijos, setModoFijos] = useState<boolean | null>(null);
  const fijos = dosTramos && (modoFijos ?? ((estiloActual?.nightShifts ?? (is24h ? 1 : 0)) === 0));

  const encaja = (s: RotationStyle) => (dosTramos
    ? (fijos ? (s.nightShifts || 0) === 0 : (s.nightShifts || 0) > 0)
    : (s.nightShifts || 0) === 0);
  /* En TURNOS FIJOS se filtra de verdad, no se ordena. Un 4-4-2 ahí no quiere
     decir nada —el vigilante no rota, se queda en su plaza— y ofrecerlo sólo
     confunde: lo único que se decide es cada cuántos días libra. En rotativo se
     sigue ordenando sin esconder, que es como estaba. */
  const options = useMemo(
    () => (fijos
      ? styles.filter((s) => (s.nightShifts || 0) === 0)
      : [...styles].sort((a, b) => Number(encaja(b)) - Number(encaja(a)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [styles, dosTramos, fijos],
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
      : (dosTramos && !fijos
        ? (base.find((o) => o.name === '2-2-2') || base[0])
        : (base.find((o) => o.name === '8-2') || base.find((o) => o.name === '5-2') || base[0]));
    if (preferred) onChange(preferred.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, is24h, dosTramos, fijos]);

  /** Cambiar de modo re-elige patrón: dejar seleccionado uno del otro modo
   *  guardaría justo lo contrario de lo que se acaba de pedir. */
  const elegirModo = (quiereFijos: boolean) => {
    setModoFijos(quiereFijos);
    const candidatos = styles.filter((s) => (quiereFijos ? (s.nightShifts || 0) === 0 : (s.nightShifts || 0) > 0));
    if (!candidatos.length) {
      // No hay ninguno: se abre el creador ya preparado para ese modo.
      setCWork(quiereFijos ? '1' : (is24h ? '4' : '2'));
      setCNight(quiereFijos ? '0' : (is24h ? '4' : '2'));
      setCRest(quiereFijos ? '0' : '2');
      setCustom(true);
      return;
    }
    if (!candidatos.some((c) => c.id === value)) {
      const pref = quiereFijos
        ? (candidatos.find((c) => c.restDays === 0) || candidatos[0])
        : (candidatos.find((c) => c.name === (is24h ? '4-4-2' : '2-2-2')) || candidatos[0]);
      onChange(pref.id);
    }
  };

  /** «Sin descansos»: trabaja todos los días. Es lo primero que pide un puesto
   *  fijo recién montado y no había forma de llegar a ello sin abrir el creador
   *  personalizado y adivinar que «0 descansos» era legal. Si el patrón no
   *  existe en la empresa, se crea al vuelo. */
  const sinDescansos = useMemo(
    () => styles.find((x) => (x.nightShifts || 0) === 0 && x.restDays === 0 && (x.dayShifts || 0) > 0) || null,
    [styles],
  );
  const elegirSinDescansos = async () => {
    if (sinDescansos) { onChange(sinDescansos.id); return; }
    setCreating(true);
    try {
      const res: any = await ApiService.post(`/tenant/${tenantId}/rotation-style`, {
        data: { name: 'Fijo sin descanso', description: 'Trabaja todos los días', dayShifts: 1, nightShifts: 0, restDays: 0 },
      });
      const creado = res?.data ?? res;
      if (creado?.id) {
        setStyles((prev) => (prev.some((p) => p.id === creado.id) ? prev : [...prev, creado]));
        onChange(creado.id);
      }
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo crear el patrón');
    } finally { setCreating(false); }
  };

  // Surface the selected style object to the parent (for derived counts).
  useEffect(() => {
    if (!onStyleChange) return;
    onStyleChange(styles.find((s) => s.id === value) || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, styles]);

  const describe = (s: RotationStyle) => {
    // `restDays: 0` es un patrón legítimo —el vigilante trabaja todos los días—
    // y "0 descanso" se lee como un dato a medio escribir. Se nombra.
    const descanso = s.restDays === 0 ? 'sin descanso' : `${s.restDays} descansa`;
    // Un patrón sin segundo tramo se describe con UN solo número de trabajo,
    // venga de donde venga: escribir «· 0 noche» sólo se lee como un dato roto.
    return (s.nightShifts || 0) > 0
      ? `${s.dayShifts} ${lblPrimero} · ${s.nightShifts} ${lblSegundo} · ${descanso}`
      : `${s.dayShifts} trabaja · ${descanso}`;
  };

  const createCustom = async () => {
    // Con dos tramos los dos campos pueden bajar a 0 —un patrón de un solo tramo
    // es legítimo y el backend lo guarda tal cual—, siempre que entre los dos
    // sumen al menos un día de trabajo.
    const work = dosTramos ? Math.max(0, parseInt(cWork) || 0) : Math.max(1, parseInt(cWork) || 0);
    // CERO DESCANSOS ES VÁLIDO: hay puestos que se cubren todos los días con la
    // misma persona. El backend ya lo guardaba tal cual («an explicit 0 must
    // persist as 0 — e.g. a no-rest pattern»); era este `Math.max(1, …)` —y el
    // `min={1}` del campo— lo único que lo impedía. Los días de TRABAJO sí
    // siguen con mínimo 1: un ciclo de 0 días no es un patrón, es una división
    // por cero en `getRotationStatus`.
    const rest = Math.max(0, parseInt(cRest) || 0);
    // En TURNOS FIJOS no hay segundo tramo en el patrón —la franja la pone la
    // ventana de la plaza—, y el campo ni se enseña: se fuerza a 0 para que lo
    // oculto no pueda colarse en lo guardado.
    const night = (dosTramos && !fijos) ? Math.max(0, parseInt(cNight) || 0) : 0;
    if (work + night < 1) {
      toast.error('El patrón necesita al menos un día de trabajo.');
      return;
    }
    const name = night > 0 ? `${work}-${night}-${rest}` : `${work}-${rest}`;
    // Reutiliza uno idéntico en vez de acumular duplicados en el catálogo: el
    // mismo ciclo creado dos veces son dos filas que luego hay que distinguir.
    const igual = styles.find((s) => s.dayShifts === work && s.nightShifts === night && s.restDays === rest);
    if (igual) { onChange(igual.id); setCustom(false); return; }
    setCreating(true);
    try {
      const res: any = await ApiService.post(`/tenant/${tenantId}/rotation-style`, {
        data: {
          name,
          description: night > 0 ? `${work} ${lblPrimero} · ${night} ${lblSegundo} · ${rest} descansa` : undefined,
          dayShifts: work,
          nightShifts: night,
          restDays: rest,
        },
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

      {dosTramos && (
        <div className="rounded-xl p-2.5" style={{ border: '1px solid var(--hairline)', background: 'var(--glass-sunken)' }}>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-soft)' }}>
            ¿Cómo trabajan los {tramos > 2 ? `${tramos} ` : 'dos '}vigilantes?
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => elegirModo(false)}
              className={`cg-focus rounded-lg px-2 py-2 text-left text-[11px] font-semibold transition-all ${!fijos ? 'glass-brand' : 'glass-flat'}`}
            >
              Rotativo
              <span className="mt-0.5 block text-[10px] font-normal opacity-75">
                {is24h
                  ? 'Cada uno hace días y noches por turnos'
                  : `Cada uno hace unos días la ${lblPrimero} y otros la ${lblSegundo}`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => elegirModo(true)}
              className={`cg-focus rounded-lg px-2 py-2 text-left text-[11px] font-semibold transition-all ${fijos ? 'glass-brand' : 'glass-flat'}`}
            >
              Turnos fijos
              <span className="mt-0.5 block text-[10px] font-normal opacity-75">
                {is24h
                  ? 'Uno siempre de día y otro siempre de noche'
                  : `Cada uno se queda siempre en su tramo (${lblPrimero} o ${lblSegundo})`}
              </span>
            </button>
          </div>
          {fijos && (
            <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--ink-soft)' }}>
              {is24h ? (
                <>
                  Se crean dos plazas con horarios espejo: <strong>Fijo 1 de 07:00 a 19:00</strong> y{' '}
                  <strong>Fijo 2 de 19:00 a 07:00</strong>. Cada vigilante se queda en la suya — al asignarlos,
                  el turno lo decide la plaza que elijas. Abajo sólo queda decidir cada cuántos días libran.
                </>
              ) : (
                <>
                  Se crea una plaza por tramo ({tramos} en total). Cada vigilante se queda en la suya — al
                  asignarlo, el tramo lo decide la plaza que elijas. Abajo sólo queda decidir cada cuántos
                  días libran.
                </>
              )}
            </p>
          )}
          {!fijos && !is24h && (
            <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--ink-soft)' }}>
              El ciclo alterna entre el tramo de la plaza y el siguiente. Un <strong>2-2-2</strong> aquí es
              «2 días de {lblPrimero}, 2 días de {lblSegundo}, 2 libres». Si el vigilante necesita otro ciclo
              distinto al de sus compañeros, se le puede dar el suyo al asignarlo.
            </p>
          )}
        </div>
      )}

      {fijos && (
        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-soft)' }}>
          ¿Cada cuántos días libran?
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" />{" "}{t('ui.RotationStyleSelect.cargandoPatrones')}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fijos && (
            <button
              type="button"
              onClick={() => void elegirSinDescansos()}
              disabled={creating}
              className={`rounded-xl border px-3 py-2 text-left transition-all disabled:opacity-50 ${sinDescansos && value === sinDescansos.id ? 'border-primary bg-primary/10' : 'border-border/40 hover:border-primary/40'}`}
            >
              <span className="text-xs font-semibold text-foreground">Sin descansos</span>
              <div className="text-[10px] text-muted-foreground">Trabaja todos los días</div>
            </button>
          )}
          {options.filter((s) => !(fijos && sinDescansos && s.id === sinDescansos.id)).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              className={`rounded-xl border px-3 py-2 text-left transition-all ${value === s.id ? 'border-primary bg-primary/10' : 'border-border/40 hover:border-primary/40'}`}
            >
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold text-foreground">{s.name}</span>
                {!encaja(s) && !fijos && (
                  <span
                    className="rounded px-1 text-[8px] font-bold uppercase text-muted-foreground"
                    title={dosTramos
                      ? `Sin ${lblSegundo}: cada fijo se queda en SU tramo. Úsalo con una plaza por tramo, cada una con sus horas.`
                      : `Con ${lblSegundo}: pensado para puestos que alternan dos tramos.`}
                  >
                    {dosTramos ? `sin ${lblSegundo}` : `con ${lblSegundo}`}
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
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">
              {dosTramos && !fijos
                ? (is24h ? t('ui.RotationStyleSelect.dias', 'Días') : `Turnos de ${lblPrimero}`)
                : t('ui.RotationStyleSelect.trabaja', 'Trabaja')}
            </label>
            <input type="number" min={dosTramos ? 0 : 1} max={30} value={cWork} onChange={(e) => setCWork(e.target.value)} className="w-24 rounded-lg border border-border/40 bg-background px-2 py-1.5 text-sm font-mono outline-none focus:border-primary" />
          </div>
          {dosTramos && !fijos && (
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">
                {is24h ? 'Noches' : `Turnos de ${lblSegundo}`}
              </label>
              <input type="number" min={0} max={30} value={cNight} onChange={(e) => setCNight(e.target.value)} className="w-24 rounded-lg border border-border/40 bg-background px-2 py-1.5 text-sm font-mono outline-none focus:border-primary" />
            </div>
          )}
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Descansa</label>
            <input type="number" min={0} max={30} value={cRest} onChange={(e) => setCRest(e.target.value)} className="w-24 rounded-lg border border-border/40 bg-background px-2 py-1.5 text-sm font-mono outline-none focus:border-primary" />
          </div>
          {dosTramos && !fijos && (
            <div className="basis-full text-[10px]" style={{ color: 'var(--ink-soft)' }}>
              Ciclo de {(parseInt(cWork) || 0) + (parseInt(cNight) || 0) + (parseInt(cRest) || 0)} días:{' '}
              {parseInt(cWork) || 0} de {lblPrimero}, {parseInt(cNight) || 0} de {lblSegundo}
              {(parseInt(cRest) || 0) > 0 ? ` y ${parseInt(cRest) || 0} libre${(parseInt(cRest) || 0) > 1 ? 's' : ''}` : ', sin libres'}.
            </div>
          )}
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
