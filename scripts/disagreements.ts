// List questions where the blind checker disagreed with the key, noted a
// problem, or was not highly confident.
//   node scripts/disagreements.ts earth-science
import { readFileSync } from 'node:fs';
const slug = process.argv[2];
const drafts = JSON.parse(readFileSync(`content/drafts/${slug}.json`, 'utf8')) as { id: string; prompt: string; choices: string[]; answer: string }[];
const checks = new Map((JSON.parse(readFileSync(`content/checks/${slug}.json`, 'utf8')) as { id: string; pick: string; confidence: string; problem: string | null }[]).map((c) => [c.id, c]));
let n = 0;
for (const q of drafts) {
  const c = checks.get(q.id);
  if (!c) { console.log(`${q.id}: NO CHECK`); n++; continue; }
  if (c.pick !== q.answer || c.problem || c.confidence !== 'high') {
    n++;
    console.log(`\n${q.id} [${c.pick === q.answer ? 'agree' : 'DISAGREE'}, ${c.confidence}] ${q.prompt}\n  choices: ${q.choices.join(' | ')}\n  key: ${q.answer}   checker: ${c.pick}${c.problem ? `\n  problem: ${c.problem}` : ''}`);
  }
}
console.log(`\n${n} of ${drafts.length} to review`);
