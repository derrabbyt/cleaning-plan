import { Component, computed, inject, signal } from '@angular/core';
import { Store } from '../store';
import { WeekKey, addDays, addWeeks, formatMonth, formatRange, isoWeek, toDate, weekOf } from '../schedule/dates';
import { Week, isEditable, setPaused, statusOf } from '../schedule/schedule';
import { Avatar, Status } from '../ui/bits';

const HISTORY_WEEKS = 8;

@Component({
  selector: 'app-calendar',
  imports: [Avatar, Status],
  template: `
    <div class="page">
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="View">
          <button type="button" [attr.aria-pressed]="view() === 'weeks'" (click)="view.set('weeks')">Weeks</button>
          <button type="button" [attr.aria-pressed]="view() === 'month'" (click)="view.set('month'); selecting.set(false)">Month</button>
        </div>
        @if (view() === 'weeks') {
          <button class="link" type="button" (click)="toggleSelecting()">{{ selecting() ? 'Cancel' : 'Pause weeks…' }}</button>
        }
      </div>

      @if (view() === 'weeks') {
        @for (group of groups(); track group.month) {
          <h2 class="section-title">{{ group.month }}</h2>
          <ul class="card rows">
            @for (w of group.weeks; track w.start) {
              <li>
                <button class="row" type="button" [disabled]="selecting() && !selectable(w)"
                  [class.is-current]="w.start === store.current()" [class.is-paused]="w.paused" [class.is-past]="w.start < store.current()"
                  [attr.aria-pressed]="selecting() ? selected().has(w.start) : null" (click)="onRow(w)">
                  @if (selecting()) {
                    <span class="check" [class.on]="selected().has(w.start)" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
                    </span>
                  }
                  <span class="date"><strong>{{ range(w.start) }}</strong><span>W{{ weekNo(w.start) }}</span></span>
                  <span class="row-main who">
                    @if (w.paused && w.assigneeId === null) {
                      <span class="row-title">No cleaning</span>
                    } @else {
                      <app-avatar [id]="w.completedAt ? w.cleanedById : w.assigneeId" [size]="24" />
                      <span class="row-title">
                        {{ store.name(w.completedAt ? w.cleanedById : w.assigneeId) }}
                        @if (w.completedAt && w.cleanedById !== w.assigneeId) { <span class="for">for {{ store.name(w.assigneeId) }}</span> }
                      </span>
                    }
                  </span>
                  <app-status [status]="status(w)" />
                </button>
              </li>
            }
          </ul>
        }
      } @else {
        <section class="card month">
          <div class="month-head">
            <button class="icon-btn" type="button" (click)="moveMonth(-1)" aria-label="Previous month">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>
            </button>
            <h2>{{ monthTitle() }}</h2>
            <button class="icon-btn" type="button" (click)="moveMonth(1)" aria-label="Next month">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>
            </button>
          </div>
          <div class="dow" aria-hidden="true"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
          @for (mw of monthWeeks(); track mw.start) {
            <button class="mweek" type="button" [class]="'mweek m-' + (mw.week ? status(mw.week) : 'none')"
              [class.is-current]="mw.start === store.current()" [disabled]="!mw.week" (click)="store.openWeek.set(mw.start)">
              <span class="days">
                @for (d of mw.days; track d.key) {
                  <span [class.out]="!d.inMonth" [class.today]="d.key === today">{{ d.label }}</span>
                }
              </span>
              @if (mw.week; as w) {
                <span class="mwho">
                  @if (w.paused && w.assigneeId === null) { <span class="muted">No cleaning</span> }
                  @else { <app-avatar [id]="w.completedAt ? w.cleanedById : w.assigneeId" [size]="20" />{{ store.name(w.completedAt ? w.cleanedById : w.assigneeId) }} }
                  <app-status [status]="status(w)" />
                </span>
              }
            </button>
          }
        </section>
      }
    </div>

    @if (selecting()) {
      <div class="select-bar card">
        <span>{{ selected().size ? selected().size + ' selected' : 'Tap weeks to select' }}</span>
        <button class="btn btn-primary" type="button" [disabled]="!selected().size" (click)="proposePause()">
          {{ allPaused() ? 'Resume' : 'Pause' }} {{ selected().size || '' }}
        </button>
      </div>
    }
  `,
  styles: `
    .toolbar { display: flex; align-items: center; justify-content: space-between; }
    .rows .row { gap: 10px; }
    .date { display: grid; width: 7.6em; flex: none; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .date strong { font-size: 13.5px; font-weight: 600; }
    .date span { font-size: 12px; color: var(--faint); }
    .who { display: flex; align-items: center; gap: 8px; }
    .for { font-weight: 450; color: var(--muted); font-size: 13px; }
    .is-past .date strong { color: var(--muted); }
    .check { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; border: 1.5px solid var(--border); color: transparent; flex: none; transition: all 0.15s; }
    .check.on { background: var(--accent); border-color: var(--accent); color: white; }
    .check svg { width: 14px; }
    .row:disabled { opacity: 0.4; }
    .select-bar { position: fixed; z-index: 11; left: 16px; right: 16px; bottom: calc(80px + env(safe-area-inset-bottom)); max-width: 528px; margin: 0 auto;
      display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 10px 10px 16px; animation: fade-in 0.2s var(--ease); }
    @media (min-width: 720px) { .select-bar { bottom: 24px; } }
    .month { padding: 10px 10px 12px; display: grid; gap: 4px; }
    .month-head { display: flex; align-items: center; justify-content: space-between; padding: 0 0 6px; }
    .month-head h2 { font-size: 16px; font-weight: 650; }
    .dow, .days { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; }
    .dow { font-size: 11.5px; font-weight: 600; color: var(--faint); padding-bottom: 2px; }
    .mweek { display: grid; gap: 4px; padding: 6px 0 8px; border: 0; border-radius: 12px; background: none; border-left: 3px solid transparent; transition: background 0.15s; }
    .mweek:hover:not(:disabled) { background: var(--surface-2); }
    .mweek.is-current { background: var(--surface-2); }
    .days span { font-size: 14px; font-variant-numeric: tabular-nums; padding: 2px 0; }
    .days .out { color: var(--faint); }
    .days .today { font-weight: 700; color: white; background: var(--accent); border-radius: 8px; margin: 0 auto; width: 28px; }
    .mwho { display: flex; align-items: center; gap: 6px; padding: 0 10px; font-size: 13.5px; font-weight: 550; }
    .mwho app-status { margin-left: auto; }
    .m-done { border-left-color: var(--done); }
    .m-due { border-left-color: var(--accent); }
    .m-unconfirmed { border-left-color: var(--warn); }
    .m-paused, .m-skipped { border-left-color: var(--paused); background: repeating-linear-gradient(135deg, transparent 0 6px, var(--paused-bg) 6px 8px); }
    .m-scheduled { border-left-color: var(--border); }
  `,
})
export class Calendar {
  protected readonly store = inject(Store);

