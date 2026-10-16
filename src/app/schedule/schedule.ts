import { WeekKey, addWeeks } from './dates';

export interface Roommate {
  id: number;
  name: string;
  position: number;
  active: boolean;
}

export interface Week {
  start: WeekKey;
  /** Who is scheduled. Null for paused weeks created by the scheduler. */
  assigneeId: number | null;
  paused: boolean;
  /** Who actually cleaned; set together with completedAt. */
  cleanedById: number | null;
  completedAt: string | null;
}

export type WeekStatus = 'done' | 'due' | 'unconfirmed' | 'scheduled' | 'paused' | 'skipped';

/** How far ahead the schedule is materialised. */
export const HORIZON_WEEKS = 26;

export function statusOf(week: Week, current: WeekKey): WeekStatus {
  if (week.completedAt) return 'done';
  // A planned pause has nobody assigned; a skip is a past turn that was explicitly let go.
  if (week.paused) return week.start < current && week.assigneeId !== null ? 'skipped' : 'paused';
  if (week.start < current) return 'unconfirmed';
  return week.start === current ? 'due' : 'scheduled';
}

/** Schedule changes only ever touch the current and future weeks that aren't confirmed yet. */
export function isEditable(week: Week, current: WeekKey): boolean {
  return !week.completedAt && week.start >= current;
}

export function canConfirm(week: Week, current: WeekKey): boolean {
  return !week.paused && week.start <= current;
}

/**
 * The person after `id` in `order`. If `id` has left the rotation, continue with
 * whoever followed them in `previousOrder`, so nobody skips or repeats a turn.
 */
function nextAfter(order: number[], id: number | null, previousOrder: number[] = order): number | null {
  if (!order.length) return null;
  if (id === null) return order[0];
  const index = order.indexOf(id);
  if (index >= 0) return order[(index + 1) % order.length];
  const oldIndex = previousOrder.indexOf(id);
  for (let step = 1; oldIndex >= 0 && step <= previousOrder.length; step++) {
    const candidate = previousOrder[(oldIndex + step) % previousOrder.length];
    if (order.includes(candidate)) return candidate;
  }
  return order[0];
}

function lastTurn(weeks: Week[]): number | null {
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (!weeks[i].paused && weeks[i].assigneeId !== null) return weeks[i].assigneeId;
  }
  return null;
}

/** Appends weeks so the schedule always reaches HORIZON_WEEKS past the current week. */
export function extend(weeks: Week[], order: number[], current: WeekKey): Week[] {
  if (!order.length) return weeks;
  const result = [...weeks];
  const end = addWeeks(current, HORIZON_WEEKS);
  let previous = lastTurn(result);
  let key = result.length ? addWeeks(result[result.length - 1].start, 1) : current;
  for (; key <= end; key = addWeeks(key, 1)) {
    previous = nextAfter(order, previous);
    result.push({ start: key, assigneeId: previous, paused: false, cleanedById: null, completedAt: null });
  }
  return result;
}

/**
 * Re-lays the queue of turns from `from` onwards over the non-paused editable weeks,
 * after applying `pauses`. Pausing pushes later turns back; resuming pulls them forward.
 */
function relayout(weeks: Week[], current: WeekKey, order: number[], from: WeekKey, pauses: Map<WeekKey, boolean>): Week[] {
  const inRange = (w: Week) => w.start >= from && isEditable(w, current);
  const turns = weeks.filter((w) => inRange(w) && !w.paused).map((w) => w.assigneeId);
  let previous: number | null = null;
  let next = 0;
  return weeks.map((week) => {
    if (!inRange(week)) {
      if (!week.paused && week.assigneeId !== null) previous = week.assigneeId;
      return week;
    }
    if (pauses.get(week.start) ?? week.paused) return { ...week, paused: true, assigneeId: null };
    const assigneeId = next < turns.length ? turns[next++] : nextAfter(order, previous);
    previous = assigneeId;
    return { ...week, paused: false, assigneeId };
  });
}

export function setPaused(weeks: Week[], current: WeekKey, order: number[], keys: WeekKey[], paused: boolean): Week[] {
  if (!keys.length) return weeks;
  const from = [...keys].sort()[0];
  return relayout(weeks, current, order, from, new Map(keys.map((k) => [k, paused])));
}

/**
 * Delays every turn from `from` on by `count` weeks by pausing the next `count` active
 * weeks. Weeks that are already paused stay paused and don't count towards `count`,
 * so a shift always adds exactly `count` weeks of delay.
 */
export function shift(weeks: Week[], current: WeekKey, order: number[], from: WeekKey, count: number): Week[] {
  const keys = weeks
    .filter((w) => w.start >= from && isEditable(w, current) && !w.paused)
    .slice(0, count)
    .map((w) => w.start);
  return setPaused(weeks, current, order, keys, true);
}

/** Weeks that can trade places with `week`: other active, editable weeks with someone else on them. */
export function swapTargets(weeks: Week[], current: WeekKey, week: Week): Week[] {
  if (!isEditable(week, current) || week.paused) return [];
  return weeks.filter((o) => o.start !== week.start && isEditable(o, current) && !o.paused && o.assigneeId !== week.assigneeId);
}

/** Exchanges the people on two weeks. Paused or confirmed weeks can't be swapped. */
export function swap(weeks: Week[], current: WeekKey, a: WeekKey, b: WeekKey): Week[] {
  const first = weeks.find((w) => w.start === a);
  const second = weeks.find((w) => w.start === b);
  if (!first || !second || !swapTargets(weeks, current, first).includes(second)) return weeks;
  return weeks.map((w) =>
    w.start === a ? { ...w, assigneeId: second.assigneeId } : w.start === b ? { ...w, assigneeId: first.assigneeId } : w,
  );
}

/**
 * Rebuilds the editable part of the schedule after roommates were added, removed or
 * reordered. An unconfirmed current week keeps its person if they're still in the rotation.
 */
export function applyRotation(weeks: Week[], current: WeekKey, oldOrder: number[], newOrder: number[]): Week[] {
  const now = weeks.find((w) => w.start === current);
  const keepCurrent =
    !!now && isEditable(now, current) && !now.paused && now.assigneeId !== null && newOrder.includes(now.assigneeId);
  const from = keepCurrent ? addWeeks(current, 1) : current;
  let previous: number | null = null;
  return weeks.map((week) => {
    if (week.start < from || !isEditable(week, current) || week.paused) {
      if (!week.paused && week.assigneeId !== null) previous = week.assigneeId;
      return week;
    }
    previous = nextAfter(newOrder, previous, oldOrder);
    return { ...week, assigneeId: previous };
  });
}

/**
 * Makes sure every editable, active week has someone from the rotation on it (e.g. after
 * a roommate was removed but the schedule couldn't be saved). Valid schedules come back as is.
 */
export function repair(weeks: Week[], current: WeekKey, order: number[]): Week[] {
  if (!order.length) return weeks;
  const invalid = weeks.some(
    (w) => isEditable(w, current) && !w.paused && (w.assigneeId === null || !order.includes(w.assigneeId)),
  );
  return invalid ? applyRotation(weeks, current, order, order) : weeks;
}

/** Weeks in `after` whose assignment differs from (or is missing in) `before`. */
export function changedWeeks(before: Week[], after: Week[]): Week[] {
  const old = new Map(before.map((w) => [w.start, w]));
  return after.filter((w) => {
    const b = old.get(w.start);
    return !b || b.assigneeId !== w.assigneeId || b.paused !== w.paused;
  });
}
