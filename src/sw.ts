/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Service worker (bundled by Serwist, see src/app/serwist/[path]/route.ts).
// Privacy rule: pages and API responses contain personal data, so they are
// NEVER cached here. Only the precached static build + the static offline shells.
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const LIVE_PAGE = /^\/game\/[^/]+\/live\/?$/;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Pages: always from the network (fallbacks below when offline).
    { matcher: ({ request }) => request.mode === "navigate", handler: new NetworkOnly() },
    // Public static files (icons, fonts). Build assets are precached already.
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && (url.pathname.startsWith("/icons/") || /\.(?:woff2|ico)$/.test(url.pathname)),
      handler: new CacheFirst({
        cacheName: "static-assets",
        plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        // The organizer console restores the last known match state from IndexedDB.
        url: "/offline/live",
        matcher: ({ request }) =>
          request.destination === "document" && LIVE_PAGE.test(new URL(request.url).pathname),
      },
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
