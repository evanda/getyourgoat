// Summarize alpha feedback (design doc 7.4).
//   node scripts/analyze.ts                 # fetch from the Worker (needs .export-token and FEEDBACK_EXPORT_URL)
//   node scripts/analyze.ts submissions.json  # or read a saved export
// Uses each tester's latest submission per round for votes, and every run for timing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Submission } from '../worker/src/validate.ts';

type Row = Submission & { receivedAt: string };

async function load(): Promise<Row[]> {
  const file = process.argv[2];
  if (file) return JSON.parse(readFileSync(file, 'utf8')) as Row[];
  const url = process.env.FEEDBACK_EXPORT_URL;
  if (!url || !existsSync('.export-token')) throw new Error('Set FEEDBACK_EXPORT_URL and create .export-token, or pass a saved export file.');
  const token = readFileSync('.export-token', 'utf8').trim();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`export failed: ${res.status}`);
  const rows = (await res.json()) as Row[];
  writeFileSync('content/feedback-export.json', JSON.stringify(rows, null, 1));
  return rows;
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '–');
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
function tally<T extends string>(xs: (T | null)[], keys: readonly T[]): string {
  const voted = xs.filter((x): x is T => x !== null);
  return keys.map((k) => `${k} ${pct(voted.filter((x) => x === k).length, voted.length)}`).join(' · ') + `  (n=${voted.length})`;
}

const rows = await load();
// Latest submission per tester per round.
const latest = new Map<string, Row>();
for (const r of [...rows].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))) latest.set(`${r.clientId}:${r.round}`, r);
const final = [...latest.values()];
const testers = new Set(rows.map((r) => r.clientId));

console.log(`${rows.length} submissions, ${final.length} tester-rounds, ${testers.size} testers\n`);
console.log('Pace       ', tally(final.map((r) => r.pace), ['too_slow', 'just_right', 'too_fast'] as const));
console.log('Difficulty ', tally(final.map((r) => r.difficulty), ['too_easy', 'just_right', 'too_hard'] as const));

// Each level has its own pace, so judge each on its own votes.
console.log('\nBy level:');
for (const level of ['easy', 'normal', 'hard'] as const) {
  const l = final.filter((r) => r.level === level);
  if (!l.length) continue;
  const g = l.map((r) => r.run.goatsSaved);
  console.log(
    `  ${level.padEnd(7)} n=${String(l.length).padEnd(4)} median goats ${median(g)}  median time ${(median(l.map((r) => r.run.totalTimeMs)) / 1000).toFixed(0)}s`,
  );
  console.log(`          pace       ${tally(l.map((r) => r.pace), ['too_slow', 'just_right', 'too_fast'] as const)}`);
  console.log(`          difficulty ${tally(l.map((r) => r.difficulty), ['too_easy', 'just_right', 'too_hard'] as const)}`);
}

const goats = final.map((r) => r.run.goatsSaved);
console.log('\nGoats saved:', [0, 1, 2, 3, 4, 5].map((g) => `${g}:${pct(goats.filter((x) => x === g).length, goats.length)}`).join('  '));
console.log(`Median game time: ${(median(final.map((r) => r.run.totalTimeMs)) / 1000).toFixed(1)}s (doc target 60–90s)`);

// Pace votes split by how well the tester did (doc 7.4: skill bias).
console.log('\nPace vote by goats saved:');
for (const [label, lo, hi] of [['0–2', 0, 2], ['3–4', 3, 4], ['5', 5, 5]] as const) {
  const g = final.filter((r) => r.run.goatsSaved >= lo && r.run.goatsSaved <= hi);
  console.log(`  ${label.padEnd(4)} ${tally(g.map((r) => r.pace), ['too_slow', 'just_right', 'too_fast'] as const)}`);
}

console.log('\nMedian answer time by category:');
const byCat = new Map<string, number[]>();
for (const r of rows) for (const q of r.run.perQuestion) if (q.outcome === 'correct') byCat.set(q.category, [...(byCat.get(q.category) ?? []), q.answerMs]);
for (const [c, ms] of byCat) console.log(`  ${c.padEnd(14)} ${(median(ms) / 1000).toFixed(1)}s  (n=${ms.length})`);

// Questions: miss rate and flags.
const stats = new Map<string, { seen: number; missed: number; flags: string[] }>();
for (const r of rows) {
  for (const q of r.run.perQuestion) {
    q.seen.forEach((id, i) => {
      const s = stats.get(id) ?? { seen: 0, missed: 0, flags: [] };
      s.seen++;
      if (i < q.seen.length - 1 || q.outcome !== 'correct') s.missed++;
      stats.set(id, s);
    });
  }
  for (const f of r.flags) {
    const s = stats.get(f.questionId) ?? { seen: 0, missed: 0, flags: [] };
    s.flags.push(f.reason + (f.note ? `: ${f.note}` : ''));
    stats.set(f.questionId, s);
  }
}
const flagged = [...stats].filter(([, s]) => s.flags.length).sort((a, b) => b[1].flags.length - a[1].flags.length);
console.log(`\nFlagged questions (${flagged.length}):`);
for (const [id, s] of flagged) console.log(`  ${id} ×${s.flags.length} (missed ${s.missed}/${s.seen}): ${s.flags.join(' | ')}`);
const outliers = [...stats].filter(([, s]) => s.seen >= 3 && s.missed / s.seen >= 0.8);
console.log(`\nMissed by 80%+ of players who saw them (n≥3): ${outliers.map(([id, s]) => `${id} ${s.missed}/${s.seen}`).join(', ') || 'none yet'}`);
