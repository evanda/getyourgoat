# Get Your Goat

Daily trivia game. Design doc: https://claude.ai/artifact/3BPq7Z2AJ6DKjGyfWDT2VM
("Get Your Goat: Design Doc (v0.1)"). Current state: Milestone 2 (alpha). Live alpha: https://www.remingtons.org/getyourgoat/
(GitHub Pages from evanda/getyourgoat; every push to main redeploys). Commits use the GitHub
noreply address; never the personal email. The old evanda/get-your-goat repo predates that.

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
**Rounds are frozen once testers have them.** Rewording a question in place is safe, but dropping or
adding one reshuffles every later round of that level. If that must happen, bump `BUILD` in
`src/feedback.ts` so old and new feedback can be told apart.
Arithmetic is computed (multi-step prompts always parenthesized; a test enforces it): `scripts/gen-arithmetic.ts <level>` → `content/arithmetic-<level>.json`.
Categories: arithmetic, history, literature, earth science, technology (Normal/Hard);
Easy (kids ~7–11) has animals instead of technology. Philosophy was dropped in alpha 0.4 as too
hard; its bank lives only in git history. Technology = inventions ancient to modern, computing <15%.
Pace per level (alpha 0.4): Easy 16 s, Normal 11 s, Hard 9 s.

## Rules decided beyond the doc (prototype; confirm before alpha)
- `ogreSpeed` / `returnSpeed` are seconds to cross the track, not velocities.
- A correct answer while he grabs or runs home is banked and applied at the cave
  (he starts the next approach at −buttDistance). Positions below 0 = inside the cave.
- Pen empties before Q5 → game ends; unreached questions are absent from results
  and render as ⬜ in the share grid.
- Grid (owner's choice): one emoji per GOAT, not per question, so it always matches `N/5`.
  Saved goats 🐐 first, then lost goats in the order lost: 🧌 grabbed, ⏭️ lost to a skip.
  The ogre can grab several goats during one slow question; per-question detail is in the results table.
  Share line: `Get Your Goat #42 · Normal`.
- After a wrong answer: skip or reroll only (no retry). Answer is not revealed.
- Every skip costs a goat (owner: a skip is not a goat saved). Skipping away the last goat ends the game.
- Puzzle #1 = 2026-11-23. Missing day file → falls back to #1 with a note.
- Game clock is wall-clock time; the ogre keeps walking while the tab is hidden (doc: "keeps walking").

## Autonomy
Experimental project: commit to main directly for now. Risk-appetite question still
to ask once the project is a few days / dozens of commits old.
