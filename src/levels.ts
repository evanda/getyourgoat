// Challenge levels. Each level has its own question bank, categories and pace;
// round #n exists separately for each level (rounds/<level>/<n>.json).
import { DEFAULTS, type Params } from './engine.ts';

export type Level = 'easy' | 'normal' | 'hard';
export const LEVELS: readonly Level[] = ['easy', 'normal', 'hard'];
export const DEFAULT_LEVEL: Level = 'normal';

export const LEVEL_LABEL: Record<Level, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
export const LEVEL_BLURB: Record<Level, string> = {
  easy: 'Kid-friendly questions, slower ogre',
  normal: 'Good for most grown-ups',
  hard: 'For trivia buffs, faster ogre',
};

const ADULT = ['arithmetic', 'history', 'literature', 'earth science', 'technology'] as const;
export const LEVEL_CATEGORIES: Record<Level, readonly string[]> = {
  easy: ['arithmetic', 'history', 'literature', 'earth science', 'animals'],
  normal: ADULT,
  hard: ADULT,
};

/** Starting pace per level; alpha votes are recorded per level to tune each one. */
export const LEVEL_PARAMS: Record<Level, Params> = {
  easy: { ...DEFAULTS, ogreSpeed: 16, buttDistance: 0.4 },
  normal: { ...DEFAULTS, ogreSpeed: 11 },
  hard: { ...DEFAULTS, ogreSpeed: 9 },
};

export function isLevel(v: unknown): v is Level {
  return typeof v === 'string' && (LEVELS as readonly string[]).includes(v);
}
