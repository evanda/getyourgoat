import { describe, expect, it } from 'vitest';
import worker from './index.ts';
import { validateSubmission } from './validate.ts';
import { buildSubmission } from '../../src/feedback.ts';
import { DEFAULTS, advanceTo, applyEvent, initialState } from '../../src/engine.ts';
import type { Round } from '../../src/daily.ts';
import { LEVEL_CATEGORIES } from '../../src/levels.ts';

const CATEGORIES = LEVEL_CATEGORIES.normal;

class FakeKV {
  store = new Map<string, string>();
  async get(k: string) {
    return this.store.get(k) ?? null;
  }
  async put(k: string, v: string) {
    this.store.set(k, v);
  }
  async list({ prefix }: { prefix: string }) {
    return { keys: [...this.store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
  }
}

const ORIGIN = 'https://example.github.io';
const env = () => ({ SUBMISSIONS: new FakeKV(), EXPORT_TOKEN: 'secret-token', ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5174` });

const round: Round = {
  level: 'normal',
  number: 7,
  questions: CATEGORIES.map((category, i) => ({
    category,
    variants: [0, 1, 2].map((v) =>
      category === 'arithmetic'
        ? { id: `a-${v}`, prompt: '1 + 1', answer: 2, difficulty: 'easy' as const }
        : { id: `q${i}-${v}`, prompt: 'Q?', choices: ['a', 'b', 'c', 'd'], answer: 'a', difficulty: 'easy' as const },
    ),
  })),
};

function playedGame() {
  let s = initialState(DEFAULTS, CATEGORIES);
  s = applyEvent(advanceTo(s, DEFAULTS, 3), DEFAULTS, 'correct');
  s = applyEvent(advanceTo(s, DEFAULTS, 5), DEFAULTS, 'wrong');
  s = applyEvent(s, DEFAULTS, 'reroll');
  s = applyEvent(advanceTo(s, DEFAULTS, 9), DEFAULTS, 'correct');
  for (const t of [12, 14, 30]) s = applyEvent(advanceTo(s, DEFAULTS, t), DEFAULTS, 'correct');
  return s;
}

function sample(id = 'sub1') {
  return buildSubmission({
    round,
    state: playedGame(),
    params: DEFAULTS,
    pace: 'too_fast',
    difficulty: 'just_right',
    flags: [{ questionId: 'q1-1', reason: 'unclear', note: 'two answers fit' }],
    device: 'mobile',
    submissionId: id,
    now: new Date('2026-11-23T12:00:00Z'),
  });
}

const post = (body: unknown, origin = ORIGIN) =>
  new Request('https://w.example/submit', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('client payload matches the worker contract', () => {
  it('validates, and records what the player saw', () => {
    const r = validateSubmission(sample());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.round).toBe(7);
    expect(r.value.level).toBe('normal');
    expect(r.value.run.perQuestion[1]).toMatchObject({ questionId: 'q1-1', seen: ['q1-0', 'q1-1'], rerolls: 1, wrongs: 1 });
    expect(r.value.run.goatsSaved).toBe(playedGame().goats);
  });

  it('drops unknown fields', () => {
    const r = validateSubmission({ ...sample(), email: 'x@y.z' });
    expect(r.ok && 'email' in r.value).toBe(false);
  });

  it('rejects bad votes and unknown levels', () => {
    expect(validateSubmission({ ...sample(), pace: 'meh' }).ok).toBe(false);
    expect(validateSubmission({ ...sample(), level: 'nightmare' }).ok).toBe(false);
  });
});

describe('worker', () => {
  it('stores a submission and exports it with the token', async () => {
    const e = env();
    const res = await worker.fetch(post(sample()), e);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);

    const denied = await worker.fetch(new Request('https://w.example/export'), e);
    expect(denied.status).toBe(401);

    const out = await worker.fetch(
      new Request('https://w.example/export', { headers: { Authorization: 'Bearer secret-token' } }),
      e,
    );
    const rows = (await out.json()) as { submissionId: string; receivedAt: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].submissionId).toBe('sub1');
    expect(rows[0].receivedAt).toBeTruthy();
  });

  it('is idempotent per submissionId', async () => {
    const e = env();
    await worker.fetch(post(sample('same')), e);
    await worker.fetch(post(sample('same')), e);
    expect([...e.SUBMISSIONS.store.keys()].filter((k) => k.startsWith('sub:'))).toHaveLength(1);
  });

  it('refuses other origins, bad JSON, oversize bodies, and floods', async () => {
    const e = env();
    expect((await worker.fetch(post(sample(), 'https://evil.example'), e)).status).toBe(403);
    expect((await worker.fetch(post('{nope'), e)).status).toBe(400);
    expect((await worker.fetch(post('x'.repeat(60_000)), e)).status).toBe(413);
    for (let i = 0; i < 60; i++) await worker.fetch(post(sample(`s${i}`)), e);
    expect((await worker.fetch(post(sample('one-more')), e)).status).toBe(429);
  });

  it('answers CORS preflight', async () => {
    const res = await worker.fetch(new Request('https://w.example/submit', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env());
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});
