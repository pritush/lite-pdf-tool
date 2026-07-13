const CACHE_NAME = "pdf-tool-cache-v8";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./assets/css/styles.css",
  "./assets/js/app.js",
  "./assets/js/modules/config.js",
  "./assets/js/modules/core.js",
  "./assets/js/modules/ui.js",
  "./assets/js/compress-worker.js",
  "./assets/js/image-processor.js"
];

// Feature detection
const supportsNavigationPreload = "navigationPreload" in self.registration;

self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installing...");
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log("[Service Worker] Caching assets");
        return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
          console.error("[Service Worker] Cache failed for some assets:", err);
          // Don't fail installation if some assets fail to cache
          return Promise.resolve();
        });
      })
      .catch((err) => {
        console.error("[Service Worker] Installation failed:", err);
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activating...");
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log("[Service Worker] Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Enable navigation preload if supported
      supportsNavigationPreload ? self.registration.navigationPreload.enable() : Promise.resolve()
    ])
  );
  self.clients.claim();
  console.log("[Service Worker] Activated and claimed clients");
});

/**
 * Inject Cross-Origin Isolation headers into same-origin responses.
 * This enables SharedArrayBuffer which Ghostscript WASM requires.
 * This is critical for environments where server headers can't be configured.
 * 
 * @param {Response} response - The response to enhance
 * @returns {Response} Response with COOP/COEP headers
 */
function withCrossOriginHeaders(response) {
  // Only patch same-origin (basic) responses — can't modify opaque/cors responses
  if (!response || response.type !== "basic") return response;
  
  // Skip if headers are already set by the server (server config takes precedence)
  if (response.headers.get("Cross-Origin-Opener-Policy")) {
    console.log("[Service Worker] Server headers already present");
    return response;
  }

  console.log("[Service Worker] Injecting COOP/COEP headers");
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
        console.log("[Service Worker] Serving from cache:", event.request.url);
        
        // Fetch to update cache for next time (stale-while-revalidate), but don't wait
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
              console.log("[Service Worker] Updated cache:", event.request.url);
            });
          }
        }).catch(() => {
          // Network failed, but we have cache - no problem
        });
        
        return withCrossOriginHeaders(cachedResponse);
      }

      // No cache hit - fetch from network and inject headers
      console.log("[Service Worker] Fetching from network:", event.request.url);
      
      return fetch(event.request)
        .then((networkResponse) => {
          // Clone response before consuming it
          const responseToCache = networkResponse.clone();
          
          // Cache successful responses
          if (networkResponse && networkResponse.status === 200 &&
              (networkResponse.type === "basic" || networkResponse.type === "cors")) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
              console.log("[Service Worker] Cached new resource:", event.request.url);
            });
          }
          
          // Always inject headers before returning
          return withCrossOriginHeaders(networkResponse);
        })
        .catch((error) => {
          console.error("[Service Worker] Fetch failed:", event.request.url, error);
          
          // Network failed - try to serve from cache anyway
          return caches.match(event.request).then((response) => {
            if (response) {
              console.log("[Service Worker] Serving stale cache after network error");
              return withCrossOriginHeaders(response);
            }
            
            // If it's a navigation request, return offline page (future enhancement)
            if (event.request.mode === "navigate") {
              return new Response(
                "<h1>Offline</h1><p>Please check your internet connection.</p>",
                { headers: { "Content-Type": "text/html" } }
              );
            }
            
            throw error;
          });
        });
    })
  );
});
