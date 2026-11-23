// Daily puzzle file: public/daily/YYYY-MM-DD.json.
// Each of the five categories carries one or more variants. Variant 0 is the
// day's question; the rest are what a reroll draws, in order.

export interface ArithmeticQuestion {
  prompt: string;
  answer: number;
  difficulty: Difficulty;
}

export interface ChoiceQuestion {
  prompt: string;
  choices: string[];
  answer: string;
  difficulty: Difficulty;
}

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Question = ArithmeticQuestion | ChoiceQuestion;

export interface CategoryBlock {
  category: string;
  variants: Question[];
}

export interface Daily {
  date: string;
  questions: CategoryBlock[];
}

export const CATEGORIES = ['arithmetic', 'history', 'literature', 'earth science', 'philosophy'] as const;

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

export function validateDaily(raw: unknown): Daily {
  const fail = (msg: string): never => {
    throw new Error(`Bad daily file: ${msg}`);
  };
  if (!raw || typeof raw !== 'object') fail('not an object');
  const d = raw as Daily;
  if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) fail('date');
  if (!Array.isArray(d.questions) || d.questions.length !== CATEGORIES.length) fail('need five categories');
  d.questions.forEach((block, i) => {
    if (block.category !== CATEGORIES[i]) fail(`category ${i} should be ${CATEGORIES[i]}`);
    if (!Array.isArray(block.variants) || block.variants.length === 0) fail(`${block.category}: no variants`);
    for (const q of block.variants) {
      if (typeof q.prompt !== 'string' || !q.prompt) fail(`${block.category}: prompt`);
      if (block.category === 'arithmetic') {
        if (typeof q.answer !== 'number' || !Number.isInteger(q.answer) || q.answer < 0) fail('arithmetic answer');
      } else {
        const c = q as ChoiceQuestion;
        if (!Array.isArray(c.choices) || c.choices.length !== 4) fail(`${block.category}: need 4 choices`);
        if (new Set(c.choices).size !== 4) fail(`${block.category}: duplicate choices`);
        if (!c.choices.includes(c.answer)) fail(`${block.category}: answer not among choices`);
      }
    }
  });
  return d;
}

export async function loadDaily(date: string, base = import.meta.env.BASE_URL): Promise<Daily | null> {
  const res = await fetch(`${base}daily/${date}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load puzzle (${res.status})`);
  // Vite's dev server answers unknown paths with index.html.
  if (!(res.headers.get('content-type') ?? '').includes('json')) return null;
  return validateDaily(await res.json());
}

/** Deterministic shuffle so everyone sees the same option order for a given day. */
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
