import { Injectable, computed, inject, signal } from '@angular/core';
import { ConflictError, Db, RoommateDraft } from './db';
import { addWeeks, formatRange, weekOf } from './schedule/dates';
import { Roommate, Week, applyRotation, changedWeeks, extend, isEditable, repair } from './schedule/schedule';

export interface Toast {
  id: number;
  message: string;
  undo?: () => Promise<void>;
}

/** A schedule change waiting for the user to approve its preview. */
export interface PendingChange {
  title: string;
  /** The schedule the change was computed from; set by `propose`. */
  before: Week[];
  after: Week[];
  /** Overrides the default "save these weeks" action (used for rotation edits). */
  apply?: () => Promise<void>;
  /** Display names for roommates that don't exist yet. */
  extraNames?: Map<number, string>;
}

const PALETTE = ['#5b7fd6', '#d9825b', '#4f9d7e', '#a46fc9', '#c9a23f', '#3f9db3', '#d06b93', '#7d8a99'];

@Injectable({ providedIn: 'root' })
export class Store {
  private readonly db = inject(Db);

  readonly roommates = signal<Roommate[]>([]);
  readonly weeks = signal<Week[]>([]);
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly current = signal(weekOf());

  /** Week open in the week sheet, and change open in the preview dialog. */
  readonly openWeek = signal<string | null>(null);
  readonly pending = signal<PendingChange | null>(null);
  readonly toast = signal<Toast | null>(null);

  readonly rotation = computed(() => this.roommates().filter((r) => r.active));
  readonly order = computed(() => this.rotation().map((r) => r.id));
  private readonly byId = computed(() => new Map(this.roommates().map((r) => [r.id, r])));

  readonly thisWeek = computed(() => this.weeks().find((w) => w.start === this.current()) ?? null);
  readonly upcoming = computed(() => this.weeks().filter((w) => w.start > this.current()));
  readonly nextTurn = computed(() => this.upcoming().find((w) => !w.paused && w.assigneeId !== null) ?? null);
  /** Recent past weeks nobody confirmed. */
  readonly overdue = computed(() =>
    this.weeks().filter((w) => w.start < this.current() && w.start >= addWeeks(this.current(), -4) && !w.paused && !w.completedAt),
  );

  private toastTimer?: ReturnType<typeof setTimeout>;

  name(id: number | null | undefined): string {
    return id == null ? '—' : (this.byId().get(id)?.name ?? this.pending()?.extraNames?.get(id) ?? 'New roommate');
  }

  color(id: number | null | undefined): string {
    return id == null ? 'var(--muted)' : PALETTE[Math.abs(id) % PALETTE.length];
  }

  week(start: string): Week | undefined {
    return this.weeks().find((w) => w.start === start);
  }

  async load(): Promise<void> {
    const current = weekOf();
    try {
      let { roommates, weeks } = await this.db.load();
      const order = roommates.filter((r) => r.active).map((r) => r.id);
      const fixed = repair(weeks, current, order);
      const missing = changedWeeks(fixed, extend(fixed, order, current));
      if (fixed !== weeks || missing.length) {
        if (fixed !== weeks) await this.db.saveWeeks(weeks, fixed).catch(ignoreConflict);
        await this.db.addWeeks(missing);
        ({ roommates, weeks } = await this.db.load());
      }
      // Only replace what actually changed, so open views and drafts aren't reset.
      if (current !== this.current()) this.current.set(current);
      if (!same(roommates, this.roommates())) this.roommates.set(roommates);
      if (!same(weeks, this.weeks())) this.weeks.set(weeks);
      this.loadError.set(null);
    } catch (e) {
      this.loadError.set(errorText(e));
    } finally {
      this.loaded.set(true);
    }
  }

  /** Opens the preview for a schedule change. */
  propose(change: Omit<PendingChange, 'before'>): void {
    this.openWeek.set(null);
    this.pending.set({ ...change, before: this.weeks() });
  }

