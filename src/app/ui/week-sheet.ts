import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Store } from '../store';
import { formatDay, formatRange, isoWeek, weeksBetween } from '../schedule/dates';
import { canConfirm, isEditable, setPaused, shift, statusOf, swap, swapTargets } from '../schedule/schedule';
import { Avatar, Status } from './bits';

type Panel = 'swap' | 'shift' | null;

const CHEVRON = 'M9 6l6 6-6 6';

/** Bottom sheet with everything you can do to one week. */
@Component({
  selector: 'app-week-sheet',
  imports: [Avatar, Status],
  template: `
    <dialog #dialog class="sheet" (close)="store.openWeek.set(null)" (click)="onBackdrop($event)" aria-labelledby="week-title">
      @if (week(); as w) {
        <div class="grabber"></div>
        <header class="sheet-head">
          <div>
            <h2 id="week-title">{{ range(w.start) }}</h2>
            <p class="muted small head-sub">Week {{ weekNo(w.start) }} · <app-status [status]="status()!" /></p>
          </div>
          <button class="icon-btn" type="button" (click)="close()" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </header>

        <div class="sheet-body">
          <div class="person">
            @if (w.paused && w.assigneeId === null) {
              <span class="avatar" style="--s: 44px; --c: var(--paused)">–</span>
              <div><p class="person-name">No cleaning</p><p class="muted small">This week is paused.</p></div>
            } @else {
              <app-avatar [id]="w.assigneeId" [size]="44" />
              <div>
                <p class="person-name">{{ store.name(w.assigneeId) }}</p>
                <p class="muted small">
                  @if (w.completedAt) {
                    {{ w.cleanedById === w.assigneeId ? 'Cleaned' : store.name(w.cleanedById) + ' cleaned instead' }} · {{ day(w.completedAt) }}
                  } @else if (w.paused) { Skipped this week }
                  @else if (w.start === store.current()) { Cleaning this week }
                  @else if (w.start > store.current()) { {{ weeksAway(w.start) }} }
                  @else { Hasn't been confirmed }
                </p>
              </div>
            }
          </div>

          @if (w.completedAt) {
            <div class="block">
              <p class="label">Who cleaned?</p>
              <div class="chips">
                @for (id of people(); track id) {
                  <button class="chip" type="button" [attr.aria-pressed]="id === w.cleanedById" (click)="id !== w.cleanedById && store.confirm(w, id)" [disabled]="store.busy()">
                    <app-avatar [id]="id" [size]="24" />{{ store.name(id) }}
                  </button>
                }
              </div>
              <button class="link" type="button" (click)="store.unconfirm(w)" [disabled]="store.busy()">Undo confirmation</button>
            </div>
          } @else if (confirmable()) {
            <div class="block">
              <p class="label">Who cleaned?</p>
              <div class="chips">
                @for (id of people(); track id) {
                  <button class="chip" type="button" [attr.aria-pressed]="id === cleaner()" (click)="cleaner.set(id)">
                    <app-avatar [id]="id" [size]="24" />{{ store.name(id) }}
                  </button>
                }
              </div>
              <button class="btn btn-primary btn-block" type="button" (click)="store.confirm(w, cleaner()!)" [disabled]="store.busy() || cleaner() === null">
                Mark as done
              </button>
            </div>
          }

          @if (editable() || skippable() || unskippable()) {
            <ul class="menu">
              @if (editable() && !w.paused) {
                <li>
                  <button class="menu-item" type="button" [attr.aria-expanded]="panel() === 'swap'" (click)="toggle('swap')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4L4 7l3 3M4 7h12M17 20l3-3-3-3M20 17H8"/></svg>
                    Swap with another week
                    <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path [attr.d]="chevron"/></svg>
                  </button>
                  @if (panel() === 'swap') {
                    <div class="menu-panel">
                      @for (o of swapTargets(); track o.start) {
                        <button class="row" type="button" (click)="proposeSwap(o.start)">
                          <app-avatar [id]="o.assigneeId" />
                          <span class="row-main"><span class="row-title">{{ store.name(o.assigneeId) }}</span><span class="row-sub">{{ range(o.start) }}</span></span>
                        </button>
                      } @empty { <p class="muted small">No other weeks to swap with.</p> }
                    </div>
                  }
                </li>
                <li>
                  <button class="menu-item" type="button" (click)="proposePause(true)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M10 9v6M14 9v6"/></svg>
                    Pause this week
                  </button>
                </li>
              }
              @if (editable() && w.paused) {
                <li>
                  <button class="menu-item" type="button" (click)="proposePause(false)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/></svg>
                    Resume this week
                  </button>
                </li>
              }
              @if (editable()) {
                <li>
                  <button class="menu-item" type="button" [attr.aria-expanded]="panel() === 'shift'" (click)="toggle('shift')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h13M13 7l5 5-5 5M20 5v14"/></svg>
                    Shift schedule from here
                    <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path [attr.d]="chevron"/></svg>
                  </button>
                  @if (panel() === 'shift') {
                    <div class="menu-panel">
                      <p class="muted small">Every turn from this week on moves back by this many weeks. Existing pauses stay where they are.</p>
                      <div class="stepper">
                        <button class="icon-btn" type="button" (click)="shiftBy.set(shiftBy() - 1)" [disabled]="shiftBy() <= 1" aria-label="Fewer weeks">−</button>
                        <span><strong>{{ shiftBy() }}</strong> {{ shiftBy() === 1 ? 'week' : 'weeks' }}</span>
                        <button class="icon-btn" type="button" (click)="shiftBy.set(shiftBy() + 1)" [disabled]="shiftBy() >= 8" aria-label="More weeks">+</button>
                        <button class="btn" type="button" (click)="proposeShift()">Preview</button>
                      </div>
                    </div>
                  }
                </li>
              }
              @if (skippable()) {
                <li>
                  <button class="menu-item" type="button" (click)="store.setSkipped(w, true)" [disabled]="store.busy()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/></svg>
                    Mark as skipped
                  </button>
                </li>
              }
              @if (unskippable()) {
                <li>
                  <button class="menu-item" type="button" (click)="store.setSkipped(w, false)" [disabled]="store.busy()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 0 1 0 10h-3"/></svg>
                    Remove skip
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      }
    </dialog>
  `,
  styles: `
    .head-sub { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
    .person { display: flex; align-items: center; gap: 14px; }
    .person-name { font-size: 18px; font-weight: 650; letter-spacing: -0.01em; }
    .block { display: grid; gap: 12px; justify-items: start; }
    .block .btn-block { justify-self: stretch; }
    .label { font-size: 13px; font-weight: 600; color: var(--muted); }
    .stepper { display: flex; align-items: center; gap: 6px; }
    .stepper .icon-btn { font-size: 20px; border: 1px solid var(--border); }
    .stepper span { min-width: 76px; text-align: center; }
    .stepper .btn { margin-left: auto; min-height: 38px; }
    .menu-panel .row { padding: 8px; }
  `,
})
export class WeekSheet {
  protected readonly store = inject(Store);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly panel = signal<Panel>(null);
  protected readonly shiftBy = signal(1);
  protected readonly cleaner = signal<number | null>(null);
  protected readonly chevron = CHEVRON;

