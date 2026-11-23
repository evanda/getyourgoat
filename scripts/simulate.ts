// Pacing check: play many synthetic games against the engine and report
// goats saved and total time. The player model is a guess, not data; replace it
// with recorded answerMs once alpha submissions exist (design doc 7.5).
//
//   node scripts/simulate.ts [games] [key=value ...]   e.g. ogreSpeed=18
import { DEFAULTS, simulate, type GameEvent, type Params } from '../src/engine.ts';

const CATS = ['arithmetic', 'history', 'literature', 'earth science', 'philosophy'];
const VARIANTS = 3;

interface Player {
  name: string;
  /** Median seconds to answer, per category. */
  median: number[];
  /** Chance of answering correctly, per category. */
  accuracy: number[];
}

const PLAYERS: Player[] = [
  { name: 'quick', median: [3.5, 4.5, 4, 4.5, 5], accuracy: [0.95, 0.85, 0.85, 0.85, 0.8] },
  { name: 'typical', median: [5, 7, 6.5, 7, 8], accuracy: [0.9, 0.7, 0.75, 0.75, 0.65] },
  { name: 'slow', median: [8, 10, 9, 10, 11], accuracy: [0.85, 0.6, 0.65, 0.6, 0.55] },
];

let seed = 12345;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
function normal(): number {
  return Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
}
/** Log-normal answer time with the given median (sigma 0.4). */
function answerTime(median: number): number {
  return median * Math.exp(0.4 * normal());
}

function playOne(p: Params, pl: Player): { goats: number; time: number } {
  const events: GameEvent[] = [];
  let t = 0;
  for (let q = 0; q < CATS.length; q++) {
    let variant = 0;
    for (;;) {
      t += answerTime(pl.median[q]);
      if (rand() < pl.accuracy[q]) {
        events.push({ t, type: 'correct' });
        break;
      }
      events.push({ t, type: 'wrong' });
      t += 0.8; // decide what to do
      if (variant < VARIANTS - 1 && rand() < 0.6) {
        events.push({ t, type: 'reroll' });
        variant++;
      } else {
        events.push({ t, type: 'skip' });
        break;
      }
    }
  }
  const s = simulate(p, CATS, events, t + 1);
  return { goats: s.goats, time: s.t };
}

function pct(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

const args = process.argv.slice(2);
const games = Number(args.find((a) => /^\d+$/.test(a)) ?? 2000);
const params: Params = { ...DEFAULTS };
for (const a of args.filter((x) => x.includes('='))) {
  const [k, v] = a.split('=');
  if (!(k in params)) throw new Error(`unknown param ${k}`);
  (params as unknown as Record<string, number>)[k] = Number(v);
}

console.log('params', params);
for (const pl of PLAYERS) {
  const runs = Array.from({ length: games }, () => playOne(params, pl));
  const goats = runs.map((r) => r.goats);
  const times = runs.map((r) => r.time);
  const hist = [0, 1, 2, 3, 4, 5].map((g) => goats.filter((x) => x === g).length / games);
  console.log(
    `\n${pl.name.padEnd(8)} median goats ${pct(goats, 0.5)}  ` +
      `time p10/p50/p90 ${pct(times, 0.1).toFixed(0)}/${pct(times, 0.5).toFixed(0)}/${pct(times, 0.9).toFixed(0)}s`,
  );
  console.log(
    '  goats saved: ' + hist.map((h, g) => `${g}:${(h * 100).toFixed(0).padStart(3)}%`).join('  '),
  );
}
