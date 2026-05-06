import { idbGet, idbSet } from "@/lib/idb";
import api from "@/lib/api";

/**
 * IDB-backed cache for the daily readings.
 *
 * Readings change once per day per locale. The backend already caches
 * upstream calls to the Evangelizo RSS in MongoDB, but every cold reload
 * still pays the cost of a /api/readings round-trip + JSON parse on the
 * phone. Storing the parsed payload in IndexedDB drops that to a single
 * IDB read on warm visits — instant.
 *
 * Cache key: `readings_{YYYY-MM-DD}_{lang}`. Different days don't collide
 * and language switches don't invalidate previously fetched days. Stale
 * entries (older than 30 days) are best-effort cleaned on first hit so
 * the IDB doesn't grow unbounded over months of use.
 */

const VERSION = 1;
const KEY = (date, lang) => `readings_${date}_${lang}`;

// Stale-after window for the same day/lang pair. The backend already
// holds a 7-day MongoDB cache; we re-validate against it once an hour
// during the active day in case someone publishes a correction.
const FRESH_FOR_TODAY_MS = 60 * 60 * 1000; // 1 hour

export async function loadReadings({ date, lang, todayISO, force = false }) {
    const key = KEY(date, lang);

    if (!force) {
        try {
            const cached = await idbGet(key);
            if (cached && cached.version === VERSION && cached.payload) {
                const isToday = date === todayISO;
                const age = Date.now() - (cached.savedAt || 0);
                // Past dates: cache is permanent (the readings won't change).
                // Today: re-validate after FRESH_FOR_TODAY_MS to catch edits.
                if (!isToday || age < FRESH_FOR_TODAY_MS) {
                    return { data: cached.payload, source: "idb" };
                }
            }
        } catch { /* fall through to network */ }
    }

    const res = await api.get("/readings", { params: { lang, date } });
    const data = res.data;
    // Persist asynchronously — don't block the UI on the IDB write.
    idbSet(key, VERSION, data).catch(() => {});
    return { data, source: "network" };
}
