import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select';
import { Modal } from '@/components/kit';
import { Clock3 } from 'lucide-react';
import { toast } from 'sonner';
import { coverageService, coverageErrorCode } from '@/lib/api/coverageService';
import { ApiService } from '@/services/api/apiService';

/**
 * «Extender turno» desde el Horario: el vigilante que ya cubrió el día se queda
 * además con la noche porque su relevo no llegó.
 *
 * Mismo servicio que usa el tablero de Cobertura y la app del supervisor, así
 * que la regla y el registro son idénticos se decida donde se decida.
 *
 * ── POR QUÉ AVISA EN VEZ DE BLOQUEAR ──────────────────────────────────────
 * Cuando a las 18:00 no aparece el relevo, el supervisor TIENE que dejar a
 * alguien en el puesto. Un sistema que se niega es un sistema que se saltan por
 * fuera — y entonces se pierde el registro, que es lo único que vale después.
 * Las consecuencias se MUESTRAN y se envía cuáles se advirtieron.
 */

export interface ExtendTarget {
  guardId: string;
  guardName: string;
  stationName?: string | null;
  /** Fin previsto de su turno, para proponer un «hasta» razonable. */
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

const SIN_AUSENTE = '__nadie__';

/** `Date` → valor de un `<input type="datetime-local">`, en hora local. */
function paraInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ExtendShiftDialog({
  target,
  onClose,
  onDone,
}: {
  target: ExtendTarget | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  // Doce horas más allá de donde termina lo suyo: es lo que dura el turno que
  // va a cubrir. Se puede cambiar.
  const inicial = useMemo(() => {
    const base = target?.scheduledEnd ? new Date(target.scheduledEnd) : new Date();
    const d = Number.isNaN(base.getTime()) ? new Date() : base;
    return paraInput(new Date(d.getTime() + 12 * 3600000));
  }, [target?.scheduledEnd]);

  const [hasta, setHasta] = useState(inicial);
  const [motivo, setMotivo] = useState('no_call_no_show');
  const [nota, setNota] = useState('');
  const [ausenteId, setAusenteId] = useState(SIN_AUSENTE);
  const [avisarCliente, setAvisarCliente] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [companeros, setCompaneros] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => { setHasta(inicial); }, [inicial]);

  // Quién faltó es OPCIONAL: a veces no falta nadie (el cliente pidió horas de
  // más). La lista es una comodidad, no un requisito.
  useEffect(() => {
    if (!target) return;
    let vivo = true;
    ApiService.get('/security-guard/autocomplete?limit=200')
      .then((r: any) => {
        if (!vivo) return;
        const filas = Array.isArray(r) ? r : r?.rows || r?.data || [];
        setCompaneros(
          filas
            .map((g: any) => ({ id: g.guardId || g.userId || g.id, label: g.label || g.fullName || g.name }))
            .filter((g: any) => g.id && g.label && String(g.id) !== String(target.guardId)),
        );
      })
      .catch(() => { /* sin lista, el campo simplemente no se ofrece */ });
    return () => { vivo = false; };
  }, [target]);

  // Las consecuencias, en vivo mientras se mueve la hora. No impiden nada.
  const horas = useMemo(() => {
    const fin = new Date(hasta);
    const ini = target?.scheduledEnd ? new Date(target.scheduledEnd) : null;
    if (Number.isNaN(fin.getTime()) || !ini || Number.isNaN(ini.getTime())) return null;
    return (fin.getTime() - ini.getTime()) / 3600000;
  }, [hasta, target?.scheduledEnd]);

  const avisos = useMemo(() => {
    const out: string[] = [];
    if (horas != null && horas > 0) out.push(`Son ${Math.round(horas)} h más de las previstas.`);
    if (horas != null && horas >= 12) out.push('Contando su turno, quedarían cerca de 24 h seguidas.');
    if (horas != null && horas <= 0) out.push('La hora de fin es anterior al inicio del tramo.');
    return out;
  }, [horas]);

  const guardar = async () => {
    if (!target) return;
    const fin = new Date(hasta);
    if (Number.isNaN(fin.getTime())) { toast.error('Revisa la hora de fin.'); return; }
    setGuardando(true);
    try {
      await coverageService.extension({
        guardId: target.guardId,
        until: fin.toISOString(),
        reason: motivo as any,
        reasonNote: nota.trim() || undefined,
        absentGuardId: ausenteId === SIN_AUSENTE ? undefined : ausenteId,
        notifyClient: avisarCliente,
        // Se guarda QUÉ se advirtió y aun así se confirmó. En una disputa
        // laboral eso pesa más que un bloqueo que alguien esquivó por fuera.
        acknowledgedWarnings: avisos,
      });
      toast.success(
        `${target.guardName} queda cubriendo hasta las ` +
        `${fin.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      );
      onDone?.();
      onClose();
    } catch (e: any) {
      const codigo = coverageErrorCode(e);
      toast.error(
        e?.response?.data?.message ||
        (codigo === 'post_ya_cubierto'
          ? 'Ese puesto ya tiene a otro vigilante en esa franja.'
          : 'No se pudo registrar la extensión.'),
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title="Extender turno"
      description={
        `${target?.guardName || ''}` +
        `${target?.stationName ? ` · ${target.stationName}` : ''}` +
        ' · se crea el tramo en el horario desde donde terminó el suyo'
      }
      icon={<Clock3 />}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={() => void guardar()} disabled={guardando}>
            {guardando ? 'Registrando…' : 'Autorizar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="cg-eyebrow mb-1.5 block" htmlFor="ext-hasta">Se queda hasta</label>
          <input
            id="ext-hasta"
            type="datetime-local"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="cg-input w-full px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="cg-eyebrow mb-1.5 block">Motivo</label>
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MOTIVOS.map((m) => <SelectItem key={m.v} value={m.v}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {companeros.length > 0 && (
          <div>
            <label className="cg-eyebrow mb-1.5 block">¿Quién faltó? (opcional)</label>
            <Select value={ausenteId} onValueChange={setAusenteId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_AUSENTE}>Nadie / no aplica</SelectItem>
                {companeros.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Si lo indicas, su turno de esa noche se marca como falta y queda en su historial.
            </p>
          </div>
        )}

        <div>
          <label className="cg-eyebrow mb-1.5 block" htmlFor="ext-nota">Qué gestión se hizo (opcional)</label>
          <Textarea
            id="ext-nota"
            rows={2}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Se llamó a tres vigilantes, ninguno pudo cubrir…"
          />
        </div>

        {/* Apagado por defecto: avisar es contarle al cliente que te falló un
            vigilante, y esa es una decisión por caso. Cuando se enciende, el
            mensaje habla de la COBERTURA, nunca del problema interno. */}
        <label className="glass-flat flex cursor-pointer items-start gap-3 rounded-lg p-3">
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
          <div className="rounded-lg p-3" style={{ background: 'color-mix(in oklab, var(--warn) 12%, transparent)' }}>
            <p className="cg-eyebrow" style={{ color: 'var(--warn-text)' }}>Antes de confirmar</p>
            <ul className="mt-1 space-y-0.5">
              {avisos.map((a, i) => (
                <li key={i} className="text-xs" style={{ color: 'var(--warn-text)' }}>· {a}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          El turno del día <strong>no se toca</strong>. Se añade el tramo nuevo al horario
          en ámbar, marcado <strong>2×</strong>, y el vigilante ya puede fichar en él. Las
          horas entran a su rol como <strong>tiempo extra autorizado</strong>, con este
          motivo y tu nombre.
        </p>
      </div>
    </Modal>
  );
}
