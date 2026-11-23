# Get Your Goat

Daily trivia game. Design doc: https://claude.ai/artifact/3BPq7Z2AJ6DKjGyfWDT2VM
("Get Your Goat: Design Doc (v0.1)"). Current state: Milestone 1 (prototype).

## Commands
- `npm run dev` — Vite dev server
- `npm test` — vitest (engine + daily-file validation)
- `npm run typecheck`, `npm run build`
- `npm run sim -- [games] [param=value ...]` — pacing simulation (`node` runs the TS directly)

## Layout
- `src/engine.ts` — pure game engine (no DOM, no clock). All tuning lives in `Params`.
- `src/daily.ts` — daily file types, validation, puzzle numbering, seeded option shuffle.
- `src/main.ts` — DOM UI. `src/sound.ts` — synthesized sfx.
- `public/daily/YYYY-MM-DD.json` — one file per day; five categories in fixed order,
  each with `variants` (variant 0 is the day's question, the rest feed rerolls).
- `scripts/simulate.ts` — synthetic-player pacing check (doc section 7.5).

## Rules decided beyond the doc (prototype; confirm before alpha)
- `ogreSpeed` / `returnSpeed` are seconds to cross the track, not velocities.
- A correct answer while he grabs or runs home is banked and applied at the cave
  (he starts the next approach at −buttDistance). Positions below 0 = inside the cave.
- Pen empties before Q5 → game ends; unreached questions are absent from results
  and render as ⬜ in the share grid.
- Grid: 🧌 if at least one goat was lost while that question was live, else 🐐.
  A skipped question with no loss shows 🐐. Count `N/5` is goats left.
- After a wrong answer: skip or reroll only (no retry). Answer is not revealed.
- Puzzle #1 = 2026-11-23. Missing day file → falls back to #1 with a note.
- Game clock is wall-clock time and pauses while the tab is hidden.

## Autonomy
Experimental project: commit to main directly for now. Risk-appetite question still
to ask once the project is a few days / dozens of commits old.
