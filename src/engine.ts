// Get Your Goat — game engine.
// Pure and deterministic: no DOM, no clock. The browser and the Node simulator
// drive it the same way, by stepping time and applying answer events.
//
// Track coordinates: 0 = cave mouth, 1 = goat pen. Positions below 0 mean the
// ogre has been knocked back into his cave and must walk out before he is
// visible again; this keeps every correct answer worth the same amount of time
// no matter where the ogre is (see "banked butts" below).

export interface Params {
  /** Seconds for an unimpeded ogre to cross the whole track. */
  ogreSpeed: number;
  /** Track fraction a correct answer knocks him back. */
  buttDistance: number;
  /** Seconds the butt animation takes. */
  buttDuration: number;
  /** Seconds he pauses at the pen while grabbing a goat. */
  grabPause: number;
  /** Seconds for him to run from the pen back to the cave. */
  returnSpeed: number;
  /** Ogre start position. */
  startOffset: number;
  /** Track fraction he gains when the player rerolls. */
  rerollPenalty: number;
}

export const DEFAULTS: Params = {
  ogreSpeed: 14,
  buttDistance: 0.33,
  buttDuration: 0.6,
  grabPause: 0.8,
  returnSpeed: 2.5,
  startOffset: 0,
  rerollPenalty: 0,
};

/** Deepest the ogre can be knocked into his cave. */
export const MIN_POS = -1;

export type Phase = 'APPROACH' | 'BUTTED' | 'GRAB' | 'RETURN' | 'DONE';

export type Outcome = 'correct' | 'skipped' | 'pen-empty';

export interface QuestionResult {
  category: string;
  startT: number;
  endT: number;
  outcome: Outcome;
  wrongs: number;
  rerolls: number;
  /** Goats stolen while this question was on screen. */
  goatsLost: number;
}

export interface Current {
  startT: number;
  variant: number;
  wrongs: number;
  rerolls: number;
  goatsLost: number;
  /** True after a wrong answer until the player skips or rerolls. */
  awaitingChoice: boolean;
}

export interface GameState {
  t: number;
  phase: Phase;
  pos: number;
  /** Seconds spent in the current phase (used by BUTTED and GRAB). */
  phaseT: number;
  /** Where the current butt started and where it will land. */
  buttFrom: number;
  buttTo: number;
  /** Knockback earned while he was grabbing or running home, applied at the cave. */
  bankedButt: number;
  goats: number;
  categories: readonly string[];
  q: number;
  current: Current | null;
  results: QuestionResult[];
}

export type EventType = 'correct' | 'wrong' | 'skip' | 'reroll';
export interface GameEvent {
  t: number;
  type: EventType;
}

export function initialState(params: Params, categories: readonly string[], goats = 5): GameState {
  return {
    t: 0,
    phase: 'APPROACH',
    pos: params.startOffset,
    phaseT: 0,
    buttFrom: 0,
    buttTo: 0,
    bankedButt: 0,
    goats,
    categories,
    q: 0,
    current: newCurrent(0),
    results: [],
  };
}

function newCurrent(t: number): Current {
  return { startT: t, variant: 0, wrongs: 0, rerolls: 0, goatsLost: 0, awaitingChoice: false };
}

/** Smooth stop: fast shove, gentle landing. */
export function easeOut(x: number): number {
  return 1 - (1 - x) * (1 - x);
}

/** Advance time by dt seconds. Returns a new state. */
export function step(s: GameState, p: Params, dt: number): GameState {
  if (s.phase === 'DONE') return s;
  let n: GameState = { ...s, t: s.t + dt };
  let remaining = dt;
  // Loop so a phase change mid-step spends the leftover time in the next phase.
  for (let guard = 0; remaining > 1e-12 && guard < 8 && n.phase !== 'DONE'; guard++) {
    switch (n.phase) {
      case 'APPROACH': {
        const toPen = (1 - n.pos) * p.ogreSpeed;
        if (remaining < toPen) {
          n = { ...n, pos: n.pos + remaining / p.ogreSpeed };
          remaining = 0;
        } else {
          remaining -= toPen;
          n = grab({ ...n, pos: 1 }, n.t - remaining);
        }
        break;
      }
      case 'BUTTED': {
        const left = p.buttDuration - n.phaseT;
        if (remaining < left) {
          const phaseT = n.phaseT + remaining;
          const pos = n.buttFrom + (n.buttTo - n.buttFrom) * easeOut(phaseT / p.buttDuration);
          n = { ...n, phaseT, pos };
          remaining = 0;
        } else {
          remaining -= left;
          n = { ...n, phase: 'APPROACH', phaseT: 0, pos: n.buttTo };
        }
        break;
      }
      case 'GRAB': {
        const left = p.grabPause - n.phaseT;
        if (remaining < left) {
          n = { ...n, phaseT: n.phaseT + remaining };
          remaining = 0;
        } else {
          remaining -= left;
          n = { ...n, phase: 'RETURN', phaseT: 0 };
        }
        break;
      }
      case 'RETURN': {
        const toCave = n.pos * p.returnSpeed;
        if (remaining < toCave) {
          n = { ...n, pos: n.pos - remaining / p.returnSpeed };
          remaining = 0;
        } else {
          remaining -= toCave;
          const pos = Math.max(MIN_POS, -n.bankedButt);
          n = { ...n, phase: 'APPROACH', phaseT: 0, pos, bankedButt: 0 };
        }
        break;
      }
    }
  }
  return n;
}

