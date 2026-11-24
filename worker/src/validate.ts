// Shape check for an alpha feedback submission. Returns a cleaned copy holding
// only known fields, or an error message. Shared by the Worker and its tests.

export const PACE = ['too_slow', 'just_right', 'too_fast'] as const;
export const DIFFICULTY = ['too_easy', 'just_right', 'too_hard'] as const;
export const FLAG_REASONS = ['wrong_answer', 'unclear', 'other'] as const;
export const OUTCOMES = ['correct', 'skipped', 'pen-empty'] as const;
export const LEVELS = ['easy', 'normal', 'hard'] as const;
const SETTINGS = ['ogreSpeed', 'buttDistance', 'buttDuration', 'grabPause', 'returnSpeed', 'startOffset', 'rerollPenalty', 'skipPenalty', 'goatGap'];
export const LOG_TYPES = ['wrong', 'reroll', 'skip', 'correct', 'grab'] as const;
const OPTIONAL_SETTINGS = new Set(['skipPenalty', 'goatGap']);

export interface PerQuestion {
  category: string;
  questionId: string;
  seen: string[];
  answerMs: number;
  outcome: (typeof OUTCOMES)[number];
  wrongs: number;
  rerolls: number;
  goatsLost: number;
  log: { type: (typeof LOG_TYPES)[number]; ms: number }[];
}

export interface Flag {
  questionId: string;
  reason: (typeof FLAG_REASONS)[number];
  note: string;
}

export interface Submission {
  submissionId: string;
  clientId: string;
  build: string;
  level: (typeof LEVELS)[number];
  round: number;
  settings: Record<string, number>;
  run: { goatsSaved: number; totalTimeMs: number; perQuestion: PerQuestion[] };
  pace: (typeof PACE)[number] | null;
  difficulty: (typeof DIFFICULTY)[number] | null;
  flags: Flag[];
  device: 'mobile' | 'desktop';
  timestamp: string;
}

class Invalid extends Error {}

function str(v: unknown, name: string, max: number, pattern?: RegExp): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) throw new Invalid(`${name}: expected text up to ${max} chars`);
  if (pattern && !pattern.test(v)) throw new Invalid(`${name}: bad format`);
  return v;
}
function int(v: unknown, name: string, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) throw new Invalid(`${name}: expected integer ${lo}..${hi}`);
  return v;
}
function oneOf<T extends string>(v: unknown, name: string, allowed: readonly T[]): T {
  if (!allowed.includes(v as T)) throw new Invalid(`${name}: expected one of ${allowed.join(', ')}`);
  return v as T;
}
function nullableOneOf<T extends string>(v: unknown, name: string, allowed: readonly T[]): T | null {
  return v === null || v === undefined ? null : oneOf(v, name, allowed);
}
function arr(v: unknown, name: string, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) throw new Invalid(`${name}: expected a list of up to ${max}`);
  return v;
}
function obj(v: unknown, name: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Invalid(`${name}: expected an object`);
  return v as Record<string, unknown>;
}

const ID = /^[A-Za-z0-9_-]+$/;

export function validateSubmission(raw: unknown): { ok: true; value: Submission } | { ok: false; error: string } {
  try {
    const o = obj(raw, 'body');
    const settingsIn = obj(o.settings, 'settings');
    const settings: Record<string, number> = {};
    for (const k of SETTINGS) {
      const v = settingsIn[k];
      if (v === undefined && OPTIONAL_SETTINGS.has(k)) continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) throw new Invalid(`settings.${k}: expected a number`);
      settings[k] = v;
    }
    const run = obj(o.run, 'run');
    const perQuestion = arr(run.perQuestion, 'run.perQuestion', 5).map((p, i) => {
      const q = obj(p, `perQuestion[${i}]`);
      return {
        category: str(q.category, 'category', 32),
        questionId: str(q.questionId, 'questionId', 40, ID),
        seen: arr(q.seen, 'seen', 60).map((s) => str(s, 'seen', 40, ID)),
        answerMs: int(q.answerMs, 'answerMs', 0, 3_600_000),
        outcome: oneOf(q.outcome, 'outcome', OUTCOMES),
        wrongs: int(q.wrongs, 'wrongs', 0, 200),
        rerolls: int(q.rerolls, 'rerolls', 0, 200),
        goatsLost: int(q.goatsLost, 'goatsLost', 0, 5),
        log: arr(q.log ?? [], 'log', 100).map((e, j) => {
          const x = obj(e, `log[${j}]`);
          return { type: oneOf(x.type, 'log.type', LOG_TYPES), ms: int(x.ms, 'log.ms', 0, 3_600_000) };
        }),
      };
    });
    const flags = arr(o.flags ?? [], 'flags', 20).map((f, i) => {
      const x = obj(f, `flags[${i}]`);
      const note = x.note === undefined || x.note === '' ? '' : str(x.note, 'note', 300);
      return { questionId: str(x.questionId, 'questionId', 40, ID), reason: oneOf(x.reason, 'reason', FLAG_REASONS), note };
    });
    const value: Submission = {
      submissionId: str(o.submissionId, 'submissionId', 64, ID),
      clientId: str(o.clientId, 'clientId', 64, ID),
      build: str(o.build, 'build', 32),
      level: oneOf(o.level, 'level', LEVELS),
      round: int(o.round, 'round', 1, 100_000),
      settings,
      run: {
        goatsSaved: int(run.goatsSaved, 'goatsSaved', 0, 5),
        totalTimeMs: int(run.totalTimeMs, 'totalTimeMs', 0, 3_600_000),
        perQuestion,
      },
      pace: nullableOneOf(o.pace, 'pace', PACE),
      difficulty: nullableOneOf(o.difficulty, 'difficulty', DIFFICULTY),
      flags,
      device: oneOf(o.device, 'device', ['mobile', 'desktop'] as const),
      timestamp: str(o.timestamp, 'timestamp', 40),
    };
    return { ok: true, value };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}
