// Get Your Goat — game engine.
// Pure and deterministic: no DOM, no clock. The browser and the Node simulator
// drive it the same way, by stepping time and applying answer events.
//
// Track coordinates: 0 = cave mouth, 1 = the far end, where the last goat stands.
// The goats wait in a line ending at 1, `goatGap` apart; the ogre walks to the
// first goat in line, so each capture leaves him a little further to go.
// Positions below 0 mean the
// ogre has been knocked back into his cave and must walk out before he is
// visible again; this keeps every correct answer worth the same amount of time
// no matter where the ogre is (see "banked butts" below).

export interface Params {
  /** Seconds for an unimpeded ogre to cross the whole track. */
  ogreSpeed: number;
  /** Track fraction a correct answer knocks him back. */
  buttDistance: number;
  /** Seconds the knockback takes; short, so he's bumped back and keeps walking. */
  buttDuration: number;
  /** Seconds he pauses at the pen while grabbing a goat. */
  grabPause: number;
  /** Seconds for him to run from the pen back to the cave. */
  returnSpeed: number;
  /** Ogre start position. */
  startOffset: number;
  /** Track fraction he gains when the player rerolls. */
  rerollPenalty: number;
  /** Track fraction he gains when the player skips a question. */
  skipPenalty: number;
  /** Track fraction between goats standing in line. */
  goatGap: number;
}

export const DEFAULTS: Params = {
  ogreSpeed: 14,
  buttDistance: 0.33,
  buttDuration: 0.15,
  grabPause: 0.8,
  returnSpeed: 2.5,
  startOffset: 0,
  rerollPenalty: 0,
  skipPenalty: 0.33,
  goatGap: 0.05,
};

/** Where the first goat in line stands: the ogre's target. */
export function firstGoatPos(goats: number, p: Params): number {
  return 1 - Math.max(0, goats - 1) * p.goatGap;
}

/** Where each remaining goat stands, first in line first. */
export function goatPositions(goats: number, p: Params): number[] {
  return Array.from({ length: Math.max(0, goats) }, (_, i) => firstGoatPos(goats, p) + i * p.goatGap);
}

/** Deepest the ogre can be knocked into his cave. */
export const MIN_POS = -1;

export type Phase = 'APPROACH' | 'BUTTED' | 'GRAB' | 'RETURN' | 'DONE';

export type Outcome = 'correct' | 'skipped' | 'pen-empty';

/** Everything that happened while a question was up, in order (t = game seconds). */
export type LogType = 'wrong' | 'reroll' | 'skip' | 'correct' | 'grab';
export interface LogEntry {
  type: LogType;
  t: number;
}

export interface QuestionResult {
  category: string;
  startT: number;
  endT: number;
  outcome: Outcome;
  wrongs: number;
  rerolls: number;
  /** Goats stolen while this question was on screen. */
  goatsLost: number;
  log: LogEntry[];
}

export interface Current {
  startT: number;
  variant: number;
  wrongs: number;
  rerolls: number;
  goatsLost: number;
  /** True after a wrong answer until the player skips or rerolls. */
  awaitingChoice: boolean;
  log: LogEntry[];
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
  return { startT: t, variant: 0, wrongs: 0, rerolls: 0, goatsLost: 0, awaitingChoice: false, log: [] };
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
        const target = firstGoatPos(n.goats, p);
        const toGoat = Math.max(0, (target - n.pos) * p.ogreSpeed);
        if (remaining < toGoat) {
          n = { ...n, pos: n.pos + remaining / p.ogreSpeed };
          remaining = 0;
        } else {
          remaining -= toGoat;
          n = grab({ ...n, pos: target }, n.t - remaining);
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
  const current = s.current
    ? { ...s.current, goatsLost: s.current.goatsLost + 1, log: [...s.current.log, { type: 'grab' as const, t: atT }] }
    : null;
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
    log: c.log,
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

/** Push the ogre toward the pen (a skip's cost). */
function advance(s: GameState, by: number): GameState {
  switch (s.phase) {
    case 'APPROACH':
      return { ...s, pos: Math.min(1, s.pos + by) };
    case 'BUTTED':
      return { ...s, buttFrom: Math.min(1, s.buttFrom + by), buttTo: Math.min(1, s.buttTo + by), pos: Math.min(1, s.pos + by) };
    case 'GRAB':
    case 'RETURN':
      // Heading home: he'll start his next approach that much further out.
      return { ...s, bankedButt: s.bankedButt - by };
    default:
      return s;
  }
}

/** True when the live question is the last one (it can't be skipped). */
export function onLastQuestion(s: GameState): boolean {
  return s.q === s.categories.length - 1;
}

/** Apply an answer event at the state's current time. Returns a new state. */
export function applyEvent(s: GameState, p: Params, type: EventType): GameState {
  if (s.phase === 'DONE' || !s.current) return s;
  const c = s.current;
  const log = (t: LogType) => [...c.log, { type: t, t: s.t }];
  switch (type) {
    case 'correct':
      if (c.awaitingChoice) return s;
      return finishQuestion({ ...butt(s, p), current: { ...c, log: log('correct') } }, 'correct');
    case 'wrong':
      if (c.awaitingChoice) return s;
      return { ...s, current: { ...c, wrongs: c.wrongs + 1, awaitingChoice: true, log: log('wrong') } };
    case 'skip': {
      // Skipping costs time, not a goat: the ogre lurches closer. The last
      // question can't be skipped; keep trying until you answer or he empties the pen.
      if (onLastQuestion(s)) return s;
      return finishQuestion({ ...advance(s, p.skipPenalty), current: { ...c, log: log('skip') } }, 'skipped');
    }
    case 'reroll': {
      const n = {
        ...s,
        current: { ...c, variant: c.variant + 1, rerolls: c.rerolls + 1, awaitingChoice: false, log: log('reroll') },
      };
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

const ANSWER_ICON: Partial<Record<LogType, string>> = { wrong: '❌', correct: '✅', skip: '⏩' };

/** How a question was answered, e.g. ❌❌✅ (grabs and rerolls left out). */
export function answerRow(r: QuestionResult): string {
  return r.log.map((e) => ANSWER_ICON[e.type] ?? '').join('');
}

/** Everything that happened on a question, grabs included, e.g. ❌🧌❌✅. */
export function eventRow(r: QuestionResult): string {
  return r.log.map((e) => (e.type === 'grab' ? '🧌' : ANSWER_ICON[e.type] ?? '')).join('');
}

/**
 * Share grid, two rows. Row 1: your goats, one emoji each (🧌 lost, then 🐐 saved),
 * so it always matches the count. Row 2: how you answered each question, divided
 * by | (✅ right, ❌ wrong then rerolled, ⏩ skipped; ⬜ never reached).
 */
export function shareGrid(s: GameState, totalGoats = 5): [string, string] {
  // Lost goats on the left (the ogre's side), saved goats on the right.
  const goats = '🧌'.repeat(Math.max(0, totalGoats - s.goats)) + '🐐'.repeat(s.goats);
  const answers = s.categories
    .map((_, i) => {
      const r = s.results[i];
      if (!r) return '⬜';
      return answerRow(r) || '⬜';
    })
    .join('|');
  return [goats, answers];
}

export function formatTime(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
