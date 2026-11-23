// Strip answers and difficulty from a draft file so a checker can answer it blind,
// with choices reshuffled so the original order gives nothing away.
//   node scripts/blind.ts content/drafts/history.json > content/blind/history.json
import { readFileSync } from 'node:fs';
const items = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { id: string; prompt: string; choices: string[] }[];
let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const out = items.map(({ id, prompt, choices }) => {
  const c = [...choices];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return { id, prompt, choices: c };
});
console.log(JSON.stringify(out, null, 1));
