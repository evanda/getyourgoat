// Tiny synthesized sound effects, so the prototype ships no audio files.

type Sfx = 'butt' | 'grab' | 'wrong';

let ctx: AudioContext | null = null;

function tone(freqFrom: number, freqTo: number, dur: number, type: OscillatorType, gain: number): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, t);
  osc.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

export const sfx = {
  /** Must run inside a user gesture for browsers to allow audio. */
  unlock(): void {
    try {
      ctx ??= new AudioContext();
      void ctx.resume();
    } catch {
      ctx = null;
    }
  },
  play(kind: Sfx, enabled: boolean): void {
    if (!enabled || !ctx) return;
    if (kind === 'butt') {
      tone(180, 60, 0.12, 'square', 0.08); // thump
      tone(300, 900, 0.18, 'triangle', 0.06); // boing
    } else if (kind === 'grab') {
      tone(140, 70, 0.35, 'sawtooth', 0.05);
    } else {
      tone(220, 180, 0.15, 'sine', 0.05);
    }
  },
};
