import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiService } from '@/services/api/apiService';
import { toast } from 'sonner';

/**
 * EXTENDER TURNO — el vigilante que ya está en el puesto se queda más.
 *
 * El caso que lo motiva: el del día termina a las 18:00, su compañero de la
 * noche no llega y no se consigue relevo. El vigilante se queda. Hasta ahora eso
 * entraba al sistema como una anomalía muda —una excepción de tiempo extra que
 * alguien tenía que investigar— sin motivo, sin autor y sin nadie a quien
 * atribuirlo.
 *
 * ── POR QUÉ ESTO AVISA EN VEZ DE BLOQUEAR ─────────────────────────────────
 * Cuando a las 18:00 no aparece el relevo, el supervisor TIENE que dejar a
 * alguien en el puesto. Un sistema que se niega es un sistema que se saltan por
 * fuera — y entonces se pierde el registro, que es lo único que de verdad vale
 * después. Así que las consecuencias se MUESTRAN («quedarían 24 h seguidas») y
 * el botón dice lo que va a pasar; lo que se guarda es que se avisó y quién
 * confirmó.
 */

export interface ExtendTarget {
  guardId: string;        // user.id
  guardName: string;
  stationName?: string | null;
  /** Fin previsto del turno, para proponer un «hasta» razonable. */
  scheduledEnd?: string | null;
}

const MOTIVOS: { v: string; label: string }[] = [
  { v: 'no_call_no_show', label: 'El relevo no llegó ni avisó' },
  { v: 'enfermedad', label: 'El relevo se reportó enfermo' },
  { v: 'permiso_con_sueldo', label: 'El relevo tenía permiso' },
  { v: 'calamidad_domestica', label: 'Calamidad doméstica del relevo' },
  { v: 'transporte', label: 'Problema de transporte' },
  { v: 'refuerzo_cliente', label: 'El cliente pidió horas adicionales' },
  { v: 'otro', label: 'Otro motivo' },
];

