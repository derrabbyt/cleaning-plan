import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Store } from './store';
import { WeekSheet } from './ui/week-sheet';
import { PreviewDialog } from './ui/preview-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, WeekSheet, PreviewDialog],
  template: `
    <div class="app">
      <header class="topbar">
        <span class="brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15l.8 1.7 1.7.8-1.7.8L19 20l-.8-1.7-1.7-.8 1.7-.8z"/></svg>
          Cleaning plan
        </span>
        <nav class="nav" aria-label="Main">
          <a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>
            Overview
          </a>
          <a routerLink="/calendar" routerLinkActive="on">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>
            Calendar
          </a>
          <a routerLink="/settings" routerLinkActive="on">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.7-3 2.9-4.6 5.5-4.6s4.8 1.6 5.5 4.6"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.3c2.2 0 3.6 1.4 4 4"/></svg>
            Settings
          </a>
        </nav>
      </header>

      <main>
      @if (!store.loaded()) {
        <p class="muted" style="padding: 40px 4px">Loading…</p>
      } @else if (store.loadError(); as error) {
        <div class="card card-pad">
          <h2 style="font-size: 17px">Couldn't reach the database</h2>
          <p class="muted small" style="margin: 6px 0 14px">{{ error }}</p>
          <button class="btn" (click)="store.load()">Try again</button>
        </div>
      } @else {
        <router-outlet />
      }
      </main>
    </div>

    <app-week-sheet />
    <app-preview-dialog />

    @if (store.toast(); as toast) {
      <div class="toast" role="status" aria-live="polite">
        <span>{{ toast.message }}</span>
        @if (toast.undo) {
          <button type="button" (click)="store.undoToast()" [disabled]="store.busy()">Undo</button>
        }
      </div>
    }
  `,
  host: { '(document:visibilitychange)': 'refreshIfVisible()' },
})
export class App {
  protected readonly store = inject(Store);

  constructor() {
    void this.store.load();
    // Pick up roommates' changes (and the start of a new week) while the page stays open.
    setInterval(() => this.refreshIfVisible(), 60_000);
  }

  /** Pick up roommates' changes when the tab comes back into view. */
  protected refreshIfVisible() {
    if (document.visibilityState === 'visible' && !this.store.busy()) void this.store.load();
  }
}
