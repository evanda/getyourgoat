// Generate arithmetic questions for the alpha bank. Deterministic (seeded) so
// re-running gives the same file. Answers are computed, never hand-written.
//   node scripts/gen-arithmetic.ts [count] > content/arithmetic.json
type Difficulty = 'easy' | 'medium' | 'hard';
interface Arith {
  id: string;
  prompt: string;
  answer: number;
  difficulty: Difficulty;
}

let seed = 20261123;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const MINUS = '−';

const makers: Record<Difficulty, (() => [string, number])[]> = {
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
    () => { const b = int(4, 12), q = int(6, 15), c = int(3, 25); return [`${b * q} ÷ ${b} + ${c}`, q + c]; },
    () => { const a = int(6, 12), b = int(6, 12), c = int(5, 30); return [`${a} × ${b} ${MINUS} ${c}`, a * b - c]; },
  ],
  hard: [
    () => { const a = int(12, 29), b = int(12, 19); return [`${a} × ${b}`, a * b]; },
    () => { const a = int(6, 12), b = int(6, 12), c = int(3, 9), d = int(3, 9); return [`${a} × ${b} + ${c} × ${d}`, a * b + c * d]; },
    () => { const b = int(6, 15), q = int(12, 25); return [`${b * q} ÷ ${b}`, q]; },
    () => { const a = int(301, 900), b = int(108, 299); return [`${a} ${MINUS} ${b}`, a - b]; },
  ],
};

const count = Number(process.argv[2] ?? 300);
const out: Arith[] = [];
const seen = new Set<string>(['17 × 6', '48 + 79', '144 ÷ 12 + 9']); // round #1
while (out.length < count) {
  const r = rand();
  const difficulty: Difficulty = r < 0.35 ? 'easy' : r < 0.85 ? 'medium' : 'hard';
  const [prompt, answer] = pick(makers[difficulty])();
  if (seen.has(prompt) || answer < 0 || !Number.isInteger(answer)) continue;
  seen.add(prompt);
  out.push({ id: `arith-${String(out.length + 1).padStart(3, '0')}`, prompt, answer, difficulty });
}
console.log(JSON.stringify(out, null, 1));
