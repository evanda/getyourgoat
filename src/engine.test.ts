import { describe, expect, it } from 'vitest';
import {
  DEFAULTS,
  MIN_POS,
  advanceTo,
  applyEvent,
  formatTime,
  initialState,
  shareGrid,
  simulate,
  type GameEvent,
  type Params,
} from './engine.ts';

const CATS = ['arithmetic', 'history', 'literature', 'earth science', 'philosophy'];
const P: Params = { ...DEFAULTS };

describe('approach', () => {
  it('crosses the track in ogreSpeed seconds', () => {
    const s = advanceTo(initialState(P, CATS), P, 7);
    expect(s.phase).toBe('APPROACH');
    expect(s.pos).toBeCloseTo(0.5, 6);
  });

  it('respects startOffset', () => {
    const p = { ...P, startOffset: 0.4 };
    const s = advanceTo(initialState(p, CATS), p, 7);
    expect(s.pos).toBeCloseTo(0.9, 6);
  });
});

describe('grab and return', () => {
  it('grabs a goat on reaching the pen, pauses, runs home, then approaches again', () => {
    let s = advanceTo(initialState(P, CATS), P, 14.01);
    expect(s.phase).toBe('GRAB');
    expect(s.goats).toBe(4);
    expect(s.current?.goatsLost).toBe(1);

    s = advanceTo(s, P, 14 + 0.8 + 0.01);
    expect(s.phase).toBe('RETURN');

    s = advanceTo(s, P, 14 + 0.8 + 1.25);
    expect(s.pos).toBeCloseTo(0.5, 3);

    s = advanceTo(s, P, 14 + 0.8 + 2.5 + 0.01);
    expect(s.phase).toBe('APPROACH');
    expect(s.pos).toBeLessThan(0.01);
  });

  it('keeps the same question live while he steals a goat', () => {
    const s = advanceTo(initialState(P, CATS), P, 20);
    expect(s.q).toBe(0);
    expect(s.current?.variant).toBe(0);
  });

  it('can steal twice during one slow question', () => {
    const cycle = 14 + 0.8 + 2.5;
    const s = advanceTo(initialState(P, CATS), P, cycle + 14.01);
    expect(s.goats).toBe(3);
    expect(s.current?.goatsLost).toBe(2);
  });
});

describe('butt', () => {
  it('knocks him back buttDistance over buttDuration, then he approaches', () => {
    let s = advanceTo(initialState(P, CATS), P, 7); // pos 0.5
    s = applyEvent(s, P, 'correct');
    expect(s.phase).toBe('BUTTED');
    expect(s.q).toBe(1);
    s = advanceTo(s, P, 7 + 0.6 + 0.001);
    expect(s.phase).toBe('APPROACH');
    expect(s.pos).toBeCloseTo(0.17, 3);
  });

  it('can knock him into the cave (negative position), floored at MIN_POS', () => {
    let s = advanceTo(initialState(P, CATS), P, 1.4); // pos 0.1
    s = applyEvent(s, P, 'correct');
    s = advanceTo(s, P, 2.1);
    // Lands at 0.1 − 0.33 = −0.23 at t = 2.0, then walks 0.1 s.
    expect(s.pos).toBeCloseTo(-0.23 + 0.1 / 14, 4);

    const big = { ...P, buttDistance: 0.6 };
    let t = initialState(big, ['a', 'b', 'c', 'd', 'e']);
    for (let i = 0; i < 4; i++) {
      t = applyEvent(t, big, 'correct');
      t = advanceTo(t, big, t.t + 0.7);
    }
    expect(t.pos).toBeGreaterThanOrEqual(MIN_POS);
    expect(t.pos).toBeLessThan(-0.9);
  });

  it('banks a butt landed while he runs home and applies it at the cave', () => {
    let s = advanceTo(initialState(P, CATS), P, 14 + 0.8 + 0.5); // RETURN
    expect(s.phase).toBe('RETURN');
    s = applyEvent(s, P, 'correct');
    expect(s.phase).toBe('RETURN');
    expect(s.bankedButt).toBeCloseTo(0.33);
    s = advanceTo(s, P, 14 + 0.8 + 2.5 + 0.001);
    expect(s.phase).toBe('APPROACH');
    expect(s.pos).toBeCloseTo(-0.33, 2);
    expect(s.bankedButt).toBe(0);
  });

  it('banks a butt landed during the grab pause; the goat is still lost', () => {
    let s = advanceTo(initialState(P, CATS), P, 14.2);
    s = applyEvent(s, P, 'correct');
    expect(s.goats).toBe(4);
    expect(s.results[0].goatsLost).toBe(1);
    expect(s.bankedButt).toBeCloseTo(0.33);
  });
});

