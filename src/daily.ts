// Rounds: public/rounds/<level>/<n>.json. Round #n is also the daily puzzle for
// day n counted from EPOCH (#1 = 2026-11-23), at each level.
import { LEVEL_CATEGORIES, isLevel, type Level } from './levels.ts';
// Each of the five categories carries one or more variants. Variant 0 is the
// round's question; the rest are what a reroll draws, in order.

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface ArithmeticQuestion {
  id: string;
  prompt: string;
  answer: number;
  difficulty: Difficulty;
}

export interface ChoiceQuestion {
  id: string;
  prompt: string;
  choices: string[];
  answer: string;
  difficulty: Difficulty;
}

export type Question = ArithmeticQuestion | ChoiceQuestion;

export interface CategoryBlock {
  category: string;
  variants: Question[];
}

export interface Round {
  level: Level;
  number: number;
  questions: CategoryBlock[];
}

/** Puzzle #1 is the first day the game exists. */
export const EPOCH = '2026-11-23';

export function isChoice(q: Question): q is ChoiceQuestion {
  return 'choices' in q;
}

export function puzzleNumber(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${EPOCH}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function validateRound(raw: unknown): Round {
  const fail = (msg: string): never => {
    throw new Error(`Bad round file: ${msg}`);
  };
  if (!raw || typeof raw !== 'object') fail('not an object');
  const r = raw as Round;
  if (!isLevel(r.level)) fail('level');
  const cats = LEVEL_CATEGORIES[r.level];
  if (!Number.isInteger(r.number) || r.number < 1) fail('number');
  if (!Array.isArray(r.questions) || r.questions.length !== cats.length) fail('need five categories');
  const ids = new Set<string>();
  r.questions.forEach((block, i) => {
    if (block.category !== cats[i]) fail(`category ${i} should be ${cats[i]}`);
    if (!Array.isArray(block.variants) || block.variants.length === 0) fail(`${block.category}: no variants`);
    for (const q of block.variants) {
      if (typeof q.id !== 'string' || !q.id) fail(`${block.category}: missing id`);
      if (ids.has(q.id)) fail(`duplicate id ${q.id}`);
      ids.add(q.id);
      if (typeof q.prompt !== 'string' || !q.prompt) fail(`${q.id}: prompt`);
      if (!['easy', 'medium', 'hard'].includes(q.difficulty)) fail(`${q.id}: difficulty`);
      if (block.category === 'arithmetic') {
        if (typeof q.answer !== 'number' || !Number.isInteger(q.answer) || q.answer < 0) fail(`${q.id}: answer`);
      } else {
        const c = q as ChoiceQuestion;
        if (!Array.isArray(c.choices) || c.choices.length !== 4) fail(`${q.id}: need 4 choices`);
        if (new Set(c.choices).size !== 4) fail(`${q.id}: duplicate choices`);
        if (!c.choices.includes(c.answer)) fail(`${q.id}: answer not among choices`);
      }
    }
  });
  return r;
}

export async function loadRound(level: Level, n: number, base = import.meta.env.BASE_URL): Promise<Round | null> {
  const res = await fetch(`${base}rounds/${level}/${n}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load round ${n} (${res.status})`);
  // Vite's dev server answers unknown paths with index.html.
  if (!(res.headers.get('content-type') ?? '').includes('json')) return null;
  const round = validateRound(await res.json());
  if (round.number !== n || round.level !== level) throw new Error(`Round file ${level}/${n} says it is ${round.level} #${round.number}`);
  return round;
}

/** How many rounds a level has, from rounds/<level>/index.json ({"count": N}). */
export async function loadRoundCount(level: Level, base = import.meta.env.BASE_URL): Promise<number> {
  const res = await fetch(`${base}rounds/${level}/index.json`);
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) throw new Error('Could not load the round list.');
  const { count } = (await res.json()) as { count: unknown };
  if (!Number.isInteger(count) || (count as number) < 1) throw new Error('Bad round list.');
  return count as number;
}

/** Deterministic shuffle so everyone sees the same option order for a given question. */
export function seededShuffle<T>(items: readonly T[], seedText: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
