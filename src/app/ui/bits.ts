import { Component, computed, inject, input } from '@angular/core';
import { Store } from '../store';
import { WeekStatus } from '../schedule/schedule';

@Component({
  selector: 'app-avatar',
  template: `{{ initial() }}`,
  host: {
    class: 'avatar',
    '[style.--c]': 'store.color(id())',
    '[style.--s.px]': 'size()',
    '[attr.aria-hidden]': 'true',
  },
})
export class Avatar {
  protected readonly store = inject(Store);
  readonly id = input<number | null>(null);
  readonly size = input(28);
  protected readonly initial = computed(() => (this.id() == null ? '–' : this.store.name(this.id()).charAt(0).toUpperCase()));
}

export const STATUS_LABEL: Record<WeekStatus, string> = {
  done: 'Done',
  due: 'Open',
  unconfirmed: 'Not confirmed',
  scheduled: 'Upcoming',
  paused: 'Paused',
  skipped: 'Skipped',
};

@Component({
  selector: 'app-status',
  template: `@if (status() !== 'scheduled') {<i></i>{{ label[status()] }}}`,
  host: { '[class]': '"status s-" + status()' },
})
export class Status {
  readonly status = input.required<WeekStatus>();
  protected readonly label = STATUS_LABEL;
}
