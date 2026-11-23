import './style.css';
import {
  DEFAULTS,
  advanceTo,
  applyEvent,
  formatTime,
  initialState,
  shareGrid,
  type EventType,
  type GameState,
  type Params,
} from './engine.ts';
import {
  CATEGORIES,
  EPOCH,
  isChoice,
  loadDaily,
  localDate,
  puzzleNumber,
  seededShuffle,
  type Daily,
  type Question,
} from './daily.ts';
import { sfx } from './sound.ts';

const params: Params = { ...DEFAULTS };
const app = document.getElementById('app')!;

const prefs = {
  get reducedMotion(): boolean {
    const v = readPref('reducedMotion');
    return v === null ? matchMedia('(prefers-reduced-motion: reduce)').matches : v === '1';
  },
  set reducedMotion(on: boolean) {
    writePref('reducedMotion', on ? '1' : '0');
  },
  get sound(): boolean {
    return readPref('sound') !== '0';
  },
  set sound(on: boolean) {
    writePref('sound', on ? '1' : '0');
  },
};

function readPref(k: string): string | null {
  try {
    return localStorage.getItem(`gyg.${k}`);
  } catch {
    return null;
  }
}
function writePref(k: string, v: string): void {
  try {
    localStorage.setItem(`gyg.${k}`, v);
  } catch {
    /* storage unavailable: preference lasts for this page only */
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) e.className = cls;
  Object.assign(e, rest);
  e.append(...children);
  return e;
}

// ---------------------------------------------------------------- start

interface Loaded {
  daily: Daily;
  /** Set when today has no puzzle file and we fell back to another day. */
  fallbackFrom: string | null;
}

async function boot(): Promise<void> {
  app.replaceChildren(el('p', { class: 'loading' }, 'Loading today’s puzzle…'));
  try {
    const today = localDate();
    const daily = await loadDaily(today);
    if (daily) return showStart({ daily, fallbackFrom: null });
    const proto = await loadDaily(EPOCH);
    if (!proto) throw new Error('No puzzle files found.');
    showStart({ daily: proto, fallbackFrom: today });
  } catch (err) {
    app.replaceChildren(
      el('section', { class: 'card' }, el('h1', {}, 'Get Your Goat'), el('p', {}, String((err as Error).message))),
    );
  }
}

function showStart(loaded: Loaded): void {
  const { daily, fallbackFrom } = loaded;
  const play = el('button', { class: 'primary big', textContent: 'Play' });
  play.addEventListener('click', () => {
    sfx.unlock();
    startGame(loaded);
  });

  const rm = el('input', { type: 'checkbox', checked: prefs.reducedMotion });
  rm.addEventListener('change', () => (prefs.reducedMotion = rm.checked));
  const snd = el('input', { type: 'checkbox', checked: prefs.sound });
  snd.addEventListener('change', () => (prefs.sound = snd.checked));

  app.replaceChildren(
    el(
      'section',
      { class: 'card start' },
      el('div', { class: 'hero', ariaHidden: 'true' }, '🧌 · · · · 🐐🐐🐐🐐🐐'),
      el('h1', {}, 'Get Your Goat'),
      el('p', { class: 'sub' }, `#${puzzleNumber(daily.date)} · ${daily.date}`),
      fallbackFrom
        ? el('p', { class: 'note' }, `Prototype build: no puzzle for ${fallbackFrom} yet, so you’re playing #1.`)
        : '',
      el(
        'ol',
        { class: 'rules' },
        el('li', {}, 'The ogre walks toward your goat pen the whole time.'),
        el('li', {}, 'Answer right and a goat butts him back.'),
        el('li', {}, 'Miss, and you can skip or reroll — but he keeps walking.'),
        el('li', {}, 'If he reaches the pen, he drags a goat to his cave.'),
      ),
      el('p', { class: 'cats' }, CATEGORIES.join(' · ')),
      play,
      el(
        'div',
        { class: 'toggles' },
        el('label', {}, rm, ' Reduced motion'),
        el('label', {}, snd, ' Sound'),
      ),
    ),
  );
  play.focus();
}

// ---------------------------------------------------------------- game

interface View {
  root: HTMLElement;
  qNum: HTMLElement;
  cat: HTMLElement;
  clock: HTMLElement;
  goatsLabel: HTMLElement;
  arena: HTMLElement;
  ogre: HTMLElement;
  carried: HTMLElement;
  pen: HTMLElement;
  bar: HTMLElement;
  barFill: HTMLElement;
  toast: HTMLElement;
  card: HTMLElement;
}

