/* soyapostol service worker — offline-first with three caching strategies.
 *
 *   1. App shell (HTML, CSS, JS, fonts, logo) — cache-first with network
 *      update on navigation requests so revisits are instant.
 *   2. Static JSON data (/data/*.json) — stale-while-revalidate. Huge files
 *      (bible 5 MB, catechism) ship from the cache the second time.
 *   3. Public API (/api/readings, /api/news, /api/liturgy, /api/prayers,
 *      /api/catechism) — stale-while-revalidate. The cached response
 *      lands in <50ms while a fresh fetch silently revalidates the cache
 *      for the NEXT visit. Combined with the in-app IDB cache, this keeps
 *      the dashboard feeling native even on flaky 3G.
 *   4. User-scoped endpoints (/api/auth/*, /api/favorites, /api/admin/*)
 *      are never cached so a logout / lang change / fav add takes effect
 *      immediately on the next request.
 *
 *   Auth/POST/PUT/DELETE/PATCH requests are never cached — they pass through.
 *
 *   ON ACTIVATE we (a) enable Navigation Preload so the SW doesn't add
 *   latency to <Link> nav, and (b) PREWARM the public API cache for both
 *   languages so the first dashboard render after the SW installs is
 *   already warm.
 */
const SW_VERSION = "v6";
const APP_SHELL_CACHE = `soyapostol-shell-${SW_VERSION}`;
const DATA_CACHE = `soyapostol-data-${SW_VERSION}`;
const RUNTIME_CACHE = `soyapostol-runtime-${SW_VERSION}`;

const PRECACHE_URLS = [
    "/",
    "/index.html",
    "/manifest.webmanifest",
    "/logo.png",
    "/icon-192.png",
    "/icon-512.png",
];

// Public API endpoints we want to keep warm. The querystring is included
// because most of these are lang-scoped — `/api/readings?lang=es` is a
// different cache key from `/api/readings?lang=en`.
const PREWARM_URLS = [
    "/api/",                         // tiny health check
    "/api/readings?lang=es",
    "/api/readings?lang=en",
    "/api/news?lang=es&source=all",
    "/api/news?lang=en&source=all",
    "/api/prayers?lang=es",
    "/api/liturgy?lang=es",
];

// User-scoped endpoints that MUST bypass the cache. A logout or favourite
// toggle returning a stale 200 would be a real bug — better to pay the
// network round-trip every time than confuse the user.
const NO_CACHE_API_PREFIXES = [
    "/api/auth/",      // includes /me, /login, /logout, /webauthn, /delete-account
    "/api/favorites",
    "/api/admin/",
];

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(APP_SHELL_CACHE);
        // Fetch each URL with cache:"reload" so the SW doesn't pick up an
        // HTTP cache stale copy during install.
        await Promise.all(
            PRECACHE_URLS.map((url) =>
                cache.add(new Request(url, { cache: "reload" })).catch(() => null),
            ),
        );
        self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        // 1) Drop stale caches from previous SW versions.
        const keys = await caches.keys();
        await Promise.all(
            keys
                .filter((k) => ![APP_SHELL_CACHE, DATA_CACHE, RUNTIME_CACHE].includes(k))
                .map((k) => caches.delete(k)),
        );
        // 2) Enable Navigation Preload so SW activation doesn't add
        //    latency to navigations. The browser starts the network fetch
        //    in parallel with SW startup; we read the preload response
        //    inside `networkFirst()`.
        if (self.registration.navigationPreload) {
            try { await self.registration.navigationPreload.enable(); }
            catch { /* best-effort */ }
        }
        // 3) Take control of any already-open clients.
        await self.clients.claim();
        // 4) Prewarm the runtime cache in the background. We don't await
        //    this — it should NOT block activation, just fill the cache so
        //    the dashboard's first /api/readings hit lands instantly.
        prewarmRuntimeCache().catch(() => {});
    })());
});

async function prewarmRuntimeCache() {
    const cache = await caches.open(RUNTIME_CACHE);
    await Promise.all(
        PREWARM_URLS.map(async (path) => {
            try {
                const req = new Request(path, { credentials: "omit" });
                const res = await fetch(req);
                if (res && res.ok) await cache.put(req, res.clone());
            } catch { /* offline / endpoint not reachable — skip */ }
        }),
    );
}

self.addEventListener("message", (event) => {
    if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isNavigation(request) {
    return request.mode === "navigate"
        || (request.method === "GET"
            && request.headers.get("accept")?.includes("text/html"));
}

function isStaticData(url) {
    return url.pathname.startsWith("/data/") && url.pathname.endsWith(".json");
}

function isApiRequest(url) {
    return url.pathname.startsWith("/api/");
}

function isUserScopedApi(url) {
    return NO_CACHE_API_PREFIXES.some((p) => url.pathname.startsWith(p));
}

// Stale-while-revalidate: serve cache instantly, revalidate in background.
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const networkFetch = fetch(request).then((res) => {
        if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
        return res;
    }).catch(() => cached);
    return cached || networkFetch;
}

// Network-first with cache fallback — used for navigations so users always
// see the freshest UI when online, but still get the app shell when offline.
// Honours Navigation Preload responses where available so the SW round-trip
// adds zero latency on warm starts.
async function networkFirst(event, cacheName) {
    const { request } = event;
    const cache = await caches.open(cacheName);
    try {
        const preloaded = event.preloadResponse ? await event.preloadResponse : null;
        const res = preloaded || await fetch(request);
        if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
        return res;
    } catch {
        const cached = await cache.match(request) || await cache.match("/");
        if (cached) return cached;
        throw new Error("offline and no cache");
    }
}

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Skip analytics / tracking / chrome-extension origins.
    if (!url.protocol.startsWith("http")) return;
    if (url.host.includes("posthog") || url.host.includes("emergent.sh")) return;

    // App navigations → network-first for freshness, fallback to app shell.
    if (isNavigation(request)) {
        event.respondWith(networkFirst(event, APP_SHELL_CACHE));
        return;
    }

    // Large static JSON (Bible, Catechism) → aggressive cache.
    if (isStaticData(url) && url.origin === self.location.origin) {
        event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
        return;
    }

    // Our own API → split between user-scoped (bypass) and public (SWR).
    if (isApiRequest(url) && url.origin === self.location.origin) {
        if (isUserScopedApi(url)) return; // pass through to network
        event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
        return;
    }

    // Same-origin static assets (JS/CSS/images) → stale-while-revalidate.
    if (url.origin === self.location.origin) {
        event.respondWith(staleWhileRevalidate(request, APP_SHELL_CACHE));
        return;
    }

    // Cross-origin assets (fonts.googleapis, CDN images, Evangelizo API…)
    // Use stale-while-revalidate for GETs that look like fonts/images/JSON.
    if (url.host.includes("fonts.googleapis.com")
        || url.host.includes("fonts.gstatic.com")
        || url.host.includes("vaticannews.va")
        || url.host.includes("aciprensa.com")
        || url.host.includes("publication.evangelizo.ws")
        || url.host.includes("ewtnnews.com")
    ) {
        event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    }
});
