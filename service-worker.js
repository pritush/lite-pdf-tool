const CACHE_NAME = "pdf-tool-cache-v7";
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
 * This is critical for environments where server headers can't be configured.
 */
function withCrossOriginHeaders(response) {
  // Only patch same-origin (basic) responses — can't modify opaque/cors responses
  if (!response || response.type !== "basic") return response;
  
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

  // CRITICAL: Always inject headers for same-origin requests to enable SharedArrayBuffer
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // If we have a cached response, use it with headers injected
      if (cachedResponse) {
        // Fetch to update cache for next time, but don't wait
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
        }).catch(() => {});
        
        return withCrossOriginHeaders(cachedResponse);
      }

      // No cache hit - fetch from network and inject headers
      return fetch(event.request)
        .then((networkResponse) => {
          // Clone response before consuming it
          const responseToCache = networkResponse.clone();
          
          // Cache successful responses
          if (networkResponse && networkResponse.status === 200 &&
              (networkResponse.type === "basic" || networkResponse.type === "cors")) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          
          // Always inject headers before returning
          return withCrossOriginHeaders(networkResponse);
        })
        .catch((error) => {
          // Network failed - try to serve from cache anyway
          return caches.match(event.request).then((response) => {
            if (response) {
              return withCrossOriginHeaders(response);
            }
            throw error;
          });
        });
    })
  );
});
