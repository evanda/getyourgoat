// Builds and sends an alpha feedback submission. The shape is the Worker's
// contract (worker/src/validate.ts); tests check the two agree.
import type { GameState, Params } from './engine.ts';
import type { Round } from './daily.ts';
import type { Flag, Submission } from '../worker/src/validate.ts';

export type { Flag, Submission };
export type Pace = NonNullable<Submission['pace']>;
export type DifficultyVote = NonNullable<Submission['difficulty']>;

export const BUILD = 'alpha-0.4';

export function newId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/** Anonymous per-browser id, used only to dedupe and rate-limit. */
export function clientId(): string {
  try {
    let id = localStorage.getItem('gyg.clientId');
    if (!id) {
      id = newId();
      localStorage.setItem('gyg.clientId', id);
    }
    return id;
  } catch {
    return sessionId;
  }
}
const sessionId = newId();

/** The question ids the player saw for each category, in order. */
export function seenIds(round: Round, s: GameState, i: number): string[] {
  const r = s.results[i];
  if (!r) return [];
  return round.questions[i].variants.slice(0, r.rerolls + 1).map((q) => q.id);
}

export function buildSubmission(opts: {
  round: Round;
  state: GameState;
  params: Params;
  pace: Pace | null;
  difficulty: DifficultyVote | null;
  flags: Flag[];
  device: 'mobile' | 'desktop';
  submissionId: string;
  now?: Date;
}): Submission {
  const { round, state: s } = opts;
  return {
    submissionId: opts.submissionId,
    clientId: clientId(),
    build: BUILD,
    level: round.level,
    round: round.number,
    settings: { ...opts.params },
    run: {
      goatsSaved: s.goats,
      totalTimeMs: Math.round(s.t * 1000),
      perQuestion: s.results.map((r, i) => {
        const seen = seenIds(round, s, i);
        return {
          category: r.category,
          questionId: seen[seen.length - 1],
          seen,
          answerMs: Math.round((r.endT - r.startT) * 1000),
          outcome: r.outcome,
          wrongs: r.wrongs,
          rerolls: r.rerolls,
          goatsLost: r.goatsLost,
        };
      }),
    },
    pace: opts.pace,
    difficulty: opts.difficulty,
    flags: opts.flags,
    device: opts.device,
    timestamp: (opts.now ?? new Date()).toISOString(),
  };
}

export function device(): 'mobile' | 'desktop' {
  return matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop';
}

export async function send(url: string, sub: Submission): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  });
  if (!res.ok) {
    let msg = `server said ${res.status}`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* keep status text */
    }
    throw new Error(msg);
  }
}
