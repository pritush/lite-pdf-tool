const CACHE_NAME = "pdf-tool-cache-v6";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./assets/css/styles.css",
  "./assets/js/app.js",
  "./assets/js/compress-worker.js",
  "./assets/js/image-processor.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

/**
 * Inject Cross-Origin Isolation headers into same-origin responses.
 * This enables SharedArrayBuffer which Ghostscript WASM requires.
 * Only patches responses that don't already have the headers set
 * (i.e. when the hosting platform doesn't handle it via vercel.json / netlify.toml).
 */
function withCrossOriginHeaders(response) {
  // Only patch same-origin (basic) responses — can't modify opaque/cors responses
  if (response.type !== "basic") return response;
  // Skip if headers are already set by the server
  if (response.headers.get("Cross-Origin-Opener-Policy")) return response;

  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "credentialless");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Never intercept blob: URLs — these are used for PDF downloads
  if (event.request.url.startsWith("blob:")) return;

  // Never intercept chrome-extension or non-http(s) schemes
  if (!event.request.url.startsWith("http")) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch to update cache for next time, but return immediately
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
        }).catch(() => {});
        return withCrossOriginHeaders(cachedResponse);
      }

      return fetch(event.request).then((networkResponse) => {
        // Cache new successful GET requests (fonts, scripts, css) for long period
        if (networkResponse && networkResponse.status === 200 &&
            (networkResponse.type === "basic" || networkResponse.type === "cors")) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return withCrossOriginHeaders(networkResponse);
      }).catch(() => {
        // Return offline fallback if necessary
      });
    })
  );
});
