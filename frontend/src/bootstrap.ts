import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

/** Imported by main.ts once the texts are loaded. */
export function bootstrap() {
  return bootstrapApplication(App, appConfig);
}