/** `Date` → valor para un <input type="datetime-local">, en hora local. */
function paraInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ExtendShiftDialog({
  tenantId,
  target,
  onClose,
  onDone,
}: {
  tenantId: string;
  target: ExtendTarget;
  onClose: () => void;
  onDone?: () => void;
}) {
  // Propuesta por defecto: doce horas más allá del fin previsto — que es lo que
  // dura el turno que está cubriendo. Se puede cambiar.
  const inicial = useMemo(() => {
    const base = target.scheduledEnd ? new Date(target.scheduledEnd) : new Date();
    const d = Number.isNaN(base.getTime()) ? new Date() : base;
    return paraInput(new Date(d.getTime() + 12 * 3600000));
  }, [target.scheduledEnd]);

  const [hasta, setHasta] = useState(inicial);
  const [motivo, setMotivo] = useState('no_call_no_show');
  const [nota, setNota] = useState('');
  const [ausenteId, setAusenteId] = useState('');
  const [avisarCliente, setAvisarCliente] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [companeros, setCompaneros] = useState<{ id: string; label: string }[]>([]);

  // Quién faltó es OPCIONAL: a veces no falta nadie (el cliente pidió horas de
  // más). La lista es una comodidad, no un requisito.
  useEffect(() => {
    let vivo = true;
    ApiService.get(`/tenant/${tenantId}/security-guard/autocomplete?limit=200`)
      .then((r: any) => {
        if (!vivo) return;
        const filas = Array.isArray(r) ? r : r?.rows || r?.data || [];
        setCompaneros(
          filas
            .map((g: any) => ({ id: g.guardId || g.userId || g.id, label: g.label || g.fullName || g.name }))
            .filter((g: any) => g.id && g.label && g.id !== target.guardId),
        );
      })
      .catch(() => { /* sin lista, el campo simplemente no se ofrece */ });
    return () => { vivo = false; };
  }, [tenantId, target.guardId]);

  // Las consecuencias, calculadas en vivo mientras el operador mueve la hora.
  // No impiden nada: informan antes de confirmar.
  const horas = useMemo(() => {
    const fin = new Date(hasta);
    const ini = target.scheduledEnd ? new Date(target.scheduledEnd) : null;
    if (Number.isNaN(fin.getTime()) || !ini || Number.isNaN(ini.getTime())) return null;
    return (fin.getTime() - ini.getTime()) / 3600000;
  }, [hasta, target.scheduledEnd]);

  const avisos = useMemo(() => {
    const out: string[] = [];
    if (horas != null && horas > 0) out.push(`Son ${Math.round(horas)} h más de las previstas.`);
    if (horas != null && horas >= 12) out.push('Con su turno, quedarían cerca de 24 h seguidas en el puesto.');
    if (horas != null && horas <= 0) out.push('La hora de fin es anterior al fin de su turno.');
    return out;
  }, [horas]);

  const guardar = async () => {
    const fin = new Date(hasta);
    if (Number.isNaN(fin.getTime())) { toast.error('Revisa la hora de fin.'); return; }
    setGuardando(true);
    try {
      await ApiService.post(`/tenant/${tenantId}/coverage/extension`, {
        guardId: target.guardId,
        until: fin.toISOString(),
        reason: motivo,
        reasonNote: nota.trim() || null,
        absentGuardId: ausenteId || null,
        notifyClient: avisarCliente,
        // Se guarda QUÉ se le advirtió y aun así confirmó. En una disputa
        // laboral eso vale más que un bloqueo que se saltaron por fuera.
        acknowledgedWarnings: avisos,
      });
      toast.success(`${target.guardName} se queda hasta las ${new Date(hasta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      onDone?.();
      onClose();
    } catch (e: any) {
      // El servicio devuelve 400 con un código cuando es una regla, no un fallo.
      const msg = e?.response?.data?.message || e?.message || 'No se pudo registrar la extensión.';
      toast.error(msg);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
         onMouseDown={onClose}>
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Extender turno"
      >
        <h2 className="text-lg font-semibold">Extender turno</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{target.guardName}</span>
          {target.stationName ? <> se queda en <span className="font-medium text-foreground">{target.stationName}</span></> : ' se queda en su puesto'}.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="ext-hasta">Se queda hasta</label>
            <input
              id="ext-hasta"
              type="datetime-local"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="ext-motivo">Motivo</label>
            <select
              id="ext-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              {MOTIVOS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
            </select>
          </div>

          {companeros.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="ext-ausente">
                ¿Quién faltó? <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <select
                id="ext-ausente"
                value={ausenteId}
                onChange={(e) => setAusenteId(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <option value="">Nadie / no aplica</option>
                {companeros.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Si lo indicas, queda registrado en su historial de asistencia.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="ext-nota">
              Qué gestión se hizo <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <textarea
              id="ext-nota"
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Se llamó a tres vigilantes, ninguno pudo cubrir…"
              className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Apagado por defecto: avisar es contarle al cliente que te falló un
              guardia, y eso es una decisión por caso. Cuando se enciende, el
              mensaje habla de la COBERTURA, nunca del problema interno. */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
            <input
              type="checkbox"
              checked={avisarCliente}
              onChange={(e) => setAvisarCliente(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium">Avisar al cliente</span>
              <span className="block text-xs text-muted-foreground">
                Se le informa de que su puesto queda cubierto y hasta qué hora. No se le
                dice quién faltó ni por qué.
              </span>
            </span>
          </label>

          {avisos.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Antes de confirmar</p>
              <ul className="mt-1 space-y-0.5">
                {avisos.map((a, i) => (
                  <li key={i} className="text-xs text-amber-700 dark:text-amber-300">· {a}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Las horas de más se registran como <strong>tiempo extra autorizado</strong> en su
            rol de horas. Su horario previsto no se modifica, para que el recargo se
            calcule igual que siempre.
          </p>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={() => void guardar()} disabled={guardando}>
            {guardando ? 'Registrando…' : 'Autorizar la extensión'}
          </Button>
        </div>
      </div>
    </div>
  );
}
