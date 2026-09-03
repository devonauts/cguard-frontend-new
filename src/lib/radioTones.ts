/**
 * Los tonos de la radio en el CRM — los MISMOS que las apps (radioTones.ts allí,
 * misma síntesis, mismas frecuencias). Sin ficheros de audio: se sintetizan.
 *
 * El objetivo es que una pulsación te DIGA qué pasó sin mirar la pantalla, como
 * en un equipo Motorola de mano:
 *
 *   - permiso  : «el canal es tuyo, habla» — pitido corto y limpio.
 *   - roger    : «terminé» — el pitido de fin de transmisión.
 *   - denegado : «no puedes, ya hay alguien» — el zumbido grave, inconfundible.
 *
 * Voz de altavoz pequeño: onda cuadrada (un seno puro suena a aplicación, no a
 * radio) filtrada por arriba y por abajo, ataque de milisegundos y caída rápida
 * — un tono que se desvanece suena a notificación de móvil.
 *
 * Todo es mejor-esfuerzo: sin AudioContext o con la política de reproducción
 * automática en contra no suena y no pasa nada. Pulsar para hablar NUNCA puede
 * depender de que el pitido salga.
 *
 * Se reutiliza el AudioContext del aviso sonoro: crear un segundo contexto por
 * pestaña es una fuente conocida de que el navegador deje de dar audio.
 */
import { getCtx } from "./notificationSound";

function pitido(
  ac: AudioContext,
  opciones: { desde: number; hasta?: number; en: number; dur: number; gan: number },
): void {
  const { desde, hasta = desde, en, dur, gan } = opciones;

  const osc = ac.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(desde, en);
  if (hasta !== desde) osc.frequency.linearRampToValueAtTime(hasta, en + dur);

  // El par de filtros quita el filo de la onda cuadrada y deja timbre de bocina.
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 400;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3800;

  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, en);
  g.gain.exponentialRampToValueAtTime(gan, en + 0.004);
  g.gain.setValueAtTime(gan, en + dur - 0.018);
  g.gain.exponentialRampToValueAtTime(0.0001, en + dur);

  osc.connect(hp).connect(lp).connect(g).connect(ac.destination);
  osc.start(en);
  osc.stop(en + dur + 0.01);
}

/** «El canal es tuyo, habla.» Suena al abrirse el micrófono. */
export function playTalkPermit(): void {
  const ac = getCtx();
  if (!ac) return;
  try { pitido(ac, { desde: 920, en: ac.currentTime, dur: 0.075, gan: 0.18 }); } catch { /* ignore */ }
}

/** «Terminé.» Al soltar tras una transmisión real; cae de tono. */
export function playRoger(): void {
  const ac = getCtx();
  if (!ac) return;
  try {
    const t0 = ac.currentTime;
    pitido(ac, { desde: 1180, hasta: 1180, en: t0, dur: 0.055, gan: 0.16 });
    pitido(ac, { desde: 940, hasta: 880, en: t0 + 0.062, dur: 0.075, gan: 0.16 });
  } catch { /* ignore */ }
}

/**
 * «No puedes»: ya hay alguien en el canal (o falló el micrófono). Grave y más
 * largo que los otros dos a propósito — es el único que hay que distinguir sin
 * mirar.
 */
export function playDenied(): void {
  const ac = getCtx();
  if (!ac) return;
  try { pitido(ac, { desde: 310, hasta: 240, en: ac.currentTime, dur: 0.26, gan: 0.2 }); } catch { /* ignore */ }
}

/**
 * El rebote completo: tono grave + vibración corta donde exista (Android/Chrome;
 * en escritorio no hay y no pasa nada). Es el equivalente de `fb.radio.denied()`
 * de las apps — mismo nombre, mismo momento, mismo sonido.
 */
export function radioDenied(): void {
  playDenied();
  try { navigator.vibrate?.(120); } catch { /* ignore */ }
}
