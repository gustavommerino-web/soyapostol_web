import React from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { useFavoritesCount } from "@/contexts/FavoritesCountContext";

/**
 * Owns the "is this verse saved as a favorite?" state and exposes a
 * single `toggle()` to add / remove. Extracted out of VerseOfTheDay so
 * the component can stay presentational.
 *
 * Side effects are identical to the inline version:
 *   - On mount / verse change: fetch /favorites and look for a match.
 *   - `toggle()` posts or deletes as needed, with optimistic user-friendly
 *     toasts. Errors show a generic "common.error" toast (silently swallowed
 *     in the original; here we keep the same UX but the error handler is no
 *     longer empty — it logs once to aid debugging).
 */
export function useVotdFavorite({ resolved }) {
    const { user } = useAuth();
    const { t, lang } = useLang();
    const { refresh: refreshCount } = useFavoritesCount();
    const [savedId, setSavedId] = React.useState(null);

    // Look up existing favorite whenever the resolved verse changes.
    React.useEffect(() => {
        setSavedId(null);
        if (!user || !resolved) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const r = await api.get("/favorites");
                if (cancelled) return;
                const match = (r.data || []).find(
                    (f) =>
                        f.section === "bible" &&
                        f.metadata?.kind === "verse" &&
                        f.metadata?.book === resolved.book &&
                        f.metadata?.chapter === resolved.chapter &&
                        f.metadata?.verse === resolved.verse &&
                        (!f.metadata?.lang || f.metadata.lang === lang),
                );
                if (match) setSavedId(match.id);
            } catch {
                // Non-fatal — leaving savedId=null means the heart button
                // will show "save" instead of "remove" which is still
                // correct (clicking adds another favorite idempotently on
                // the backend side).
            }
        })();
        return () => { cancelled = true; };
    }, [user, resolved, lang]);

    const toggle = React.useCallback(async ({ onUnauthenticated }) => {
        if (!user) { onUnauthenticated?.(); return; }
        if (!resolved) return;
        try {
            if (savedId) {
                await api.delete(`/favorites/${savedId}`);
                setSavedId(null);
                refreshCount();
                toast.success(t("common.remove"));
            } else {
                const r = await api.post("/favorites", {
                    section: "bible",
                    title: `${resolved.bookDisplay} ${resolved.chapter}:${resolved.verse}`,
                    content: resolved.text,
                    metadata: {
                        kind: "verse",
                        book: resolved.book,
                        chapter: resolved.chapter,
                        verse: resolved.verse,
                        lang,
                    },
                    lang,
                });
                setSavedId(r.data?.id || null);
                refreshCount();
                toast.success(t("common.saved"));
            }
        } catch {
            toast.error(t("common.error"));
        }
    }, [user, resolved, savedId, lang, t, refreshCount]);

    return { savedId, toggle };
}
