// Get Your Goat alpha feedback collector (Cloudflare Worker + KV).
//   POST /submit   — one feedback submission from the game (JSON, ≤16 KB)
//   GET  /export   — every submission as a JSON array; needs `Authorization: Bearer <EXPORT_TOKEN>`
// Stores no names, emails, IPs or locations. The anonymous clientId only
// dedupes and rate-limits.
import { validateSubmission } from './validate.ts';

interface KVListResult {
  keys: { name: string }[];
  list_complete: boolean;
  cursor?: string;
}
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number; metadata?: unknown }): Promise<void>;
  list(opts: { prefix: string; cursor?: string; limit?: number }): Promise<KVListResult>;
}
interface Env {
  SUBMISSIONS: KVNamespace;
  EXPORT_TOKEN: string;
  /** Comma-separated origins allowed to submit, e.g. the Pages site and localhost. */
  ALLOWED_ORIGINS: string;
}

const MAX_BODY = 16 * 1024;
const MAX_PER_HOUR = 60;

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  return allowed.includes(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' };
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function sameSecret(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function submit(req: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  if (!headers['Access-Control-Allow-Origin']) return json({ error: 'origin not allowed' }, 403, headers);
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: 'too large' }, 413, headers);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json({ error: 'not JSON' }, 400, headers);
  }
  const result = validateSubmission(raw);
  if (!result.ok) return json({ error: result.error }, 400, headers);
  const sub = result.value;

  const bucket = `rl:${sub.clientId}:${Math.floor(Date.now() / 3_600_000)}`;
  const used = Number((await env.SUBMISSIONS.get(bucket)) ?? 0);
  if (used >= MAX_PER_HOUR) return json({ error: 'slow down' }, 429, headers);
  await env.SUBMISSIONS.put(bucket, String(used + 1), { expirationTtl: 7200 });

  const receivedAt = new Date().toISOString();
  // Keyed by submissionId, so a retried send overwrites instead of duplicating.
  await env.SUBMISSIONS.put(`sub:${sub.submissionId}`, JSON.stringify({ ...sub, receivedAt }), {
    metadata: { receivedAt, round: sub.round },
  });
  return json({ ok: true }, 200, headers);
}

async function exportAll(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!sameSecret(auth.replace(/^Bearer /, ''), env.EXPORT_TOKEN ?? '')) return json({ error: 'unauthorized' }, 401);
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.SUBMISSIONS.list({ prefix: 'sub:', cursor, limit: 1000 });
    names.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  const out: unknown[] = [];
  for (let i = 0; i < names.length; i += 50) {
    const vals = await Promise.all(names.slice(i, i + 50).map((n) => env.SUBMISSIONS.get(n)));
    for (const v of vals) if (v) out.push(JSON.parse(v));
  }
  return json(out, 200);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const headers = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method === 'POST' && url.pathname === '/submit') return submit(req, env, headers);
    if (req.method === 'GET' && url.pathname === '/export') return exportAll(req, env);
    return json({ error: 'not found' }, 404, headers);
  },
};
