import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Task, TasksService } from './tasks.service';

@Component({
  imports: [FormsModule],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly tasks = inject(TasksService);

  protected readonly items = signal<Task[]>([]);
  protected readonly error = signal('');
  protected title = '';
  protected room = '';

  constructor() {
    this.refresh();
  }

  protected async add() {
    if (!this.title.trim()) return;
    await this.run(() => this.tasks.add(this.title.trim(), this.room.trim()));
    this.title = '';
  }

  protected toggle(task: Task) {
    return this.run(() => this.tasks.setDone(task.id, !task.done));
  }

  protected remove(task: Task) {
    return this.run(() => this.tasks.remove(task.id));
  }

  private async run(action: () => Promise<unknown>) {
    try {
      await action();
      await this.refresh();
    } catch (e) {
      this.error.set(String(e));
    }
  }

  private async refresh() {
    try {
      this.items.set(await this.tasks.list());
      this.error.set('');
    } catch (e) {
      this.error.set(String(e));
    }
  }
}
