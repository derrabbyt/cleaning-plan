import { Injectable } from '@angular/core';
import { neon } from '@neondatabase/serverless';
import { DATABASE_URL } from './db-config.generated';
import { Roommate, Week } from './schedule/schedule';

export interface RoommateDraft {
  /** Negative ids are roommates that don't exist yet. */
  id: number;
  name: string;
}

// Queries Neon directly over HTTP from the browser as the least-privilege `cleaning_app` role.
@Injectable({ providedIn: 'root' })
export class Db {
  private readonly sql = neon(DATABASE_URL, { disableWarningInBrowsers: true });

  async load(): Promise<{ roommates: Roommate[]; weeks: Week[] }> {
    const [roommates, weeks] = await this.sql.transaction(
      [
        this.sql`SELECT id, name, position, active FROM roommates ORDER BY position, id`,
        this.sql`SELECT week_start::text AS start, assignee_id, paused, cleaned_by_id, completed_at
                 FROM weeks ORDER BY week_start`,
      ],
      { readOnly: true },
    );
    return {
      roommates: roommates as Roommate[],
      weeks: weeks.map((r) => ({
        start: r['start'],
        assigneeId: r['assignee_id'],
        paused: r['paused'],
        cleanedById: r['cleaned_by_id'],
        completedAt: r['completed_at'] ? new Date(r['completed_at']).toISOString() : null,
      })),
    };
  }

  /** Adds weeks at the end of the schedule. Weeks someone else added first are kept. */
  async addWeeks(weeks: Week[]): Promise<void> {
    if (!weeks.length) return;
    await this.sql`
      INSERT INTO weeks (week_start, assignee_id, paused)
      SELECT * FROM unnest(${weeks.map((w) => w.start)}::date[], ${weeks.map((w) => w.assigneeId)}::int[],
                           ${weeks.map((w) => w.paused)}::bool[])
      ON CONFLICT (week_start) DO NOTHING`;
  }

  /**
   * Rewrites assignments from `before` (what the user saw) to `after`. Fails with a
   * ConflictError if any of these weeks changed in the meantime, writing nothing.
   */
  async saveWeeks(before: Week[], after: Week[]): Promise<void> {
    const old = new Map(before.map((w) => [w.start, w]));
    const changed = after.filter((w) => {
      const b = old.get(w.start);
      return b && (b.assigneeId !== w.assigneeId || b.paused !== w.paused);
    });
    if (!changed.length) return;
    const was = changed.map((w) => old.get(w.start)!);
    await guard(this.sql`
      SELECT save_weeks(${changed.map((w) => w.start)}::date[], ${was.map((w) => w.assigneeId)}::int[],
                        ${was.map((w) => w.paused)}::bool[], ${changed.map((w) => w.assigneeId)}::int[],
                        ${changed.map((w) => w.paused)}::bool[])`);
  }

  /**
   * Records who cleaned. `seen` is who the user saw as the cleaner (null if open), so a
   * repeated or outdated tap can't overwrite someone else's confirmation.
   */
  async confirm(start: string, cleanedById: number, seen: number | null): Promise<void> {
    await expectRow(this.sql`
      UPDATE weeks SET cleaned_by_id = ${cleanedById}, completed_at = coalesce(completed_at, now())
      WHERE week_start = ${start} AND NOT paused AND cleaned_by_id IS NOT DISTINCT FROM ${seen}::int
      RETURNING 1`);
  }

  async unconfirm(start: string, seen: number): Promise<void> {
    await expectRow(this.sql`
      UPDATE weeks SET cleaned_by_id = NULL, completed_at = NULL
      WHERE week_start = ${start} AND cleaned_by_id = ${seen} RETURNING 1`);
  }

  /** Marks a past, unconfirmed turn as skipped (or not). Doesn't affect the rotation. */
  async setSkipped(start: string, skipped: boolean): Promise<void> {
    await expectRow(this.sql`
      UPDATE weeks SET paused = ${skipped}
      WHERE week_start = ${start} AND completed_at IS NULL AND paused = ${!skipped} AND assignee_id IS NOT NULL
      RETURNING 1`);
  }

  /**
   * Saves the rotation: `order` is the new active list (renames included), anyone else
   * in `seen` is removed. Returns a map from draft ids to real ids.
   */
  async saveRotation(seen: number[], order: RoommateDraft[]): Promise<Map<number, number>> {
    const [row] = await guard(this.sql`
      SELECT save_rotation(${seen}::int[], ${order.map((r) => r.id)}::int[], ${order.map((r) => r.name)}::text[]) AS ids`);
    const ids: number[] = row['ids'];
    return new Map(order.map((r, i) => [r.id, ids[i]]));
  }
}

/** Someone else changed the plan since it was loaded; nothing was written. */
export class ConflictError extends Error {
  constructor() {
    super('Someone else just changed the plan');
  }
}

async function guard<T>(query: Promise<T>): Promise<T> {
  try {
    return await query;
  } catch (e) {
    if ((e as { code?: string }).code === 'CP001') throw new ConflictError();
    throw e;
  }
}

async function expectRow(query: Promise<unknown[]>): Promise<void> {
  if (!(await query).length) throw new ConflictError();
}
