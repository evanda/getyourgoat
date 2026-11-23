# Get Your Goat

Daily trivia game. Design doc: https://claude.ai/artifact/3BPq7Z2AJ6DKjGyfWDT2VM
("Get Your Goat: Design Doc (v0.1)"). Current state: Milestone 2 (alpha). Live alpha: https://www.remingtons.org/get-your-goat/
(GitHub Pages from evanda/get-your-goat; every push to main redeploys).

## Look
Royal purple and gold, the owner's choice; one look in all themes. Not pale purple.

## Commands
- `npm run dev` — Vite dev server
- `npm test` — vitest (engine + daily-file validation)
- `npm run typecheck`, `npm run build`
- `npm run sim -- [games] [param=value ...]` — pacing simulation (`node` runs the TS directly)

## Layout
- `src/engine.ts` — pure game engine (no DOM, no clock). All tuning lives in `Params`.
- `src/daily.ts` — daily file types, validation, puzzle numbering, seeded option shuffle.
- `src/main.ts` — DOM UI. `src/sound.ts` — synthesized sfx.
- `src/levels.ts` — Easy / Normal (default) / Hard: categories and pace per level.
- `public/rounds/<level>/<n>.json` + `index.json` — round #n is also the daily puzzle for
  day n (#1 = 2026-11-23) at every level. Five categories in the level's order, each with
  `variants` (variant 0 is the round's question, the rest feed rerolls). Stable `id`s.
- `src/alpha.ts`, `src/feedback.ts` — alpha mode (`?alpha=1`, or `VITE_ALPHA=1` in the Pages
  build): round picker, pace/difficulty votes, per-question flags, POST to the Worker.
- `worker/` — Cloudflare Worker + KV collecting feedback, live at
  https://get-your-goat-alpha.evanda.workers.dev (deploy: `cd worker && npx wrangler deploy`).
  Contract: `worker/src/validate.ts`. Pages reads the URL from the repo variable FEEDBACK_URL.
- `scripts/analyze.ts` — summarize feedback: `FEEDBACK_EXPORT_URL=https://get-your-goat-alpha.evanda.workers.dev/export node scripts/analyze.ts`
  (reads the gitignored `.export-token`).
- `scripts/simulate.ts` — synthetic-player pacing check (doc section 7.5).

## Question bank pipeline
1. Draft: `content/drafts/<level>/<category>.json` (Sonnet agents), validated by `scripts/check-drafts.ts`.
2. Blind check: `scripts/blind.ts` strips answers; an Opus agent answers into `content/checks/<level>/`.
3. Review: `scripts/disagreements.ts <level>/<slug>`; decide each in `content/review.json` (keep/drop + reason).
4. Build: `node scripts/assemble.ts [level]` writes rounds (refuses unreviewed disagreements).
   Normal #1 is the hand-made launch round and is never overwritten.
Arithmetic is computed: `scripts/gen-arithmetic.ts <level>` → `content/arithmetic-<level>.json`.
Easy is for kids (~7–11) and swaps philosophy for animals.

## Rules decided beyond the doc (prototype; confirm before alpha)
- `ogreSpeed` / `returnSpeed` are seconds to cross the track, not velocities.
- A correct answer while he grabs or runs home is banked and applied at the cave
  (he starts the next approach at −buttDistance). Positions below 0 = inside the cave.
- Pen empties before Q5 → game ends; unreached questions are absent from results
  and render as ⬜ in the share grid.
- Grid: 🧌 if at least one goat was lost while that question was live; ⏭️ if skipped with
  no loss; 🐐 if answered with no loss; ⬜ if never reached. Count `N/5` is goats left.
  Share line: `Get Your Goat #42 · Normal`.
- After a wrong answer: skip or reroll only (no retry). Answer is not revealed.
- Skipping the last question costs a goat (otherwise it ends the game for free). Earlier skips cost only time.
- Puzzle #1 = 2026-11-23. Missing day file → falls back to #1 with a note.
- Game clock is wall-clock time; the ogre keeps walking while the tab is hidden (doc: "keeps walking").

## Autonomy
Experimental project: commit to main directly for now. Risk-appetite question still
to ask once the project is a few days / dozens of commits old.
