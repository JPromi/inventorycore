import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// iOS Safari ignores user-scalable=no in the viewport; its own pinch events can still be stopped
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