  protected readonly view = signal<'weeks' | 'month'>('weeks');
  protected readonly selecting = signal(false);
  protected readonly selected = signal(new Set<WeekKey>());
  protected readonly month = signal(this.store.current().slice(0, 7) + '-01');
  protected readonly today = localToday();

  protected readonly groups = computed(() => {
    const from = addWeeks(this.store.current(), -HISTORY_WEEKS);
    const groups: { month: string; weeks: Week[] }[] = [];
    for (const w of this.store.weeks().filter((x) => x.start >= from)) {
      const month = formatMonth(w.start);
      if (groups.at(-1)?.month !== month) groups.push({ month, weeks: [] });
      groups.at(-1)!.weeks.push(w);
    }
    return groups;
  });

  protected readonly monthTitle = computed(() => formatMonth(this.month()));
  protected readonly monthWeeks = computed(() => {
    const first = this.month();
    const d = toDate(first);
    const last = addDays(first, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - 1);
    const rows = [];
    for (let start = weekOf(d); start <= last; start = addWeeks(start, 1)) {
      rows.push({
        start,
        week: this.store.week(start),
        days: Array.from({ length: 7 }, (_, i) => {
          const key = addDays(start, i);
          return { key, label: Number(key.slice(8)), inMonth: key.slice(0, 7) === first.slice(0, 7) };
        }),
      });
    }
    return rows;
  });

  protected readonly allPaused = computed(() => [...this.selected()].every((k) => this.store.week(k)?.paused));

  protected range = formatRange;
  protected weekNo = isoWeek;
  protected status = (w: Week) => statusOf(w, this.store.current());
  protected selectable = (w: Week) => isEditable(w, this.store.current());

  protected onRow(w: Week) {
    if (!this.selecting()) return this.store.openWeek.set(w.start);
    const next = new Set(this.selected());
    if (!next.delete(w.start)) next.add(w.start);
    this.selected.set(next);
  }

  protected toggleSelecting() {
    this.selecting.set(!this.selecting());
    this.selected.set(new Set());
  }

  protected moveMonth(delta: number) {
    const d = toDate(this.month());
    const next = new Date(d.getFullYear(), d.getMonth() + delta, 1);
    this.month.set(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`);
  }

  protected proposePause() {
    const keys = [...this.selected()].sort();
    const pause = !this.allPaused();
    // When mixing paused and unpaused weeks, only the unpaused ones change.
    const targets = pause ? keys.filter((k) => !this.store.week(k)?.paused) : keys;
    this.store.propose({
      title: `${pause ? 'Pause' : 'Resume'} ${targets.length} ${targets.length === 1 ? 'week' : 'weeks'}`,
      after: setPaused(this.store.weeks(), this.store.current(), this.store.order(), targets, pause),
    });
    this.selecting.set(false);
    this.selected.set(new Set());
  }
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
