import { Routes } from '@angular/router';
import { Overview } from './pages/overview';
import { Calendar } from './pages/calendar';
import { Settings } from './pages/settings';

export const routes: Routes = [
  { path: '', component: Overview, title: 'Cleaning plan' },
  { path: 'calendar', component: Calendar, title: 'Calendar · Cleaning plan' },
  { path: 'settings', component: Settings, title: 'Settings · Cleaning plan' },
  { path: '**', redirectTo: '' },
];