function grab(s: GameState, atT: number): GameState {
  const goats = s.goats - 1;
  const current = s.current ? { ...s.current, goatsLost: s.current.goatsLost + 1 } : null;
  const n: GameState = { ...s, phase: 'GRAB', phaseT: 0, goats, current };
  if (goats > 0) return n;
  // Pen is empty: the game ends on the question that was live.
  return finishQuestion({ ...n, t: atT }, 'pen-empty', true);
}

function finishQuestion(s: GameState, outcome: Outcome, endGame = false): GameState {
  if (!s.current) return s;
  const c = s.current;
  const result: QuestionResult = {
    category: s.categories[s.q],
    startT: c.startT,
    endT: s.t,
    outcome,
    wrongs: c.wrongs,
    rerolls: c.rerolls,
    goatsLost: c.goatsLost,
  };
  const results = [...s.results, result];
  const q = s.q + 1;
  if (endGame || q >= s.categories.length) {
    return { ...s, results, q, current: null, phase: 'DONE', phaseT: 0 };
  }
  return { ...s, results, q, current: newCurrent(s.t) };
}

function butt(s: GameState, p: Params): GameState {
  switch (s.phase) {
    case 'APPROACH':
    case 'BUTTED': {
      // A butt mid-butt stacks from wherever he is now.
      const to = Math.max(MIN_POS, s.pos - p.buttDistance);
      return { ...s, phase: 'BUTTED', phaseT: 0, buttFrom: s.pos, buttTo: to };
    }
    case 'GRAB':
    case 'RETURN':
      // He is heading home anyway; the knockback lands when he reaches the cave.
      return { ...s, bankedButt: s.bankedButt + p.buttDistance };
    default:
      return s;
  }
}

/** Apply an answer event at the state's current time. Returns a new state. */
export function applyEvent(s: GameState, p: Params, type: EventType): GameState {
  if (s.phase === 'DONE' || !s.current) return s;
  const c = s.current;
  switch (type) {
    case 'correct':
      if (c.awaitingChoice) return s;
      return finishQuestion(butt(s, p), 'correct');
    case 'wrong':
      if (c.awaitingChoice) return s;
      return { ...s, current: { ...c, wrongs: c.wrongs + 1, awaitingChoice: true } };
    case 'skip': {
      // A skip is a question you didn't answer, so the ogre takes a goat for it.
      // (The game is still live, so there is always a goat to take.)
      const goats = s.goats - 1;
      const n = { ...s, goats, current: { ...c, goatsLost: c.goatsLost + 1 } };
      return finishQuestion(n, 'skipped', goats === 0);
    }
    case 'reroll': {
      const n = { ...s, current: { ...c, variant: c.variant + 1, rerolls: c.rerolls + 1, awaitingChoice: false } };
      if (p.rerollPenalty > 0 && n.phase === 'APPROACH') n.pos = Math.min(1, n.pos + p.rerollPenalty);
      return n;
    }
  }
}

export const DT = 1 / 120;

/** Advance from s to time `until` in fixed steps (the last step may be shorter). */
export function advanceTo(s: GameState, p: Params, until: number): GameState {
  let n = s;
  while (n.phase !== 'DONE' && until - n.t > 1e-9) {
    n = step(n, p, Math.min(DT, until - n.t));
  }
  return n;
}

/** Replay a whole game: the state at time t given sorted answer events. */
export function simulate(
  p: Params,
  categories: readonly string[],
  events: readonly GameEvent[],
  t: number,
): GameState {
  let s = initialState(p, categories);
  for (const ev of events) {
    if (ev.t > t) break;
    s = advanceTo(s, p, ev.t);
    if (s.phase === 'DONE') return s;
    s = applyEvent(s, p, ev.type);
  }
  return advanceTo(s, p, t);
}

/**
 * Share-grid emoji per question: ⏭️ if skipped (which always costs a goat),
 * 🧌 if the ogre grabbed a goat while it was on screen, 🐐 if answered with no
 * loss, ⬜ if never reached.
 */
export function shareGrid(s: GameState): string {
  return s.categories
    .map((_, i) => {
      const r = s.results[i];
      if (!r) return '⬜';
      if (r.outcome === 'skipped') return '⏭️';
      return r.goatsLost > 0 ? '🧌' : '🐐';
    })
    .join('');
}

export function formatTime(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
