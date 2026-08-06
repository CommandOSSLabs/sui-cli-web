import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // apps/web/public/manifest.json is already a complete, hand-authored
      // manifest (custom `shortcuts`, `categories`, icons at every required
      // size) and apps/web/index.html already links to it directly. Setting
      // `manifest: false` stops the plugin from generating and emitting its
      // own manifest.webmanifest (and from touching that <link> tag) -
      // ours is used as-is, unmodified.
      manifest: false,
      // The service worker is registered by hand from src/lib/pwa.ts (via
      // the `virtual:pwa-register` module) instead of the plugin's
      // auto-injected register script, so the app can react to
      // `onNeedReload` itself - see that file for why. Because
      // `injectRegister` isn't 'auto'/null, the plugin will NOT
      // auto-populate `workbox.skipWaiting`/`clientsClaim` for us the way
      // it normally would for `registerType: 'autoUpdate'`, so both are set
      // explicitly below.
      injectRegister: false,
      // 'autoUpdate': every open tab's service worker updates itself as
      // soon as a new one finishes installing (skipWaiting + clientsClaim
      // below) - nobody stays pinned to a stale cached app shell that might
      // contain a fixed bug. This does NOT force an unannounced reload of
      // the *currently running* tab; src/lib/pwa.ts prompts instead. See
      // that file's comment for the full reasoning (this app drives wallet
      // signing/export flows, where a surprise reload would be harmful).
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      filename: 'sw.js',
      // Not imported by JS/CSS, so they need to be listed explicitly to be
      // precached for offline app-shell loading (see globPatterns below).
      includeAssets: [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'icon-192x192.png',
        'icon-512x512.png',
        'sui-logo.png',
      ],
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Precache ONLY the static build output (+ the icons listed in
        // includeAssets above). This glob runs against apps/web/dist, which
        // contains nothing but the compiled SPA - no /api response ever
        // lands in here, so there is nothing API-shaped for this list to
        // accidentally sweep in.
        globPatterns: ['**/*.{js,css,html}'],
        // Lets deep-linked/refreshed client-side routes (e.g. /addresses)
        // resolve from the cached app shell when offline. Explicitly denied
        // for /api and /health so a navigation-mode request there is never
        // served the SPA shell instead of hitting the real endpoint.
        //
        // Also denied for /blog and /changelog: the root `build` script
        // (package.json) copies the separately-built Astro marketing site
        // into dist/blog *after* this client build already generated sw.js,
        // so those pages are real static files on the server but are
        // invisible to this config and unknown to the React router (see
        // App.tsx - there is no /blog or /changelog route). Without this,
        // the SW's NavigationRoute would catch any navigation there -
        // including the plain <a href="/changelog"> link on the landing
        // page (HomePage/index.tsx) - and serve the SPA shell instead,
        // which renders as the SPA's own 404 and never even reaches the
        // server's /changelog -> /blog/changelog/ redirect
        // (apps/server/src/index.ts).
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/health$/, /^\/blog\//, /^\/changelog\/?$/],
        // CRITICAL: this app moves Sui balances, transactions, object
        // state, and key export/import/signing through /api/**, proxied in
        // dev (see server.proxy below) and served from the SAME Fastify
        // process/origin as the static SPA in production (see
        // apps/server/src/index.ts + /Dockerfile). A cached balance, a
        // cached transaction status, or - far worse - a cached response
        // from a signing/export call could actively mislead a user or leak
        // key material from cache. Every HTTP method is pinned to
        // NetworkOnly ("no cache entry at all") for that whole path, and
        // this is the FIRST entry in runtimeCaching so Workbox's
        // first-match-wins routing can never let some later, broader
        // same-origin rule shadow it.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'GET',
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'POST',
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'PUT',
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'PATCH',
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'DELETE',
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'HEAD',
          },
        ],
      },
      devOptions: {
        // Never run the service worker under `vite dev`. The /api proxy
        // below already talks straight to localhost:3001; a dev-mode SW
        // would be one more layer able to intercept wallet requests while
        // iterating on caching logic, for zero benefit (nothing needs
        // offline support mid-development).
        enabled: false,
      },
    }),
  ],
  define: {
    // react-draggable (pulled in by react-grid-layout) reads
    // `process.env.DRAGGABLE_DEBUG` inside a log() it calls on EVERY drag/resize
    // event. Vite's dev server does not define `process`, so without this the
    // reference throws "process is not defined", the drag handler crashes, and
    // cards silently refuse to move. `vite build` already inlines it, so this
    // only matters for the dev server.
    'process.env.DRAGGABLE_DEBUG': 'false',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        // Matches sui-cli-web-server's default PORT (apps/server/src/index.ts) -
        // keep in sync with however the server is actually started.
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Enable code splitting for better caching
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Sui SDK - large library, separate chunk
          if (id.includes('@mysten/sui') || id.includes('@mysten/bcs')) {
            return 'vendor-sui';
          }
          // Core React libraries
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/')
          ) {
            return 'vendor-react';
          }
          // UI libraries
          if (
            id.includes('framer-motion') ||
            id.includes('lucide-react') ||
            id.includes('react-hot-toast')
          ) {
            return 'vendor-ui';
          }
          // Radix UI components
          if (id.includes('@radix-ui/react-')) {
            return 'vendor-radix';
          }
          // WebGL background
          if (id.includes('ogl')) {
            return 'background';
          }
          // State management
          if (id.includes('zustand')) {
            return 'vendor-state';
          }
          // Lenis smooth scroll
          if (id.includes('lenis')) {
            return 'lenis';
          }
        },
      },
    },
    // Improve chunk size warnings
    chunkSizeWarningLimit: 500,
    // Enable minification (using esbuild for speed, no extra deps)
    minify: 'esbuild',
    // Generate source maps for debugging (optional)
    sourcemap: false,
  },
  // Optimize dependencies
  optimizeDeps: {
    // Pre-bundle the grid libs so the `define` above is applied to their code
    // (react-draggable's process.env access lives inside react-grid-layout's tree).
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'zustand',
      'react-grid-layout',
      'react-draggable',
    ],
    // Exclude libraries with __DEFINES__ issues in dev mode
    exclude: [
      '@microsoft/clarity',
      '@statsig/js-client',
      '@statsig/session-replay',
      '@statsig/web-analytics',
    ],
  },
});
