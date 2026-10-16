import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Store } from '../store';
import { formatDay, formatRange } from '../schedule/dates';
import { statusOf } from '../schedule/schedule';
import { Avatar } from '../ui/bits';

@Component({
  selector: 'app-overview',
  imports: [Avatar, RouterLink],
  template: `
    <div class="page">
      @if (!store.rotation().length) {
        <section class="card hero">
          <p class="eyebrow">Let's get started</p>
          <h1 class="hero-name">Who lives here?</h1>
          <p class="muted">Add your roommates and the weekly rotation sets itself up.</p>
          <a class="btn btn-primary btn-lg btn-block" routerLink="/settings">Add roommates</a>
        </section>
      } @else if (week(); as w) {
        <section class="card hero" [class.hero-done]="status() === 'done'" [class.hero-paused]="w.paused">
          <p class="eyebrow">This week · {{ range(w.start) }}</p>

          @if (w.paused) {
            <div class="hero-person">
              <span class="hero-icon paused-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 7v10M15 7v10"/></svg>
              </span>
              <div>
                <h1 class="hero-name">Week off</h1>
                <p class="muted">No cleaning scheduled this week.</p>
              </div>
            </div>
          } @else {
            <div class="hero-person">
              <app-avatar [id]="w.assigneeId" [size]="56" />
              <div class="hero-text">
                <h1 class="hero-name">{{ store.name(w.assigneeId) }}</h1>
                @if (w.completedAt) {
                  <p class="done-line">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
                    @if (w.cleanedById === w.assigneeId) { Cleaned {{ day(w.completedAt) }} }
                    @else { {{ store.name(w.cleanedById) }} cleaned · {{ day(w.completedAt) }} }
                  </p>
                } @else {
                  <p class="muted">Not done yet</p>
                }
              </div>
            </div>

            @if (w.completedAt) {
              <div class="hero-actions-inline">
                <button class="link" type="button" (click)="store.openWeek.set(w.start)">Edit</button>
                <button class="link" type="button" (click)="store.unconfirm(w)" [disabled]="store.busy()">Undo</button>
              </div>
            } @else {
              <button class="btn btn-primary btn-lg btn-block" type="button" (click)="store.confirm(w, w.assigneeId!)" [disabled]="store.busy()">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
                Mark as done
              </button>
              @if (pickOther()) {
                <div class="chips other" role="group" aria-label="Who cleaned instead?">
                  @for (r of others(); track r.id) {
                    <button class="chip" type="button" (click)="confirmBy(r.id)" [disabled]="store.busy()">
                      <app-avatar [id]="r.id" [size]="24" />{{ r.name }}
                    </button>
                  }
                </div>
              } @else if (others().length) {
                <button class="link other-link" type="button" (click)="pickOther.set(true)">Someone else cleaned</button>
              }
            }
          }
        </section>
      }

      @for (w of store.overdue(); track w.start) {
        <section class="card overdue">
          <button class="row" type="button" (click)="store.openWeek.set(w.start)">
            <app-avatar [id]="w.assigneeId" />
            <span class="row-main">
              <span class="row-title">{{ store.name(w.assigneeId) }}</span>
              <span class="row-sub">{{ range(w.start) }} · not confirmed</span>
            </span>
          </button>
          <button class="btn" type="button" (click)="store.confirm(w, w.assigneeId!)" [disabled]="store.busy()">Done</button>
        </section>
      }

      @if (coming().length) {
        <h2 class="section-title">Coming up</h2>
        <ul class="card rows">
          @for (w of coming(); track w.start) {
            <li>
              <button class="row" type="button" [class.is-paused]="w.paused" (click)="store.openWeek.set(w.start)">
                @if (w.paused) {
                  <span class="avatar paused-avatar" aria-hidden="true">–</span>
                } @else {
                  <app-avatar [id]="w.assigneeId" />
                }
                <span class="row-main">
                  <span class="row-title">{{ w.paused ? 'Paused' : store.name(w.assigneeId) }}</span>
                  <span class="row-sub">{{ range(w.start) }}</span>
                </span>
                @if (w === store.nextTurn()) { <span class="next-tag">Next</span> }
              </button>
            </li>
          }
        </ul>
      }

      @if (store.rotation().length > 1) {
        <div class="rotation-head">
          <h2 class="section-title">Rotation</h2>
          <a class="link small" routerLink="/settings">Edit</a>
        </div>
        <ol class="rotation" aria-label="Rotation order">
          @for (r of store.rotation(); track r.id) {
            <li [class.on]="r.id === week()?.assigneeId && !week()?.paused">
              <app-avatar [id]="r.id" [size]="32" />
              <span>{{ r.name }}</span>
            </li>
          }
        </ol>
      }
    </div>
  `,
  styles: `
    .hero { padding: 22px 20px 20px; display: grid; gap: 18px; transition: background 0.3s; }
    .hero-done { background: linear-gradient(180deg, var(--done-bg), var(--surface) 80%); border-color: color-mix(in srgb, var(--done) 22%, var(--border)); }
    .eyebrow { font-size: 13px; font-weight: 550; color: var(--muted); }
    .hero-person { display: flex; align-items: center; gap: 16px; }
    .hero-text { min-width: 0; }
    .hero-name { font-size: 32px; line-height: 1.1; font-weight: 700; letter-spacing: -0.025em; overflow-wrap: anywhere; }
    .hero-icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; flex: none; }
    .paused-icon { background: var(--paused-bg); color: var(--paused); }
    .paused-icon svg { width: 24px; }
    .done-line { display: flex; align-items: center; gap: 6px; color: var(--done); font-weight: 600; margin-top: 2px; }
    .hero-actions-inline { display: flex; gap: 16px; margin-top: -6px; }
    .other-link { justify-self: center; margin-top: -8px; }
    .other { justify-content: center; margin-top: -4px; }
    .overdue { display: flex; align-items: center; gap: 8px; padding: 6px 10px 6px 6px; border-color: color-mix(in srgb, var(--warn) 30%, var(--border)); background: var(--warn-bg); }
    .overdue .row:hover { background: transparent; }
    .overdue .row-sub { color: var(--warn); }
    .overdue .btn { min-height: 38px; }
    .paused-avatar { --c: var(--paused); background: var(--paused-bg); color: var(--paused); }
    .next-tag { font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px; background: var(--surface-2); color: var(--text); }
    .rotation-head { display: flex; align-items: baseline; justify-content: space-between; margin-right: 4px; }
    .rotation { list-style: none; margin: 0; padding: 4px 2px 6px; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
    .rotation li { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 64px; padding: 10px 6px 8px; border-radius: 14px; font-size: 13px; font-weight: 550; color: var(--muted); position: relative; }
    .rotation li + li::before { content: ''; position: absolute; left: -7px; top: 26px; width: 8px; height: 1.5px; background: var(--border); }
    .rotation li.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow); outline: 1px solid var(--border); }
    .rotation span { max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `,
})
export class Overview {
  protected readonly store = inject(Store);
  protected readonly pickOther = signal(false);

  protected readonly week = this.store.thisWeek;
  protected readonly status = computed(() => {
    const w = this.week();
    return w ? statusOf(w, this.store.current()) : null;
  });
  protected readonly others = computed(() => this.store.rotation().filter((r) => r.id !== this.week()?.assigneeId));
  protected readonly coming = computed(() => this.store.upcoming().slice(0, 4));

  protected range = formatRange;
  protected day = (iso: string) => formatDay(new Date(iso));

  protected async confirmBy(id: number) {
    await this.store.confirm(this.week()!, id);
    this.pickOther.set(false);
  }
}
