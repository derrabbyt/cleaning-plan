import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { TasksService } from './tasks.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: TasksService, useValue: { list: async () => [{ id: 1, title: 'Vacuum', room: 'Hall', done: false }] } }],
    }).compileComponents();
  });

  it('should render tasks', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Cleaning plan');
    expect(compiled.querySelector('li')?.textContent).toContain('Vacuum');
  });
});
