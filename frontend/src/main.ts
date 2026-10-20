import { loadTranslations } from './app/core/i18n/i18n';

/** A very fast start still shows the logo briefly instead of flashing it. */
const SPLASH_MIN_MS = 450;

// iOS Safari ignores user-scalable=no in the viewport; its own pinch events can still be stopped
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
}

// the texts first, then the app: its modules may use t() already while they are evaluated
loadTranslations()
  .then(() => import('./bootstrap'))
  .then(({ bootstrap }) => bootstrap())
  .then(() => hideSplash())
  .catch((err) => {
    console.error(err);
    showSplashError();
  });

/** Fades out the start screen of index.html once the app runs. */
function hideSplash(): void {
  const splash = document.getElementById('app-splash');
  if (!splash) {
    return;
  }
  setTimeout(() => {
    // while it fades out it is no longer a status message for screen readers
    splash.setAttribute('aria-hidden', 'true');
    splash.classList.add('app-splash-done');
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    // also when transitions are off (reduced motion) or the tab is in the background
    setTimeout(() => splash.remove(), 600);
  }, Math.max(0, SPLASH_MIN_MS - performance.now()));
}

function showSplashError(): void {
  document.getElementById('app-splash')?.classList.add('app-splash-failed');
  document.getElementById('app-splash-reload')?.addEventListener('click', () => location.reload());
}
