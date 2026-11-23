// Validate a trivia draft file: content/drafts/<category>.json
//   node scripts/check-drafts.ts content/drafts/history.json
// Prints problems and exits non-zero if any are found.
import { readFileSync } from 'node:fs';

interface Draft {
  id: string;
  prompt: string;
  choices: string[];
  answer: string;
  difficulty: string;
  topic: string;
}

const file = process.argv[2];
if (!file) throw new Error('usage: node scripts/check-drafts.ts <file>');
const items = JSON.parse(readFileSync(file, 'utf8')) as Draft[];
const problems: string[] = [];
const seenPrompt = new Map<string, string>();
const seenTopic = new Map<string, string>();
const seenId = new Set<string>();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const banned = /\b(not|except|all of the above|none of the above|currently|today|as of)\b/i;
const counts: Record<string, number> = {};

if (!Array.isArray(items)) problems.push('top level must be an array');
items.forEach((q, i) => {
  const at = `#${i} (${q.id ?? 'no id'})`;
  if (typeof q.id !== 'string' || !q.id) problems.push(`${at}: missing id`);
  else if (seenId.has(q.id)) problems.push(`${at}: duplicate id`);
  else seenId.add(q.id);
  if (typeof q.prompt !== 'string' || q.prompt.length < 10) problems.push(`${at}: prompt too short`);
  if (q.prompt?.length > 140) problems.push(`${at}: prompt over 140 chars`);
  if (banned.test(q.prompt ?? '')) problems.push(`${at}: prompt uses a banned word (NOT/EXCEPT/currently/today…)`);
  if (!Array.isArray(q.choices) || q.choices.length !== 4) problems.push(`${at}: need exactly 4 choices`);
  else {
    if (new Set(q.choices.map(norm)).size !== 4) problems.push(`${at}: duplicate choices`);
    if (q.choices.some((c) => typeof c !== 'string' || !c.trim() || c.length > 44)) problems.push(`${at}: empty or >44-char choice`);
    if (!q.choices.includes(q.answer)) problems.push(`${at}: answer is not exactly one of the choices`);
    if (q.choices.some((c) => banned.test(c))) problems.push(`${at}: choice uses a banned phrase`);
  }
  if (!['easy', 'medium', 'hard'].includes(q.difficulty)) problems.push(`${at}: difficulty must be easy|medium|hard`);
  counts[q.difficulty] = (counts[q.difficulty] ?? 0) + 1;
  if (typeof q.topic !== 'string' || !q.topic) problems.push(`${at}: missing topic`);
  const p = norm(q.prompt ?? '');
  if (seenPrompt.has(p)) problems.push(`${at}: same prompt as ${seenPrompt.get(p)}`);
  seenPrompt.set(p, at);
  const t = norm(q.topic ?? '');
  if (t && seenTopic.has(t)) problems.push(`${at}: same topic as ${seenTopic.get(t)} ("${q.topic}")`);
  seenTopic.set(t, at);
});

console.log(`${items.length} questions; difficulty ${JSON.stringify(counts)}`);
if (problems.length) {
  console.log(`${problems.length} problem(s):\n` + problems.join('\n'));
  process.exit(1);
}
console.log('OK');
