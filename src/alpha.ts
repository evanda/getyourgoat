// Alpha feedback panel shown on the results screen: pace and difficulty votes,
// per-question flags with the expected answer revealed, and a Send button.
import type { GameState, Params } from './engine.ts';
import { isChoice, type Question, type Round } from './daily.ts';
import { el } from './dom.ts';
import {
  buildSubmission,
  device,
  newId,
  send,
  type DifficultyVote,
  type Flag,
  type Pace,
} from './feedback.ts';

const FEEDBACK_URL: string | undefined = import.meta.env.VITE_FEEDBACK_URL;

function chips<T extends string>(
  name: string,
  legend: string,
  options: [T, string][],
  onPick: (v: T) => void,
): HTMLElement {
  const group = el('div', { class: 'chips', role: 'radiogroup' });
  group.setAttribute('aria-label', legend);
  for (const [value, label] of options) {
    const b = el('button', { class: 'chip', type: 'button', textContent: label });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    b.dataset.value = value;
    b.addEventListener('click', () => {
      for (const o of group.querySelectorAll('.chip')) o.setAttribute('aria-checked', String(o === b));
      onPick(value);
    });
    group.append(b);
  }
  return el('fieldset', { class: 'vote', name }, el('legend', {}, legend), group);
}

function answerText(q: Question): string {
  return isChoice(q) ? q.answer : String(q.answer);
}

export function alphaFeedback(opts: { round: Round; state: GameState; params: Params }): HTMLElement {
  const { round, state } = opts;
  let pace: Pace | null = null;
  let difficulty: DifficultyVote | null = null;
  const flags = new Map<string, Flag>();
  // One id per results screen, so pressing Send again after an error never double-counts.
  const submissionId = newId();

  const status = el('p', { class: 'send-status', role: 'status' });
  const sendBtn = el('button', { class: 'primary big', type: 'button', textContent: 'Send feedback' });

  // Every question the player saw, rerolled ones included.
  const seen: { category: string; q: Question }[] = [];
  state.results.forEach((r, i) => {
    const vs = round.questions[i].variants;
    const ids = new Set<string>();
    for (let j = 0; j <= r.rerolls; j++) {
      const q = vs[j % vs.length];
      if (!ids.has(q.id)) {
        ids.add(q.id);
        seen.push({ category: r.category, q });
      }
    }
  });

  const list = el('ul', { class: 'flag-list' });
  for (const { category, q } of seen) {
    const note = el('input', {
      id: `note-${q.id}`,
      type: 'text',
      maxLength: 300,
      placeholder: 'What’s wrong? (optional)',
    });
    const reasons = chips(`reason-${q.id}`, 'Problem', [
      ['wrong_answer', 'Wrong answer'],
      ['unclear', 'Unclear'],
      ['other', 'Other'],
    ], (reason) => {
      flags.set(q.id, { questionId: q.id, reason, note: note.value.trim() });
    });
    note.addEventListener('input', () => {
      const f = flags.get(q.id);
      if (f) f.note = note.value.trim();
    });
    const details = el('div', { class: 'flag-details', hidden: true }, reasons, note);
    const toggle = el('button', { class: 'flag', type: 'button', textContent: '⚑ Flag' });
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const open = details.hidden === true;
      details.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.classList.toggle('on', open);
      if (!open) flags.delete(q.id);
    });
    list.append(
      el(
        'li',
        {},
        el(
          'div',
          { class: 'flag-head' },
          el(
            'div',
            { class: 'flag-text' },
            el('span', { class: 'flag-cat' }, category),
            el('span', {}, q.prompt),
            el('span', { class: 'flag-answer' }, `Answer: ${answerText(q)}`),
          ),
          toggle,
        ),
        details,
      ),
    );
  }

  sendBtn.addEventListener('click', async () => {
    if (!FEEDBACK_URL) return;
    sendBtn.disabled = true;
    status.textContent = 'Sending…';
    try {
      // A flag needs a reason; an opened flag with none picked is dropped.
      const sub = buildSubmission({
        round,
        state,
        params: opts.params,
        pace,
        difficulty,
        flags: [...flags.values()],
        device: device(),
        submissionId,
      });
      await send(FEEDBACK_URL, sub);
      sendBtn.textContent = 'Sent ✓';
      status.textContent = 'Thanks! Your feedback is in.';
    } catch (err) {
      sendBtn.disabled = false;
      status.textContent = `Couldn’t send (${(err as Error).message}). Check your connection and try again.`;
    }
  });

  if (!FEEDBACK_URL) {
    sendBtn.disabled = true;
    status.textContent = 'Feedback isn’t connected in this build.';
  }

  return el(
    'section',
    { class: 'feedback' },
    el('h2', {}, 'How did that feel?'),
    chips('pace', 'The ogre was…', [
      ['too_slow', 'Too slow'],
      ['just_right', 'Just right'],
      ['too_fast', 'Too fast'],
    ], (v) => (pace = v)),
    chips('difficulty', 'The questions were…', [
      ['too_easy', 'Too easy'],
      ['just_right', 'Just right'],
      ['too_hard', 'Too hard'],
    ], (v) => (difficulty = v)),
    el('details', { class: 'flags' }, el('summary', {}, `Questions (${seen.length}): flag any that look wrong`), list),
    sendBtn,
    status,
  );
}
