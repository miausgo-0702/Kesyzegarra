// Sonidos sintetizados (sin archivos): alertas sutiles para KDS, crash y caja.
let ctx: AudioContext | null = null;

function ac() {
  if (typeof window === "undefined") return null;
  ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tono(freq: number, ini: number, dur: number, tipo: OscillatorType = "sine", vol = 0.12) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(freq, c.currentTime + ini);
  g.gain.setValueAtTime(0.0001, c.currentTime + ini);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + ini + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + ini + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + ini);
  o.stop(c.currentTime + ini + dur + 0.05);
}

export const sonido = {
  nuevaComanda: () => { tono(880, 0, 0.12); tono(1320, 0.13, 0.18); },
  alerta: () => { tono(660, 0, 0.18, "triangle", 0.08); tono(660, 0.25, 0.18, "triangle", 0.08); },
  listo: () => { tono(1046, 0, 0.1); tono(1318, 0.1, 0.1); tono(1568, 0.2, 0.2); },
  crash: () => {
    [0, 0.22, 0.44, 0.66].forEach((t, i) => tono(i % 2 ? 440 : 330, t, 0.2, "sawtooth", 0.07));
    tono(220, 0.9, 0.6, "sawtooth", 0.06);
  },
  cobro: () => { tono(1568, 0, 0.08); tono(2093, 0.09, 0.16); },
  tap: () => tono(1200, 0, 0.04, "sine", 0.04),
  /** Desbloquea el audio tras la primera interacción (política de autoplay). */
  desbloquear: () => { ac(); },
};
