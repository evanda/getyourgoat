// Generate arithmetic questions for the alpha bank. Deterministic (seeded) so
// re-running gives the same file. Answers are computed, never hand-written.
//   node scripts/gen-arithmetic.ts <easy|normal|hard> [count] > content/arithmetic-<level>.json
// Within a level, "difficulty" is relative to that level. Any prompt with more than one
// operation is fully parenthesized, so nobody has to rely on order of operations.
type Difficulty = 'easy' | 'medium' | 'hard';
interface Arith {
  id: string;
  prompt: string;
  answer: number;
  difficulty: Difficulty;
}

const level = process.argv[2] ?? 'normal';
if (!['easy', 'normal', 'hard'].includes(level)) throw new Error('level must be easy, normal or hard');
let seed = { easy: 7_11, normal: 20261123, hard: 99_99 }[level as 'easy' | 'normal' | 'hard'];
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const MINUS = '−';

const normalMakers: Record<Difficulty, (() => [string, number])[]> = {
  easy: [
    () => { const a = int(12, 89), b = int(11, 89); return [`${a} + ${b}`, a + b]; },
    () => { const a = int(40, 99), b = int(11, a - 5); return [`${a} ${MINUS} ${b}`, a - b]; },
    () => { const a = int(6, 9), b = int(6, 12); return [`${a} × ${b}`, a * b]; },
    () => { const b = int(3, 9), q = int(4, 12); return [`${b * q} ÷ ${b}`, q]; },
  ],
  medium: [
    () => { const a = int(13, 39), b = int(3, 9); return [`${a} × ${b}`, a * b]; },
    () => { const a = int(120, 480), b = int(25, 99); return [`${a} + ${b}`, a + b]; },
    () => { const a = int(150, 500), b = int(26, 99); return [`${a} ${MINUS} ${b}`, a - b]; },
    () => { const b = int(4, 12), q = int(6, 15), c = int(3, 25); return [`(${b * q} ÷ ${b}) + ${c}`, q + c]; },
    () => { const a = int(6, 12), b = int(6, 12), c = int(5, 30); return [`(${a} × ${b}) ${MINUS} ${c}`, a * b - c]; },
  ],
  hard: [
    () => { const a = int(12, 29), b = int(12, 19); return [`${a} × ${b}`, a * b]; },
    () => { const a = int(6, 12), b = int(6, 12), c = int(3, 9), d = int(3, 9); return [`(${a} × ${b}) + (${c} × ${d})`, a * b + c * d]; },
    () => { const b = int(6, 15), q = int(12, 25); return [`${b * q} ÷ ${b}`, q]; },
    () => { const a = int(301, 900), b = int(108, 299); return [`${a} ${MINUS} ${b}`, a - b]; },
  ],
};

// Kids: small sums, take-aways and times tables.
const easyMakers: Record<Difficulty, (() => [string, number])[]> = {
  easy: [
    () => { const a = int(1, 9), b = int(1, 9); return [`${a} + ${b}`, a + b]; },
    () => { const a = int(5, 12), b = int(1, a); return [`${a} ${MINUS} ${b}`, a - b]; },
    () => { const a = int(2, 5), b = int(1, 5); return [`${a} × ${b}`, a * b]; },
  ],
  medium: [
    () => { const a = int(10, 40), b = int(2, 9); return [`${a} + ${b}`, a + b]; },
    () => { const a = int(12, 30), b = int(2, 9); return [`${a} ${MINUS} ${b}`, a - b]; },
    () => { const a = int(2, 10), b = int(2, 10); return [`${a} × ${b}`, a * b]; },
    () => { const a = int(5, 50); return [`${a} + ${a}`, a + a]; },
  ],
  hard: [
    () => { const a = int(15, 60), b = int(11, 39); return [`${a} + ${b}`, a + b]; },
    () => { const b = int(2, 10), q = int(2, 10); return [`${b * q} ÷ ${b}`, q]; },
    () => { const a = int(3, 12), b = int(3, 12); return [`${a} × ${b}`, a * b]; },
  ],
};

// Brainiacs: bigger products, mixed operations, squares, percentages.
const hardMakers: Record<Difficulty, (() => [string, number])[]> = {
  easy: [
    () => { const a = int(13, 29), b = int(12, 19); return [`${a} × ${b}`, a * b]; },
    () => { const a = int(301, 900), b = int(108, 299); return [`${a} ${MINUS} ${b}`, a - b]; },
    () => { const p = pick([10, 20, 25, 50]), base = int(2, 40) * 20; return [`${p}% of ${base}`, (p * base) / 100]; },
  ],
  medium: [
    () => { const a = int(13, 25); return [`${a}²`, a * a]; },
    () => { const a = int(23, 49), b = int(13, 29); return [`${a} × ${b}`, a * b]; },
    () => { const b = int(6, 19), q = int(13, 49); return [`${b * q} ÷ ${b}`, q]; },
    () => { const a = int(7, 15), b = int(7, 15), c = int(6, 12), d = int(6, 12); return [`(${a} × ${b}) ${MINUS} (${c} × ${d})`, a * b - c * d]; },
  ],
  hard: [
    () => { const a = int(26, 59); return [`${a}²`, a * a]; },
    () => { const a = int(41, 99), b = int(21, 49); return [`${a} × ${b}`, a * b]; },
    () => { const p = pick([15, 35, 45, 75]), base = int(2, 30) * 20; return [`${p}% of ${base}`, (p * base) / 100]; },
    () => { const a = int(110, 999), b = int(3, 9); return [`${a} × ${b}`, a * b]; },
  ],
};

const makers = { easy: easyMakers, normal: normalMakers, hard: hardMakers }[level as 'easy' | 'normal' | 'hard'];
const prefix = level === 'normal' ? 'arith' : `${level}-arith`;
const count = Number(process.argv[3] ?? 300);
const out: Arith[] = [];
const seen = new Set<string>(['17 × 6', '48 + 79', '(144 ÷ 12) + 9']); // round #1
while (out.length < count) {
  const r = rand();
  const difficulty: Difficulty = r < 0.35 ? 'easy' : r < 0.85 ? 'medium' : 'hard';
  const [prompt, answer] = pick(makers[difficulty])();
  if (seen.has(prompt) || answer < 0 || !Number.isInteger(answer)) continue;
  seen.add(prompt);
  out.push({ id: `${prefix}-${String(out.length + 1).padStart(3, '0')}`, prompt, answer, difficulty });
}
console.log(JSON.stringify(out, null, 1));
