import { addWeeks, formatRange, isoWeek, weekOf } from './dates';
import { HORIZON_WEEKS, Week, applyRotation, changedWeeks, extend, repair, setPaused, shift, statusOf, swap } from './schedule';

const LEA = 1, BEN = 2, CARA = 3, DAN = 4;
const NOW = '2026-10-12';
const order = [LEA, BEN, CARA];

const w = (offset: number) => addWeeks(NOW, offset);
/** Assignees from the current week on; paused weeks as 0. */
const names = (weeks: Week[], count = 7) =>
  weeks.filter((x) => x.start >= NOW).slice(0, count).map((x) => (x.paused ? 0 : x.assigneeId));

function history(): Week[] {
  // Two past weeks: Cara cleaned for Ben, Lea's week went unconfirmed.
  return [
    { start: w(-2), assigneeId: BEN, paused: false, cleanedById: CARA, completedAt: '2026-10-01T10:00:00Z' },
    { start: w(-1), assigneeId: CARA, paused: false, cleanedById: null, completedAt: null },
  ];
}

describe('dates', () => {
  it('finds the Monday of a week', () => {
    expect(weekOf(new Date(2026, 9, 18))).toBe('2026-10-12'); // Sunday
    expect(weekOf(new Date(2026, 9, 12))).toBe('2026-10-12'); // Monday
  });
});

describe('extend', () => {
  it('starts a new schedule this week with the first roommate', () => {
    const weeks = extend([], order, NOW);
    expect(weeks).toHaveLength(HORIZON_WEEKS + 1);
    expect(names(weeks)).toEqual([LEA, BEN, CARA, LEA, BEN, CARA, LEA]);
  });

  it('continues after the last turn, ignoring pauses', () => {
    const weeks = extend([...history(), { start: w(0), assigneeId: null, paused: true, cleanedById: null, completedAt: null }], order, NOW);
    expect(names(weeks, 3)).toEqual([0, LEA, BEN]);
  });
});

describe('swap', () => {
  it('exchanges two weeks and leaves all others alone', () => {
    const before = extend(history(), order, NOW);
    const after = swap(before, NOW, w(0), w(1));
    expect(names(after, 4)).toEqual([BEN, LEA, CARA, LEA]);
    expect(changedWeeks(before, after).map((x) => x.start)).toEqual([w(0), w(1)]);
  });
});

describe('pause', () => {
  it('moves later turns back so nobody loses theirs', () => {
    const before = extend(history(), order, NOW); // LEA BEN CARA LEA ...
    const after = setPaused(before, NOW, order, [w(1)], true);
    expect(names(after)).toEqual([LEA, 0, BEN, CARA, LEA, BEN, CARA]);
  });

  it('handles several weeks and resuming restores the original schedule', () => {
    const before = extend(history(), order, NOW);
    const paused = setPaused(before, NOW, order, [w(1), w(3)], true);
    expect(names(paused)).toEqual([LEA, 0, BEN, 0, CARA, LEA, BEN]);
    const resumed = setPaused(paused, NOW, order, [w(1), w(3)], false);
    expect(names(resumed, HORIZON_WEEKS)).toEqual(names(before, HORIZON_WEEKS));
  });

  it('keeps swaps attached to their turns', () => {
    const swapped = swap(extend(history(), order, NOW), NOW, w(1), w(2)); // LEA CARA BEN
    expect(names(setPaused(swapped, NOW, order, [w(0)], true), 4)).toEqual([0, LEA, CARA, BEN]);
  });
});

describe('shift', () => {
  it('turns the first N weeks into pauses and moves everything back', () => {
    const before = extend(history(), order, NOW);
    expect(names(shift(before, NOW, order, w(0), 3))).toEqual([0, 0, 0, LEA, BEN, CARA, LEA]);
  });

  it('never touches history', () => {
    const before = extend(history(), order, NOW);
    const after = shift(before, NOW, order, w(0), 2);
    expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
  });
});

describe('applyRotation', () => {
  const base = () => extend(history(), order, NOW); // LEA BEN CARA ...

  it('keeps the current week and continues in the new order', () => {
    const after = applyRotation(base(), NOW, order, [LEA, CARA, BEN]);
    expect(names(after, 4)).toEqual([LEA, CARA, BEN, LEA]);
  });

  it('adds a new roommate into the next round', () => {
    const after = applyRotation(base(), NOW, order, [LEA, BEN, CARA, DAN]);
    expect(names(after, 5)).toEqual([LEA, BEN, CARA, DAN, LEA]);
  });

  it('hands the current week to the next person when its assignee leaves', () => {
    const after = applyRotation(base(), NOW, order, [BEN, CARA]);
    // Last turn before this week was Cara, so Ben is up.
    expect(names(after, 3)).toEqual([BEN, CARA, BEN]);
  });

  it('keeps past weeks and pauses unchanged', () => {
    const paused = setPaused(base(), NOW, order, [w(2)], true);
    const after = applyRotation(paused, NOW, order, [CARA, BEN, LEA]);
    expect(after.slice(0, 2)).toEqual(paused.slice(0, 2));
    expect(names(after, 4)).toEqual([LEA, CARA, 0, BEN]);
  });
});

