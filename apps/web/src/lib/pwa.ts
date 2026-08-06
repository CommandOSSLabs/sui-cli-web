import { registerSW } from 'virtual:pwa-register';
import { showUpdateAvailableToast } from './toast';

/**
 * Registers the build-time-generated service worker (vite-plugin-pwa +
 * Workbox - see vite.config.ts for the full caching config, including the
 * NetworkOnly rules that keep every /api/** request out of any cache) and
 * wires up its update lifecycle.
 *
 * A no-op in dev (`vite dev`): `devOptions.enabled: false` in vite.config.ts
 * makes the plugin swap in a dev-mode `virtual:pwa-register` that doesn't
 * actually register anything, and outside a real build there is no
 * `apps/web/dist/sw.js` to register in the first place.
 *
 * Update strategy - registerType: 'autoUpdate' (vite.config.ts):
 * `skipWaiting`/`clientsClaim` are both on, so a newly installed service
 * worker activates and starts controlling every open tab as soon as it's
 * ready, with no user action needed. That keeps the service worker - and
 * therefore the precached app shell it serves on the *next* full load -
 * always current: nobody is stuck for weeks on a cached bundle that happens
 * to contain a fixed bug.
 *
 * That does NOT, by itself, change the code already running in an open tab:
 * it keeps executing the OLD bundle exactly as before, fully functional,
 * even after the new service worker has taken over. vite-plugin-pwa's
 * default reaction at that point is an immediate, unannounced
 * `window.location.reload()`. That default is overridden here via
 * `onNeedReload`: this app drives wallet operations (address/key export,
 * signing, transfers) through its UI, and a surprise full-page reload
 * mid-flow could drop unsaved form state or interrupt something sensitive.
 * Instead, a dismissible toast (see showUpdateAvailableToast) lets the user
 * pick the moment - the reload itself is just `window.location.reload()`,
 * since the new service worker is already in control and will serve the
 * fresh assets as soon as the page re-requests them.
 */
export function registerPWA(): void {
  if (!('serviceWorker' in navigator)) return;

  registerSW({
    immediate: true,
    onNeedReload() {
      showUpdateAvailableToast(() => window.location.reload());
    },
    onRegisterError(error) {
      console.error('[PWA] Service worker registration failed:', error);
    },
  });
}
