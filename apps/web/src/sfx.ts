/** Tiny synthesized sound effects (no audio files). Browsers need a user gesture before the first sound. */
let ctx: AudioContext | undefined;
let muted = false;
export const setMuted = (m: boolean) => (muted = m);

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.15) {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

const seq = (notes: number[], step = 0.09, type: OscillatorType = "triangle", dur = 0.18) =>
  notes.forEach((n, i) => tone(n, i * step, dur, type));

export const sfx = {
  join: () => !muted && seq([523, 784], 0.08),
  start: () => !muted && seq([392, 523, 659, 784], 0.1, "square"),
  buzz: () => !muted && seq([440, 330], 0.06, "square", 0.12),
  tick: () => !muted && tone(880, 0, 0.05, "square", 0.05),
  correct: () => !muted && seq([659, 880, 1175], 0.07),
  wrong: () => !muted && seq([220, 165], 0.12, "sawtooth"),
  reveal: () => !muted && seq([523, 659, 784, 1047], 0.09),
  win: () => !muted && seq([523, 659, 784, 659, 784, 1047], 0.11, "triangle", 0.25),
};
