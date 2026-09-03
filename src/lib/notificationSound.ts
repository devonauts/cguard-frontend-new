// A synthesized notification chime played through the Web Audio API, so we ship
// no audio asset and add no dependency. Deliberately resilient: any failure
// (browser autoplay policy, no AudioContext, suspended context) is swallowed —
// the sound is a nicety, never a hard requirement.
let ctx: AudioContext | null = null;

export function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    // Browsers start the context suspended until a user gesture; resume() here
    // lets it sound once the user has interacted with the page at least once.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// One clean sine tone with a quick attack and exponential decay.
function tone(ac: AudioContext, freq: number, at: number, dur: number, gain: number) {
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur);
}

// A soft ascending two-note chime — "you have a notification".
export function playNotificationChime() {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  tone(ac, 880, t0, 0.16, 0.18); // A5
  tone(ac, 1174.7, t0 + 0.11, 0.26, 0.16); // D6
}

// ─── Panic alarm ────────────────────────────────────────────────────────────
// A loud, continuous two-tone siren "wail" that loops until stopped. Used for
// the full-screen panic alert so it's impossible to miss. startPanicAlarm()
// returns a stop function; calling start again is a no-op while one is active.
let panicNodes: { osc: OscillatorNode; gain: GainNode; timer: number } | null = null;

export function stopPanicAlarm() {
  if (!panicNodes) return;
  const { osc, gain, timer } = panicNodes;
  panicNodes = null;
  try { clearInterval(timer); } catch { /* noop */ }
  try {
    const ac = getCtx();
    const now = ac ? ac.currentTime : 0;
    gain.gain.cancelScheduledValues(now);
    gain.gain.linearRampToValueAtTime(0.0001, now + 0.08);
    osc.stop(now + 0.12);
  } catch { /* noop */ }
}

export function startPanicAlarm(): () => void {
  const ac = getCtx();
  if (!ac) return () => {};
  if (panicNodes) return stopPanicAlarm; // already wailing

  const osc = ac.createOscillator();
  osc.type = 'sawtooth'; // harsher than sine — reads as an alarm
  const gain = ac.createGain();
  gain.gain.value = 0.0001;
  osc.connect(gain).connect(ac.destination);
  osc.start();
  // Ramp up to a loud, attention-grabbing level.
  gain.gain.linearRampToValueAtTime(0.32, ac.currentTime + 0.06);

  // Alternate between a low and high tone every 0.5s for the classic siren wail.
  let high = false;
  const sweep = () => {
    const now = ac.currentTime;
    const target = high ? 1180 : 720;
    try {
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(osc.frequency.value || 720, now);
      osc.frequency.linearRampToValueAtTime(target, now + 0.45);
    } catch { /* noop */ }
    high = !high;
  };
  sweep();
  const timer = window.setInterval(sweep, 500);
  panicNodes = { osc, gain, timer };
  return stopPanicAlarm;
}