describe('wrong, skip, reroll', () => {
  it('a wrong answer does not move him and waits for skip or reroll', () => {
    let s = advanceTo(initialState(P, CATS), P, 3);
    const pos = s.pos;
    s = applyEvent(s, P, 'wrong');
    expect(s.pos).toBe(pos);
    expect(s.current?.awaitingChoice).toBe(true);
    // A correct answer cannot be entered until the player chooses.
    expect(applyEvent(s, P, 'correct')).toBe(s);
  });

  it('skip resolves the question as skipped', () => {
    let s = applyEvent(initialState(P, CATS), P, 'wrong');
    s = applyEvent(s, P, 'skip');
    expect(s.q).toBe(1);
    expect(s.results[0].outcome).toBe('skipped');
  });

  it('skipping the last question costs a goat', () => {
    let s = initialState(P, CATS);
    for (let i = 0; i < 4; i++) s = applyEvent(s, P, 'correct');
    s = applyEvent(applyEvent(s, P, 'wrong'), P, 'skip');
    expect(s.phase).toBe('DONE');
    expect(s.goats).toBe(4);
    expect(s.results[4]).toMatchObject({ outcome: 'skipped', goatsLost: 1 });
    expect(shareGrid(s)).toBe('🐐🐐🐐🐐🧌');
  });

  it('skipping an earlier question costs only time', () => {
    const s = applyEvent(applyEvent(initialState(P, CATS), P, 'wrong'), P, 'skip');
    expect(s.goats).toBe(5);
  });

  it('reroll keeps the category and moves to the next variant', () => {
    let s = applyEvent(initialState(P, CATS), P, 'wrong');
    s = applyEvent(s, P, 'reroll');
    expect(s.q).toBe(0);
    expect(s.current?.variant).toBe(1);
    expect(s.current?.awaitingChoice).toBe(false);
    s = applyEvent(s, P, 'correct');
    expect(s.results[0]).toMatchObject({ outcome: 'correct', wrongs: 1, rerolls: 1 });
  });

  it('rerollPenalty moves him forward on reroll', () => {
    const p = { ...P, rerollPenalty: 0.1 };
    let s = advanceTo(initialState(p, CATS), p, 7);
    s = applyEvent(applyEvent(s, p, 'wrong'), p, 'reroll');
    expect(s.pos).toBeCloseTo(0.6, 6);
  });
});

describe('game end', () => {
  it('ends after the fifth question resolves', () => {
    const events: GameEvent[] = CATS.map((_, i) => ({ t: (i + 1) * 2, type: 'correct' }));
    const s = simulate(P, CATS, events, 30);
    expect(s.phase).toBe('DONE');
    expect(s.t).toBeCloseTo(10, 6);
    expect(s.goats).toBe(5);
    expect(shareGrid(s)).toBe('🐐🐐🐐🐐🐐');
  });

  it('ends when the pen is empty, leaving later questions unreached', () => {
    const s = simulate(P, CATS, [], 500);
    expect(s.phase).toBe('DONE');
    expect(s.goats).toBe(0);
    expect(s.results).toHaveLength(1);
    expect(s.results[0]).toMatchObject({ outcome: 'pen-empty', goatsLost: 5 });
    expect(shareGrid(s)).toBe('🧌⬜⬜⬜⬜');
  });

  it('grid marks the questions that cost a goat', () => {
    const events: GameEvent[] = [
      { t: 2, type: 'correct' },
      { t: 30, type: 'correct' }, // slow: he reaches the pen during question 2
      { t: 32, type: 'correct' },
      { t: 34, type: 'correct' },
      { t: 36, type: 'correct' },
    ];
    const s = simulate(P, CATS, events, 60);
    expect(shareGrid(s)).toBe('🐐🧌🐐🐐🐐');
    expect(s.goats).toBe(4);
  });

  it('is deterministic', () => {
    const events: GameEvent[] = [
      { t: 3.3, type: 'correct' },
      { t: 9, type: 'wrong' },
      { t: 10, type: 'reroll' },
      { t: 19.7, type: 'correct' },
      { t: 25, type: 'wrong' },
      { t: 26, type: 'skip' },
    ];
    expect(simulate(P, CATS, events, 40)).toEqual(simulate(P, CATS, events, 40));
  });
});

describe('formatTime', () => {
  it('formats m:ss', () => {
    expect(formatTime(72.4)).toBe('1:12');
    expect(formatTime(9)).toBe('0:09');
  });
});