  async applyPending(): Promise<void> {
    const change = this.pending();
    if (!change) return;
    const { before, after } = change;
    const ok = await this.run(async () => {
      if (change.apply) return change.apply();
      await this.db.saveWeeks(before, after);
    });
    this.pending.set(null);
    if (!ok) return;
    if (change.apply) return this.notify('Rotation updated');
    // Undo puts the previous assignments back on the weeks that are still editable,
    // provided nobody changed them in the meantime.
    const revert = before.filter((w) => isEditable(w, this.current()));
    this.notify('Schedule updated', () => this.db.saveWeeks(after, revert));
  }

  async confirm(week: Week, cleanedById: number): Promise<void> {
    const seen = week.cleanedById;
    if (seen === cleanedById) return;
    if (!(await this.run(() => this.db.confirm(week.start, cleanedById, seen)))) return;
    const who = this.name(cleanedById);
    this.notify(
      seen === null ? `Done — thanks, ${who}!` : `Updated: ${who} cleaned`,
      seen === null
        ? () => this.db.unconfirm(week.start, cleanedById)
        : () => this.db.confirm(week.start, seen, cleanedById),
    );
  }

  async unconfirm(week: Week): Promise<void> {
    const seen = week.cleanedById;
    if (seen === null) return;
    if (!(await this.run(() => this.db.unconfirm(week.start, seen)))) return;
    this.notify(`${formatRange(week.start)} is open again`, () => this.db.confirm(week.start, seen, null));
  }

  async setSkipped(week: Week, skipped: boolean): Promise<void> {
    if (!(await this.run(() => this.db.setSkipped(week.start, skipped)))) return;
    this.notify(skipped ? 'Marked as skipped' : 'Skip removed', () => this.db.setSkipped(week.start, !skipped));
  }

  /** Previews (and on approval saves) a new rotation. */
  proposeRotation(draft: RoommateDraft[]): void {
    const oldOrder = this.order();
    const newOrder = draft.map((r) => r.id);
    const orderChanged = oldOrder.join() !== newOrder.join();
    const apply = async () => {
      const ids = await this.db.saveRotation(oldOrder, draft);
      if (!orderChanged) return;
      // Rebuild from the latest weeks, so nothing a roommate just changed is overwritten.
      // The rotation itself is already saved, so retry if a week changes underneath us.
      const realOrder = newOrder.map((id) => ids.get(id)!);
      for (let attempt = 1; ; attempt++) {
        const { weeks } = await this.db.load();
        try {
          return await this.db.saveWeeks(weeks, applyRotation(weeks, this.current(), oldOrder, realOrder));
        } catch (e) {
          if (!(e instanceof ConflictError) || attempt === 3) throw e;
        }
      }
    };
    if (!orderChanged) {
      // Renames only: nothing to preview.
      void this.run(apply).then((ok) => ok && this.notify('Names saved'));
      return;
    }
    this.propose({
      title: 'New rotation',
      after: applyRotation(this.weeks(), this.current(), oldOrder, newOrder),
      apply,
      extraNames: new Map(draft.filter((r) => r.id < 0).map((r) => [r.id, r.name])),
    });
  }

  dismissToast(): void {
    clearTimeout(this.toastTimer);
    this.toast.set(null);
  }

  async undoToast(): Promise<void> {
    const undo = this.toast()?.undo;
    this.dismissToast();
    if (undo && (await this.run(undo))) this.notify('Undone');
  }

  private notify(message: string, undo?: () => Promise<void>): void {
    clearTimeout(this.toastTimer);
    this.toast.set({ id: Date.now(), message, undo });
    this.toastTimer = setTimeout(() => this.toast.set(null), undo ? 6000 : 2500);
  }

  /** Runs a write, reloads, and reports errors. Returns whether it succeeded. */
  private async run(action: () => Promise<unknown>): Promise<boolean> {
    this.busy.set(true);
    try {
      await action();
      return true;
    } catch (e) {
      this.notify(
        e instanceof ConflictError ? 'Someone else just changed this. Showing the latest plan.' : `Couldn't save: ${errorText(e)}`,
      );
      return false;
    } finally {
      await this.load();
      this.busy.set(false);
    }
  }
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function ignoreConflict(e: unknown): void {
  if (!(e instanceof ConflictError)) throw e;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
