import { loadTranslations } from './app/core/i18n/i18n';

// iOS Safari ignores user-scalable=no in the viewport; its own pinch events can still be stopped
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
}

// the texts first, then the app: its modules may use t() already while they are evaluated
loadTranslations()
  .then(() => import('./bootstrap'))
  .then(({ bootstrap }) => bootstrap())
  .catch((err) => console.error(err));
