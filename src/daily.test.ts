import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { puzzleNumber, seededShuffle, validateDaily } from './daily.ts';

describe('daily files', () => {
  const dir = new URL('../public/daily/', import.meta.url);
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    it(`${name} is valid and named for its date`, () => {
      const d = validateDaily(JSON.parse(readFileSync(new URL(name, dir), 'utf8')));
      expect(`${d.date}.json`).toBe(name);
    });
  }
});

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
