// Build public/rounds/<level>/<n>.json from the question bank.
//   node scripts/assemble.ts [easy] [normal] [hard]     (default: every level with drafts)
// Trivia comes from content/drafts/<level>/<category>.json. Every question must
// have a blind check in content/checks/<level>/<category>.json; a question where
// the checker picked a different answer, or noted a problem, must be decided in
// content/review.json ("keep" or "drop", with a reason) or assembly fails.
// Arithmetic comes from content/arithmetic-<level>.json (computed answers).
// Normal round #1 is the hand-made launch round and is never overwritten.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

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
const LAST_ROUND = 101;
const PER_CATEGORY = 3;

type Level = 'easy' | 'normal' | 'hard';
const LEVELS: Record<Level, { first: number; seed: number; trivia: [string, string][] }> = {
  easy: {
    first: 1,
    seed: 11,
    trivia: [['history', 'history'], ['literature', 'literature'], ['earth science', 'earth-science'], ['animals', 'animals']],
  },
  normal: {
    first: 2, // #1 is the hand-made launch round
    seed: 101,
    trivia: [['history', 'history'], ['literature', 'literature'], ['earth science', 'earth-science'], ['philosophy', 'philosophy']],
  },
  hard: {
    first: 1,
    seed: 303,
    trivia: [['history', 'history'], ['literature', 'literature'], ['earth science', 'earth-science'], ['philosophy', 'philosophy']],
  },
};

const review: Review = existsSync(new URL('content/review.json', ROOT)) ? read<Review>('content/review.json') : {};
const errors: string[] = [];
const dropped: string[] = [];

function approved(level: Level, slug: string): Draft[] {
  const drafts = read<Draft[]>(`content/drafts/${level}/${slug}.json`);
  const checks = new Map(read<Check[]>(`content/checks/${level}/${slug}.json`).map((c) => [c.id, c]));
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

let seed = 0;
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

const asked = process.argv.slice(2) as Level[];
const levels = (asked.length ? asked : (Object.keys(LEVELS) as Level[])).filter((l) => {
  const ready = LEVELS[l].trivia.every(([, slug]) => existsSync(new URL(`content/checks/${l}/${slug}.json`, ROOT)));
  if (!ready) console.log(`${l}: skipped (drafts or checks missing)`);
  return ready;
});

for (const level of levels) {
  const cfg = LEVELS[level];
  seed = cfg.seed;
  errors.length = 0;
  dropped.length = 0;
  const pools: [string, Draft[][]][] = [['arithmetic', triples(shuffle(read<Draft[]>(`content/arithmetic-${level}.json`)))]];
  for (const [category, slug] of cfg.trivia) pools.push([category, triples(shuffle(approved(level, slug)))]);

  if (errors.length) {
    console.error(`${level}: ${errors.length} question(s) need a decision in content/review.json:\n` + errors.join('\n'));
    process.exitCode = 1;
    continue;
  }

  const rounds = Math.min(LAST_ROUND - cfg.first + 1, ...pools.map(([, t]) => t.length));
  const dir = new URL(`public/rounds/${level}/`, ROOT);
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) {
    const n = Number(f.replace('.json', ''));
    if (Number.isInteger(n) && n >= cfg.first) rmSync(new URL(f, dir));
  }
  for (let i = 0; i < rounds; i++) {
    const number = cfg.first + i;
    const questions = pools.map(([category, t]) => ({
      category,
      variants: t[i].map(({ id, prompt, choices, answer, difficulty }) =>
        choices ? { id, prompt, choices, answer, difficulty } : { id, prompt, answer, difficulty },
      ),
    }));
    writeFileSync(new URL(`${number}.json`, dir), JSON.stringify({ level, number, questions }, null, 1) + '\n');
  }
  writeFileSync(new URL('index.json', dir), JSON.stringify({ count: cfg.first - 1 + rounds }) + '\n');
  console.log(
    `${level}: wrote rounds #${cfg.first}–#${cfg.first + rounds - 1}. Dropped ${dropped.length}. ` +
      pools.map(([c, t]) => `${c}: ${t.length * PER_CATEGORY}`).join(', '),
  );
}
