import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { Store } from '../store';
import { RoommateDraft } from '../db';
import { Avatar } from '../ui/bits';

@Component({
  selector: 'app-settings',
  imports: [Avatar],
  template: `
    <div class="page">
      <h2 class="section-title">Rotation order</h2>
      <section class="card list">
        <ol class="people">
          @for (r of draft(); track r.id; let i = $index, last = $last) {
            <li>
              <span class="num">{{ i + 1 }}</span>
              <app-avatar [id]="r.id" [size]="30" />
              <input class="name" [value]="r.name" (input)="rename(i, $any($event.target).value)" maxlength="40" aria-label="Name" />
              <span class="tools">
                <button class="icon-btn" type="button" (click)="move(i, -1)" [disabled]="i === 0" aria-label="Move up">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 15l6-6 6 6"/></svg>
                </button>
                <button class="icon-btn" type="button" (click)="move(i, 1)" [disabled]="last" aria-label="Move down">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                <button class="icon-btn" type="button" (click)="remove(i)" [attr.aria-label]="'Remove ' + r.name">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                </button>
              </span>
            </li>
          }
        </ol>
        <form class="add" (submit)="add($event)">
          <input class="field" name="name" placeholder="Add a roommate" maxlength="40" autocomplete="off" [value]="newName()" (input)="newName.set($any($event.target).value)" />
          <button class="btn" type="submit">Add</button>
        </form>
      </section>

      @if (dirty()) {
        <div class="save-bar">
          <button class="link" type="button" (click)="reset()">Discard</button>
          <button class="btn btn-primary" type="button" (click)="save()" [disabled]="!valid() || store.busy()">Review & save</button>
        </div>
      } @else {
        <p class="muted small hint">Turns go in this order and repeat. Changes only affect upcoming weeks; history stays as it is.</p>
      }

      <h2 class="section-title">Sharing</h2>
      <section class="card card-pad share">
        <p>Everyone with the link can see and update the plan. No accounts needed.</p>
        <button class="btn" type="button" (click)="copy()">{{ copied() ? 'Link copied' : 'Copy link' }}</button>
      </section>
    </div>
  `,
  styles: `
    .list { padding: 6px; }
    .people { list-style: none; margin: 0; padding: 0; }
    .people li { display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 10px; border-radius: 12px; animation: fade-in 0.2s var(--ease); }
    .people li:hover { background: var(--surface-2); }
    .num { width: 1.2em; font-size: 13px; color: var(--faint); font-variant-numeric: tabular-nums; }
    .name { flex: 1; min-width: 0; border: 0; background: none; padding: 8px 6px; border-radius: 8px; font-weight: 600; }
    .name:focus { outline: none; background: var(--surface); box-shadow: 0 0 0 1.5px var(--focus); }
    .tools { display: flex; }
    .tools .icon-btn { width: 32px; height: 32px; }
    .add { display: flex; gap: 8px; padding: 8px 6px 6px; border-top: 1px solid var(--border); margin-top: 4px; }
    .save-bar { display: flex; justify-content: flex-end; align-items: center; gap: 16px; animation: fade-in 0.2s var(--ease); }
    .hint { padding: 0 4px; }
    .share { display: grid; gap: 14px; justify-items: start; }
  `,
})
export class Settings {
  protected readonly store = inject(Store);

  protected readonly draft = linkedSignal<RoommateDraft[]>(() => this.store.rotation().map(({ id, name }) => ({ id, name })));
  protected readonly newName = signal('');
  protected readonly copied = signal(false);
  private nextTempId = -1;

  protected readonly dirty = computed(() => {
    const saved = this.store.rotation();
    const draft = this.draft();
    return draft.length !== saved.length || draft.some((r, i) => r.id !== saved[i].id || r.name.trim() !== saved[i].name);
  });
  protected readonly valid = computed(() => this.draft().every((r) => r.name.trim().length > 0));

  protected rename(index: number, name: string) {
    this.draft.update((d) => d.map((r, i) => (i === index ? { ...r, name } : r)));
  }

  protected move(index: number, delta: number) {
    this.draft.update((d) => {
      const next = [...d];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }

  protected remove(index: number) {
    this.draft.update((d) => d.filter((_, i) => i !== index));
  }

  protected add(event: Event) {
    event.preventDefault();
    const name = this.newName().trim();
    if (!name) return;
    this.draft.update((d) => [...d, { id: this.nextTempId--, name }]);
    this.newName.set('');
  }

  protected reset() {
    this.draft.set(this.store.rotation().map(({ id, name }) => ({ id, name })));
  }

  protected save() {
    this.store.proposeRotation(this.draft().map((r) => ({ ...r, name: r.name.trim() })));
  }

  protected async copy() {
    await navigator.clipboard.writeText(location.href.split('#')[0]);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