describe('statusOf', () => {
  it('labels weeks', () => {
    const [done, missed] = history();
    expect(statusOf(done, NOW)).toBe('done');
    expect(statusOf(missed, NOW)).toBe('unconfirmed');
    expect(statusOf({ ...missed, paused: true }, NOW)).toBe('skipped');
    expect(statusOf({ ...missed, paused: true, assigneeId: null }, NOW)).toBe('paused');
    expect(statusOf({ ...missed, start: NOW }, NOW)).toBe('due');
    expect(statusOf({ ...missed, start: w(1) }, NOW)).toBe('scheduled');
    expect(statusOf({ ...missed, start: w(1), paused: true }, NOW)).toBe('paused');
  });
});

describe('dates across month and year boundaries', () => {
  it('handles December into January', () => {
    expect(weekOf(new Date(2026, 11, 31))).toBe('2026-12-28'); // Thursday
    expect(weekOf(new Date(2027, 0, 3))).toBe('2026-12-28'); // Sunday of the same week
    expect(addWeeks('2026-12-28', 1)).toBe('2027-01-04');
    expect(formatRange('2026-12-28')).toBe('28 Dec – 3 Jan');
    expect(formatRange('2026-09-28')).toMatch(/^28 Sept? – 4 Oct$/); // ICU spells it Sep or Sept
    expect(isoWeek('2026-12-28')).toBe(53);
    expect(isoWeek('2027-01-04')).toBe(1);
    expect(isoWeek('2027-12-27')).toBe(52);
  });
});

describe('shift', () => {
  it('adds exactly N weeks of delay even across an existing pause', () => {
    const base = extend(history(), order, NOW); // LEA BEN CARA LEA …
    const withBreak = setPaused(base, NOW, order, [w(2)], true); // LEA BEN – CARA LEA
    // Shifting Ben's week by 2: Ben moves two active weeks later, the existing pause stays.
    expect(names(shift(withBreak, NOW, order, w(1), 2))).toEqual([LEA, 0, 0, 0, BEN, CARA, LEA]);
  });

  it('shifting twice by 1 equals shifting once by 2', () => {
    const base = extend(history(), order, NOW);
    const twice = shift(shift(base, NOW, order, w(0), 1), NOW, order, w(0), 1);
    expect(names(twice, HORIZON_WEEKS)).toEqual(names(shift(base, NOW, order, w(0), 2), HORIZON_WEEKS));
  });
});

describe('swap', () => {
  it('refuses paused weeks and history', () => {
    const base = setPaused(extend(history(), order, NOW), NOW, order, [w(1)], true);
    expect(swap(base, NOW, w(0), w(1))).toBe(base);
    expect(swap(base, NOW, w(-1), w(0))).toBe(base);
  });
});

describe('repair', () => {
  it('reassigns weeks left with a removed roommate and keeps valid schedules as they are', () => {
    const base = extend(history(), order, NOW);
    expect(repair(base, NOW, order)).toBe(base);
    const fixed = repair(base, NOW, [BEN, CARA]); // Lea left, but her weeks were never rewritten
    expect(names(fixed, 4)).toEqual([BEN, CARA, BEN, CARA]);
    expect(fixed.slice(0, 2)).toEqual(base.slice(0, 2));
  });
});

/**
 * A flat of four over several months, crossing into the new year. After every step the
 * schedule must keep the rotation's order with no turn lost or doubled.
 */
