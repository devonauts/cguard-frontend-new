/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESTADO DE UN EQUIPO — VOCABULARIO COMÚN DE VÍDEO Y RADIO
 * Grabadores, cámaras, sitios de retransmisión y enlaces de radio contestan a
 * la misma pregunta: ¿este equipo está dando servicio ahora mismo?
 *
 * ── POR QUÉ HACÍA FALTA ESTE ARCHIVO ───────────────────────────────────────
 * La palabra «sin conexión» se pintaba de CUATRO maneras distintas en cuatro
 * pantallas hermanas: `bad` en los dispositivos de vídeo, `neutral` en los
 * sitios de retransmisión, `neutral` en los enlaces de radio y `var(--bad)` en
 * el monitoreo. El mismo equipo caído se leía como catástrofe o como trámite
 * según por dónde se entrara.
 *
 * La escala queda fijada aquí, y es SEMÁNTICA: un equipo caído es `bad` en las
 * cuatro, un fallo de credenciales o un equipo sin probar es `warn`, y jamás se
 * usa el acento de marca para decir que algo va mal — el acento es configurable
 * por el cliente y la avería no.
 * ════════════════════════════════════════════════════════════════════════════
 */
import type { ReactNode } from 'react';
import { Wifi, WifiOff, ShieldAlert, HelpCircle } from 'lucide-react';
import { StatusBadge } from '@/components/kit';

export type DeviceTone = 'ok' | 'warn' | 'bad' | 'neutral';

/** Los cinco estados en los que puede estar cualquier equipo del sistema. */
export type DeviceHealth = 'up' | 'down' | 'auth' | 'unreachable' | 'unknown';

const HEALTH: Record<DeviceHealth, { tone: DeviceTone; icon: ReactNode }> = {
  // «Está dando servicio»: el punto LATE, que es lo que distingue de un vistazo
  // un equipo transmitiendo ahora de uno meramente dado de alta.
  up: { tone: 'ok', icon: <Wifi /> },
  down: { tone: 'bad', icon: <WifiOff /> },
  auth: { tone: 'warn', icon: <ShieldAlert /> },
  unreachable: { tone: 'warn', icon: <WifiOff /> },
  unknown: { tone: 'neutral', icon: <HelpCircle /> },
};

export function healthTone(health: DeviceHealth): DeviceTone {
  return HEALTH[health].tone;
}

/**
 * La píldora de estado de un equipo. Una sola pieza para las cuatro pantallas:
 * el punto que late lo pone la propia píldora del kit cuando el equipo está
 * arriba, y el icono lo pone el estado.
 */
export function DeviceStatusBadge({ health, label }: { health: DeviceHealth; label: string }) {
  const h = HEALTH[health];
  return (
    <StatusBadge tone={h.tone} dot={health === 'up'}>
      {health !== 'up' && <span className="[&_svg]:size-3">{h.icon}</span>}
      {label}
    </StatusBadge>
  );
}

/**
 * El canto rojo del canto izquierdo de una tarjeta averiada. Estaba copiado
 * carácter a carácter entre el registro de eventos de vídeo y los enlaces de
 * radio, sombra incluida.
 */
export function FaultRail() {
  return (
    <span
      aria-hidden
      className="absolute left-0 top-1/2 h-3/5 w-[3px] -translate-y-1/2 rounded-full"
      style={{
        background: 'var(--bad)',
        boxShadow: '0 0 12px 0 color-mix(in oklab, var(--bad) 45%, transparent)',
      }}
    />
  );
}
