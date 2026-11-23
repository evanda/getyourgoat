// Build public/rounds/2.json … from the question bank.
//   node scripts/assemble.ts
// Trivia comes from content/drafts/<category>.json. Every question must have a
// blind check in content/checks/<category>.json; a question where the checker
// picked a different answer, or noted a problem, must be decided in
// content/review.json ("keep" or "drop", with a reason) or assembly fails.
// Arithmetic comes from content/arithmetic.json (computed answers).
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

type Difficulty = 'easy' | 'medium' | 'hard';
interface Draft {
  id: string;
  prompt: string;
  choices?: string[];
  answer: string | number;
  difficulty: Difficulty;
}
interface Check {
  id: string;
  pick: string;
  confidence: string;
  problem: string | null;
}
interface Review {
  [id: string]: { decision: 'keep' | 'drop'; reason: string };
}

const ROOT = new URL('../', import.meta.url);
const read = <T>(p: string): T => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8')) as T;
const MAX_ROUNDS = 100;
const FIRST = 2; // #1 is the hand-made launch round
const PER_CATEGORY = 3;

const TRIVIA = [
  ['history', 'history'],
  ['literature', 'literature'],
  ['earth science', 'earth-science'],
  ['philosophy', 'philosophy'],
] as const;

const review: Review = existsSync(new URL('content/review.json', ROOT)) ? read<Review>('content/review.json') : {};
const errors: string[] = [];
const dropped: string[] = [];

function approved(slug: string): Draft[] {
  const drafts = read<Draft[]>(`content/drafts/${slug}.json`);
  const checks = new Map(read<Check[]>(`content/checks/${slug}.json`).map((c) => [c.id, c]));
  const out: Draft[] = [];
  for (const q of drafts) {
    const r = review[q.id];
    if (r?.decision === 'drop') {
      dropped.push(q.id);
      continue;
    }
    const c = checks.get(q.id);
    if (!c) {
      errors.push(`${q.id}: no blind check`);
      continue;
    }
    const disputed = c.pick !== q.answer || c.problem;
    if (disputed && r?.decision !== 'keep') {
      errors.push(`${q.id}: checker picked "${c.pick}" vs key "${q.answer}"${c.problem ? `; problem: ${c.problem}` : ''} (not reviewed)`);
      continue;
    }
    out.push(q);
  }
  return out;
}

let seed = 101;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Group into triples in shuffled order, so main questions follow the bank's own difficulty mix. */
function triples(input: Draft[]): Draft[][] {
  const qs = [...input];
  const out: Draft[][] = [];
  for (let i = 0; i + PER_CATEGORY <= qs.length; i += PER_CATEGORY) {
    // A reroll must not have the same answer as a question already in its triple.
    for (let k = i + 1; k < i + PER_CATEGORY; k++) {
      const taken = () => new Set(qs.slice(i, k).map((q) => String(q.answer).toLowerCase()));
      for (let j = k; taken().has(String(qs[k].answer).toLowerCase()) && j < qs.length; j++) {
        if (!taken().has(String(qs[j].answer).toLowerCase())) [qs[k], qs[j]] = [qs[j], qs[k]];
      }
    }
    out.push(qs.slice(i, i + PER_CATEGORY));
  }
  return out;
}

const pools: [string, Draft[][]][] = [['arithmetic', triples(shuffle(read<Draft[]>('content/arithmetic.json')))]];
for (const [category, slug] of TRIVIA) pools.push([category, triples(shuffle(approved(slug)))]);

if (errors.length) {
  console.error(`${errors.length} question(s) need a decision in content/review.json:\n` + errors.join('\n'));
  process.exit(1);
}

const rounds = Math.min(MAX_ROUNDS, ...pools.map(([, t]) => t.length));
const dir = new URL('public/rounds/', ROOT);
for (const f of readdirSync(dir)) {
  const n = Number(f.replace('.json', ''));
  if (Number.isInteger(n) && n >= FIRST) rmSync(new URL(f, dir));
}
for (let i = 0; i < rounds; i++) {
  const number = FIRST + i;
  const questions = pools.map(([category, t]) => ({
    category,
    variants: t[i].map(({ id, prompt, choices, answer, difficulty }) =>
      choices ? { id, prompt, choices, answer, difficulty } : { id, prompt, answer, difficulty },
    ),
  }));
  writeFileSync(new URL(`${number}.json`, dir), JSON.stringify({ number, questions }, null, 1) + '\n');
}
writeFileSync(new URL('index.json', dir), JSON.stringify({ count: FIRST - 1 + rounds }) + '\n');
console.log(
  `Wrote rounds #${FIRST}–#${FIRST + rounds - 1} (${rounds}). Dropped ${dropped.length}. ` +
    pools.map(([c, t]) => `${c}: ${t.length * PER_CATEGORY} usable`).join(', '),
);
