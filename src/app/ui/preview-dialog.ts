import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { Store } from '../store';
import { formatRange } from '../schedule/dates';
import { Week, changedWeeks } from '../schedule/schedule';
import { Avatar } from './bits';

const MAX_ROWS = 8;

interface Row {
  start: string;
  before: Week | undefined;
  after: Week;
  changed: boolean;
}

/** Before/after timeline for a pending schedule change, with Apply / Cancel. */
@Component({
  selector: 'app-preview-dialog',
  imports: [Avatar],
  template: `
    <dialog #dialog class="sheet" (close)="store.pending.set(null)" (click)="onBackdrop($event)" aria-labelledby="preview-title">
      @if (store.pending(); as change) {
        <div class="grabber"></div>
        <header class="sheet-head">
          <div>
            <h2 id="preview-title">{{ change.title }}</h2>
            <p class="muted small">{{ summary() }}</p>
          </div>
        </header>
        <div class="sheet-body">
          @if (rows().length) {
            <ol class="timeline">
              <li class="tl-head" aria-hidden="true"><span></span><span>Before</span><span></span><span>After</span></li>
              @for (r of rows(); track r.start) {
                <li [class.changed]="r.changed">
                  <span class="tl-date">{{ range(r.start) }}</span>
                  <span class="tl-cell">
                    @if (!r.before) { <span class="muted">—</span> }
                    @else if (r.before.paused) { <span class="tag-paused">Paused</span> }
                    @else { <app-avatar [id]="r.before.assigneeId" [size]="22" /><span class="nm">{{ store.name(r.before.assigneeId) }}</span> }
                  </span>
                  <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  <span class="tl-cell">
                    @if (r.after.paused) { <span class="tag-paused">Paused</span> }
                    @else { <app-avatar [id]="r.after.assigneeId" [size]="22" /><span class="nm">{{ store.name(r.after.assigneeId) }}</span> }
                  </span>
                </li>
              }
            </ol>
            @if (hidden() > 0) {
              <p class="muted small">…and {{ hidden() }} more {{ hidden() === 1 ? 'week' : 'weeks' }} further out.</p>
            }
          } @else {
            <p class="muted">Nothing changes in the schedule.</p>
          }
          <p class="muted small safe">Confirmed weeks are never changed. You can undo this right after applying.</p>
          <div class="actions">
            <button class="btn" type="button" (click)="store.pending.set(null)">Cancel</button>
            <button class="btn btn-primary" type="button" (click)="store.applyPending()" [disabled]="store.busy()">
              {{ store.busy() ? 'Saving…' : 'Apply' }}
            </button>
          </div>
        </div>
      }
    </dialog>
  `,
  styles: `
    .timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
    .timeline li {
      display: grid; grid-template-columns: 7.6em 1fr 14px 1fr; align-items: center; gap: 8px;
      padding: 7px 10px; border-radius: 10px; color: var(--faint); font-size: 14px;
    }
    .timeline li.changed { background: var(--surface-2); color: var(--text); }
    .timeline li:not(.changed) .avatar { filter: grayscale(1); opacity: 0.6; }
    .tl-head { padding-block: 0 !important; font-size: 11.5px !important; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
    .tl-date { font-size: 13px; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .tl-cell { display: flex; align-items: center; gap: 7px; min-width: 0; }
    .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 550; }
    .arrow { width: 14px; height: 14px; opacity: 0.5; }
    .tag-paused { font-size: 12.5px; font-weight: 600; padding: 2px 8px; border-radius: 6px; color: var(--paused);
      background: repeating-linear-gradient(135deg, var(--paused-bg) 0 5px, transparent 5px 10px); border: 1px solid var(--border); }
    .actions { display: grid; grid-template-columns: 1fr 1.4fr; gap: 10px; }
    .safe { margin-top: -6px; }
  `,
})
export class PreviewDialog {
  protected readonly store = inject(Store);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  private readonly changed = computed(() => {
    const change = this.store.pending();
    return change ? changedWeeks(change.before, change.after) : [];
  });

  /** Changed weeks plus unchanged ones in between, from the first change on. */
  private readonly allRows = computed<Row[]>(() => {
    const change = this.store.pending();
    const changed = this.changed();
    if (!change || !changed.length) return [];
    const before = new Map(change.before.map((w) => [w.start, w]));
    const keys = new Set(changed.map((w) => w.start));
    const last = changed[changed.length - 1].start;
    return change.after
      .filter((w) => w.start >= changed[0].start && w.start <= last)
      .map((w) => ({ start: w.start, before: before.get(w.start), after: w, changed: keys.has(w.start) }));
  });

  protected readonly rows = computed(() => this.allRows().slice(0, MAX_ROWS));
  protected readonly hidden = computed(() => this.allRows().slice(MAX_ROWS).filter((r) => r.changed).length);

  protected readonly summary = computed(() => {
    const changed = this.changed();
    const pauses = changed.filter((w) => w.paused).length;
    const people = changed.length - pauses;
    const parts = [];
    if (pauses) parts.push(`${pauses} ${pauses === 1 ? 'week' : 'weeks'} paused`);
    if (pauses && people > pauses) parts.push('later turns move back');
    else if (people) parts.push(`${people} ${people === 1 ? 'week gets' : 'weeks get'} a new person`);
    const text = parts.join(' · ');
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'No changes';
  });

  protected range = formatRange;

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      const open = !!this.store.pending();
      if (open && !dialog.open) dialog.showModal();
      else if (!open && dialog.open) dialog.close();
    });
  }

  protected onBackdrop(event: MouseEvent) {
    if (event.target === this.dialog().nativeElement) this.store.pending.set(null);
  }
}
