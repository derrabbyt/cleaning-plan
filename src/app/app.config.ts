import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  // Hash routing: GitHub Pages can't rewrite deep links to index.html.
  providers: [provideBrowserGlobalErrorListeners(), provideRouter(routes, withHashLocation())],
};