describe('four roommates over several months', () => {
  const four = [LEA, BEN, CARA, DAN];
  const START = '2026-11-02';
  const at = (n: number) => addWeeks(START, n);
  const who = (weeks: Week[], from: number, count: number) =>
    weeks.filter((x) => x.start >= at(from)).slice(0, count).map((x) => (x.paused ? 0 : x.assigneeId));
  /** The queue of turns: assignees of all active weeks in order. */
  const queue = (weeks: Week[], from: string) => weeks.filter((x) => x.start >= from && !x.paused).map((x) => x.assigneeId);
  /** Every person gets one turn in every four consecutive active weeks. */
  const fair = (weeks: Week[], from: string) => {
    const q = queue(weeks, from);
    for (let i = 0; i + 4 <= q.length; i++) expect(new Set(q.slice(i, i + 4)).size).toBe(4);
  };
  const confirm = (weeks: Week[], start: string, by: number) =>
    weeks.map((x) => (x.start === start ? { ...x, cleanedById: by, completedAt: `${start}T18:00:00Z` } : x));

  it('rotates, swaps, pauses over Christmas and shifts without losing turns', () => {
    // November: the plan starts.
    let weeks = extend([], four, START);
    expect(who(weeks, 0, 8)).toEqual([LEA, BEN, CARA, DAN, LEA, BEN, CARA, DAN]);
    fair(weeks, START);

    // Lea cleans; Cara covers for Ben. Confirmations never move the schedule.
    weeks = confirm(weeks, at(0), LEA);
    let now = at(1);
    weeks = confirm(weeks, at(1), CARA);
    expect(who(weeks, 0, 8)).toEqual([LEA, BEN, CARA, DAN, LEA, BEN, CARA, DAN]);

    // Week 2 is now; Cara and Dan swap their weeks: only those two change.
    now = at(2);
    const swapped = swap(weeks, now, at(2), at(3));
    expect(changedWeeks(weeks, swapped).map((x) => x.start)).toEqual([at(2), at(3)]);
    weeks = swapped;
    expect(who(weeks, 2, 6)).toEqual([DAN, CARA, LEA, BEN, CARA, DAN]);

    // Dan's week goes unconfirmed; it stays unconfirmed rather than done or missed.
    now = at(3);
    expect(statusOf(weeks.find((x) => x.start === at(2))!, now)).toBe('unconfirmed');

    // Christmas and New Year off: 21 Dec – 3 Jan.
    expect(at(7)).toBe('2026-12-21');
    expect(at(8)).toBe('2026-12-28');
    const beforePause = queue(weeks, now);
    weeks = setPaused(weeks, now, four, [at(7), at(8)], true);
    expect(who(weeks, 5, 6)).toEqual([BEN, CARA, 0, 0, DAN, LEA]);
    // Same queue of turns, just later; the swap travels with it.
    expect(queue(weeks, now)).toEqual(beforePause.slice(0, queue(weeks, now).length));

    // Pausing the same weeks again changes nothing (no double shift).
    expect(setPaused(weeks, now, four, [at(7), at(8)], true)).toEqual(weeks);

    // A swap after the pause, across the new year.
    weeks = swap(weeks, now, at(9), at(10)); // 4 Jan Dan ↔ 11 Jan Lea
    expect(who(weeks, 9, 2)).toEqual([LEA, DAN]);

    // In January the flat shifts everything by one week from 18 Jan.
    now = at(9);
    weeks = extend(weeks, four, now);
    const beforeShift = weeks;
    weeks = shift(weeks, now, four, at(11), 1);
    expect(who(weeks, 9, 5)).toEqual([LEA, DAN, 0, ...who(beforeShift, 11, 2)]);
    expect(queue(weeks, at(11))).toEqual(queue(beforeShift, at(11)).slice(0, queue(weeks, at(11)).length));

    // Undoing the Christmas pause is no longer possible for past weeks: history is fixed.
    const resumed = setPaused(weeks, now, four, [at(7), at(8)], false);
    expect(resumed).toEqual(weeks);

    // Resuming the shift week pulls everyone forward again.
    expect(who(setPaused(weeks, now, four, [at(11)], false), 9, HORIZON_WEEKS)).toEqual(who(beforeShift, 9, HORIZON_WEEKS));

    // Ben moves out mid-January; his future turns go to the others, history keeps him.
    const history = weeks.filter((x) => x.start < now);
    weeks = applyRotation(weeks, now, four, [LEA, CARA, DAN]);
    expect(weeks.filter((x) => x.start < now)).toEqual(history);
    expect(queue(weeks, now)).not.toContain(BEN);
    expect(weeks.find((x) => x.start === at(1))).toEqual(history.find((x) => x.start === at(1)));

    // Everything from now on follows the new order without gaps or doubles.
    const q = queue(weeks, now);
    for (let i = 0; i + 3 <= q.length; i++) expect(new Set(q.slice(i, i + 3)).size).toBe(3);
  });

  it('keeps everyone in order across a fresh start in late December', () => {
    const weeks = extend([], four, '2026-12-21');
    expect(weeks.slice(0, 3).map((x) => x.start)).toEqual(['2026-12-21', '2026-12-28', '2027-01-04']);
    fair(weeks, '2026-12-21');
  });

  it('resuming one of several consecutive pauses only pulls turns forward by one', () => {
    let weeks = extend([], four, START);
    weeks = setPaused(weeks, START, four, [at(1), at(2), at(3)], true);
    expect(who(weeks, 0, 6)).toEqual([LEA, 0, 0, 0, BEN, CARA]);
    weeks = setPaused(weeks, START, four, [at(2)], false);
    expect(who(weeks, 0, 6)).toEqual([LEA, 0, BEN, 0, CARA, DAN]);
    fair(weeks, START);
  });
});