function startGame(loaded: Loaded): void {
  const { daily } = loaded;
  const reduced = prefs.reducedMotion;
  let s: GameState = initialState(params, CATEGORIES);
  let elapsed = 0;
  let last = performance.now();
  let raf = 0;
  let shownKey = '';
  let prevPhase = s.phase;
  let prevGoats = s.goats;
  let typed = '';

  const v = buildView(reduced);
  app.replaceChildren(v.root);

  function question(): Question | null {
    if (!s.current) return null;
    return daily.questions[s.q].variants[s.current.variant] ?? null;
  }

  function send(type: EventType): void {
    // Answers land at the moment they're given, not at the last frame.
    const now = performance.now();
    elapsed += Math.max(0, now - last) / 1000;
    last = now;
    s = advanceTo(s, params, elapsed);
    const before = s;
    s = applyEvent(s, params, type);
    if (type === 'correct' && s !== before) {
      sfx.play('butt', prefs.sound);
      launchGoat(v, before, reduced);
    }
    if (type === 'wrong') {
      sfx.play('wrong', prefs.sound);
      v.card.classList.remove('shake');
      void v.card.offsetWidth;
      v.card.classList.add('shake');
    }
    typed = '';
    renderQuestion();
  }

  function renderQuestion(): void {
    const q = question();
    const c = s.current;
    const key = c ? `${s.q}:${c.variant}:${c.awaitingChoice}` : 'done';
    if (key === shownKey) return;
    shownKey = key;
    if (!q || !c) {
      v.card.replaceChildren();
      return;
    }
    const block = daily.questions[s.q];
    const rerollsLeft = block.variants.length - 1 - c.variant;
    v.qNum.textContent = `Q${s.q + 1}/5`;
    v.cat.textContent = block.category;

    const prompt = el('h2', { class: 'prompt' }, q.prompt);
    const body = isChoice(q)
      ? choiceButtons(q, `${daily.date}|${s.q}|${c.variant}`, c.awaitingChoice, (pick) =>
          send(pick === q.answer ? 'correct' : 'wrong'),
        )
      : numberPad(c.awaitingChoice, () => typed, (t) => (typed = t), (n) => send(n === q.answer ? 'correct' : 'wrong'));

    const children: Node[] = [prompt, body];
    if (c.awaitingChoice) {
      const last = s.q === s.categories.length - 1;
      const skip = el('button', { class: 'secondary', textContent: last ? 'Skip (lose a goat)' : 'Skip' });
      skip.addEventListener('click', () => send('skip'));
      const reroll = el('button', {
        class: 'secondary',
        textContent: rerollsLeft > 0 ? `Reroll (${rerollsLeft} left)` : 'No rerolls left',
        disabled: rerollsLeft <= 0,
      });
      reroll.addEventListener('click', () => send('reroll'));
      children.push(
        el(
          'div',
          { class: 'miss' },
          el('p', {}, 'Not quite. He’s still coming!'),
          el('div', { class: 'row' }, skip, reroll),
        ),
      );
    }
    v.card.replaceChildren(...children);
    const first = v.card.querySelector<HTMLButtonElement>(c.awaitingChoice ? '.miss button' : 'button');
    first?.focus({ preventScroll: true });
  }

  function onKey(e: KeyboardEvent): void {
    const q = question();
    const c = s.current;
    if (!q || !c) return;
    // A held key must not answer the next question; leave browser shortcuts alone.
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (c.awaitingChoice) {
      if (e.key.toLowerCase() === 's') send('skip');
      if (e.key.toLowerCase() === 'r') v.card.querySelector<HTMLButtonElement>('.miss button:last-child:not(:disabled)')?.click();
      return;
    }
    if (isChoice(q)) {
      const n = Number(e.key);
      if (n >= 1 && n <= 4) v.card.querySelectorAll<HTMLButtonElement>('.choices button')[n - 1]?.click();
    } else {
      if (/^\d$/.test(e.key)) v.card.querySelector<HTMLButtonElement>(`.pad [data-k="${e.key}"]`)?.click();
      else if (e.key === 'Backspace') v.card.querySelector<HTMLButtonElement>('.pad [data-k="del"]')?.click();
      else if (e.key === 'Enter') {
        e.preventDefault();
        v.card.querySelector<HTMLButtonElement>('.pad [data-k="ok"]')?.click();
      }
    }
  }

  function frame(now: number): void {
    // Wall-clock time, so a slow device doesn't slow the ogre. He keeps walking
    // while the tab is hidden, too: switching away to look something up costs time.
    elapsed += Math.max(0, now - last) / 1000;
    last = now;
    s = advanceTo(s, params, elapsed);

    if (s.goats < prevGoats) {
      sfx.play('grab', prefs.sound);
      showToast(v, s.goats > 0 ? 'He grabbed a goat!' : 'He took the last goat!');
    }
    if (s.phase === 'BUTTED' && prevPhase !== 'BUTTED') {
      v.ogre.classList.remove('squash');
      void v.ogre.offsetWidth;
      v.ogre.classList.add('squash');
    }
    prevPhase = s.phase;
    prevGoats = s.goats;

    renderTrack(v, s, reduced);
    renderQuestion();

    if (s.phase === 'DONE') {
      cleanup();
      setTimeout(() => showResults(loaded, s), s.goats === 0 ? 900 : 500);
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function cleanup(): void {
    cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey);
  }

  addEventListener('keydown', onKey);
  renderTrack(v, s, reduced);
  renderQuestion();
  raf = requestAnimationFrame(frame);
}

function buildView(reduced: boolean): View {
  const qNum = el('span', { class: 'qnum' });
  const cat = el('span', { class: 'cat' });
  const clock = el('span', { class: 'clock' }, '0:00');
  const goatsLabel = el('span', { class: 'goats-label' });
  const carried = el('span', { class: 'carried', ariaHidden: 'true' }, '🐐');
  const ogre = el('div', { class: 'ogre', role: 'img', ariaLabel: 'Ogre' }, el('span', { class: 'ogre-body' }, '🧌'), carried);
  const pen = el('div', { class: 'pen', role: 'img' });
  const arena = el(
    'div',
    { class: 'arena' },
    el('div', { class: 'cave', ariaHidden: 'true' }, el('span', {}, 'cave')),
    el('div', { class: 'lane' }, ogre),
    pen,
  );
  const barFill = el('div', { class: 'bar-fill' });
  const bar = el(
    'div',
    { class: 'bar', role: 'progressbar', ariaLabel: 'Ogre distance to pen' },
    barFill,
  );
  const toast = el('div', { class: 'toast', role: 'status' });
  const card = el('section', { class: 'card question' });
  const root = el(
    'div',
    { class: `game${reduced ? ' reduced' : ''}` },
    el('header', { class: 'hud' }, qNum, cat, clock, goatsLabel),
    reduced ? bar : arena,
    toast,
    card,
  );
  return { root, qNum, cat, clock, goatsLabel, arena, ogre, carried, pen, bar, barFill, toast, card };
}

function renderTrack(v: View, s: GameState, reduced: boolean): void {
  v.clock.textContent = formatTime(s.t);
  v.goatsLabel.textContent = `🐐 ${s.goats}`;
  v.goatsLabel.ariaLabel = `${s.goats} goats left`;
  const visible = Math.max(0, Math.min(1, s.pos));
  if (reduced) {
    const pct = Math.round(visible * 100);
    v.barFill.style.width = `${pct}%`;
    v.bar.ariaValueNow = String(pct);
    v.bar.dataset.label =
      s.phase === 'RETURN' || s.phase === 'GRAB' ? 'Ogre heading home with a goat' : `Ogre ${pct}% of the way to the pen`;
    return;
  }
  v.ogre.style.setProperty('--pos', String(visible));
  v.ogre.classList.toggle('in-cave', s.pos < 0);
  v.ogre.classList.toggle('returning', s.phase === 'RETURN');
  v.ogre.classList.toggle('carrying', s.phase === 'RETURN' || s.phase === 'GRAB');
  const penText = '🐐'.repeat(s.goats);
  if (v.pen.textContent !== penText) {
    v.pen.textContent = penText;
    v.pen.ariaLabel = `Pen with ${s.goats} goats`;
  }
}

function launchGoat(v: View, before: GameState, reduced: boolean): void {
  if (reduced) return;
  const goat = el('span', { class: 'runner', ariaHidden: 'true' }, '🐐');
  const target = Math.max(0, Math.min(1, before.pos));
  goat.style.setProperty('--to', String(target));
  v.arena.append(goat);
  goat.addEventListener('animationend', () => goat.remove());
}

function showToast(v: View, text: string): void {
  v.toast.textContent = text;
  v.toast.classList.remove('show');
  void v.toast.offsetWidth;
  v.toast.classList.add('show');
}

function choiceButtons(
  q: { choices: string[]; prompt: string },
  seed: string,
  locked: boolean,
  onPick: (choice: string) => void,
): HTMLElement {
  const wrap = el('div', { class: 'choices' });
  seededShuffle(q.choices, seed).forEach((choice, i) => {
    const b = el('button', { class: 'choice', disabled: locked }, el('kbd', {}, String(i + 1)), choice);
    b.addEventListener('click', () => onPick(choice));
    wrap.append(b);
  });
  return wrap;
}

function numberPad(
  locked: boolean,
  get: () => string,
  set: (t: string) => void,
  onSubmit: (n: number) => void,
): HTMLElement {
  const display = el('output', { class: 'display' }, get() || ' ');
  const update = (t: string) => {
    set(t);
    display.textContent = t || ' ';
    ok.disabled = locked || t === '';
  };
  const pad = el('div', { class: 'pad' });
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
  let ok!: HTMLButtonElement;
  for (const k of keys) {
    const label = k === 'del' ? '⌫' : k === 'ok' ? '✓' : k;
    const b = el('button', { textContent: label, disabled: locked });
    b.dataset.k = k;
    if (k === 'del') b.ariaLabel = 'Delete';
    if (k === 'ok') {
      b.ariaLabel = 'Submit answer';
      b.classList.add('ok');
      ok = b;
    }
    b.addEventListener('click', () => {
      const t = get();
      if (k === 'del') update(t.slice(0, -1));
      else if (k === 'ok') {
        if (t !== '') onSubmit(Number(t));
      } else if (t.length < 6) update(t === '0' ? k : t + k);
    });
    pad.append(b);
  }
  ok.disabled = locked || get() === '';
  return el('div', { class: 'numeric' }, display, pad);
}

// ---------------------------------------------------------------- results

function shareText(daily: Daily, s: GameState): string {
  return `Get Your Goat #${puzzleNumber(daily.date)}\n${shareGrid(s)}  ${s.goats}/5  ${formatTime(s.t)}`;
}

function showResults(loaded: Loaded, s: GameState): void {
  const { daily } = loaded;
  const text = shareText(daily, s);
  const copy = el('button', { class: 'primary big', textContent: 'Copy result' });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = 'Copied!';
    } catch {
      pre.focus();
      getSelection()?.selectAllChildren(pre);
      copy.textContent = 'Press ⌘C / Ctrl+C to copy';
    }
  });
  const again = el('button', { class: 'secondary', textContent: 'Play again (practice)' });
  again.addEventListener('click', () => startGame(loaded));
  const pre = el('pre', { class: 'share', tabIndex: 0 }, text);

  const outcomeLabel = { correct: '✓ correct', skipped: '→ skipped', 'pen-empty': '✗ pen emptied' } as const;
  const rows = s.results.map((r) =>
    el(
      'tr',
      {},
      el('td', {}, r.category),
      el('td', {}, outcomeLabel[r.outcome] + (r.rerolls ? ` · ${r.rerolls} reroll${r.rerolls > 1 ? 's' : ''}` : '')),
      el('td', { class: 'num' }, `${(r.endT - r.startT).toFixed(1)}s`),
      el('td', { class: 'num' }, r.goatsLost ? `−${r.goatsLost} 🐐` : ''),
    ),
  );

  const headline =
    s.goats === 5 ? 'Every goat safe!' : s.goats === 0 ? 'The ogre got them all.' : `${s.goats} goats saved.`;

  app.replaceChildren(
    el(
      'section',
      { class: 'card results' },
      el('p', { class: 'sub' }, `Get Your Goat #${puzzleNumber(daily.date)}`),
      el('div', { class: 'grid', ariaLabel: `Result grid ${shareGrid(s)}` }, shareGrid(s)),
      el('h1', {}, headline),
      el('p', { class: 'stats' }, `${s.goats}/5 goats · ${formatTime(s.t)}`),
      pre,
      copy,
      el('table', { class: 'breakdown' }, el('tbody', {}, ...rows)),
      again,
    ),
  );
  copy.focus();
}

boot();