  protected readonly week = computed(() => {
    const start = this.store.openWeek();
    return start ? (this.store.week(start) ?? null) : null;
  });
  protected readonly status = computed(() => (this.week() ? statusOf(this.week()!, this.store.current()) : null));
  protected readonly editable = computed(() => !!this.week() && isEditable(this.week()!, this.store.current()));
  protected readonly confirmable = computed(() => !!this.week() && canConfirm(this.week()!, this.store.current()));

  /** Past turns nobody confirmed can be let go; a planned pause in the past stays as it is. */
  protected readonly skippable = computed(() => {
    const w = this.week();
    return !!w && w.start < this.store.current() && !w.completedAt && !w.paused;
  });
  protected readonly unskippable = computed(() => this.status() === 'skipped');

  /** Scheduled person first, then everyone else in the rotation (plus whoever cleaned, if they've left). */
  protected readonly people = computed(() => {
    const w = this.week();
    const first = [w?.assigneeId, w?.cleanedById].filter((id): id is number => id != null);
    return [...new Set([...first.slice(0, 1), ...this.store.order(), ...first])];
  });
  protected readonly swapTargets = computed(() => {
    const w = this.week();
    return w ? swapTargets(this.store.weeks(), this.store.current(), w).slice(0, 8) : [];
  });

  protected range = formatRange;
  protected weekNo = isoWeek;
  protected weeksAway = (start: string) => {
    const n = weeksBetween(this.store.current(), start);
    return n === 1 ? 'Next week' : `In ${n} weeks`;
  };
  protected day = (iso: string) => formatDay(new Date(iso));

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      const start = this.store.openWeek();
      if (start && !dialog.open) {
        this.panel.set(null);
        this.shiftBy.set(1);
        this.cleaner.set(this.store.week(start)?.assigneeId ?? this.store.order()[0] ?? null);
        dialog.showModal();
      } else if (!start && dialog.open) {
        dialog.close();
      }
    });
  }

  protected close() {
    this.store.openWeek.set(null);
  }

  protected onBackdrop(event: MouseEvent) {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  protected toggle(panel: Panel) {
    this.panel.set(this.panel() === panel ? null : panel);
  }

  protected proposeSwap(other: string) {
    const w = this.week()!;
    this.store.propose({
      title: `Swap ${this.store.name(w.assigneeId)} and ${this.store.name(this.store.week(other)?.assigneeId)}`,
      after: swap(this.store.weeks(), this.store.current(), w.start, other),
    });
  }

  protected proposePause(paused: boolean) {
    const w = this.week()!;
    this.store.propose({
      title: `${paused ? 'Pause' : 'Resume'} ${formatRange(w.start)}`,
      after: setPaused(this.store.weeks(), this.store.current(), this.store.order(), [w.start], paused),
    });
  }

  protected proposeShift() {
    const n = this.shiftBy();
    this.store.propose({
      title: `Shift schedule by ${n} ${n === 1 ? 'week' : 'weeks'}`,
      after: shift(this.store.weeks(), this.store.current(), this.store.order(), this.week()!.start, n),
    });
  }
}
