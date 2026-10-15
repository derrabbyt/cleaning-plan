import { Injectable } from '@angular/core';
import { neon } from '@neondatabase/serverless';
import { DATABASE_URL } from './db-config.generated';

export interface Task {
  id: number;
  title: string;
  room: string;
  done: boolean;
}

// Queries Neon directly over HTTP from the browser as the least-privilege `cleaning_app` role.
@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly sql = neon(DATABASE_URL, { disableWarningInBrowsers: true });

  async list(): Promise<Task[]> {
    return (await this.sql`SELECT id, title, room, done FROM tasks ORDER BY done, room, id`) as Task[];
  }

  add(title: string, room: string) {
    return this.sql`INSERT INTO tasks (title, room) VALUES (${title}, ${room})`;
  }

  setDone(id: number, done: boolean) {
    return this.sql`UPDATE tasks SET done = ${done} WHERE id = ${id}`;
  }

  remove(id: number) {
    return this.sql`DELETE FROM tasks WHERE id = ${id}`;
  }
}
