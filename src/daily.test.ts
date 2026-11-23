import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { puzzleNumber, seededShuffle, validateRound } from './daily.ts';
import { LEVELS } from './levels.ts';

const allIds = new Map<string, string>();
for (const level of LEVELS) {
  const dir = new URL(`../public/rounds/${level}/`, import.meta.url);
  if (!existsSync(dir)) continue;
  describe(`${level} round files`, () => {
    const names = readdirSync(dir).filter((f) => /^\d+\.json$/.test(f));

    it('are numbered 1..N with no gaps', () => {
      const nums = names.map((n) => Number(n.replace('.json', ''))).sort((a, b) => a - b);
      expect(nums.length).toBeGreaterThan(0);
      expect(nums).toEqual(nums.map((_, i) => i + 1));
    });

    it('index.json counts them', () => {
      expect(JSON.parse(readFileSync(new URL('index.json', dir), 'utf8'))).toEqual({ count: names.length });
    });

    for (const name of names) {
      it(`${name} is valid and named for its level and number`, () => {
        const r = validateRound(JSON.parse(readFileSync(new URL(name, dir), 'utf8')));
        expect(`${r.level}/${r.number}.json`).toBe(`${level}/${name}`);
        // Multi-step arithmetic must be parenthesized: nobody should need order of operations.
        for (const q of r.questions[0].variants) {
          if ((q.prompt.match(/[×÷+−]/g) ?? []).length > 1) expect(q.prompt, q.id).toMatch(/\(/);
        }
        for (const b of r.questions) {
          for (const q of b.variants) {
            expect(allIds.has(q.id), `${q.id} also in ${allIds.get(q.id)}`).toBe(false);
            allIds.set(q.id, `${level}/${name}`);
          }
        }
      });
    }
  });
}

describe('puzzleNumber', () => {
  it('counts from the epoch', () => {
    expect(puzzleNumber('2026-11-23')).toBe(1);
    expect(puzzleNumber('2027-01-03')).toBe(42);
  });
});

describe('seededShuffle', () => {
  it('is stable for a seed and keeps every item', () => {
    const a = seededShuffle(['a', 'b', 'c', 'd'], 'x');
    expect(seededShuffle(['a', 'b', 'c', 'd'], 'x')).toEqual(a);
    expect([...a].sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});
