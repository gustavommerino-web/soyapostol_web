import React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
import { loadBible } from "@/pages/Bible";
import { VerseOfTheDayCard, VerseOfTheDaySkeleton } from "@/components/VerseOfTheDayCard";
import { useVotdFavorite } from "@/hooks/useVotdFavorite";

// Deterministic day-of-year so every user sees the same verse on the same
// day, independent of timezone jitter. We use local-date components so the
// verse "resets" at local midnight, which matches a user's intuition of
// "hoy" / "today".
function dayOfYear(d = new Date()) {
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d - start) / 86_400_000);
}

// Resolve a verse entry ({en, es, chapter, verse}) against the Bible data
// for the current language. Returns { book, bookDisplay, chapter, verse,
// text } or null when the verse can't be found (numbering drift, missing
// deuterocanonical, etc.).
function resolveVerse(entry, data, lang) {
    if (!data || !entry) return null;
    const bookName = lang === "es" ? entry.es : entry.en;
    const book = data.books.find((b) => b.name === bookName);
    if (!book) return null;
    const chapter = book.chapters.find((c) => c.chapter === entry.chapter);
    if (!chapter) return null;
    const verse = chapter.verses.find((v) => v.verse === entry.verse);
    if (!verse) return null;
    return {
        book: book.name,
        bookDisplay: book.name,
        chapter: entry.chapter,
        verse: entry.verse,
        text: verse.text,
    };
}

export default function VerseOfTheDay() {
    const { t, lang } = useLang();
    const navigate = useNavigate();

    const [list, setList] = React.useState(null);
    const [data, setData] = React.useState(null);
    const [idx, setIdx] = React.useState(null);
    const [error, setError] = React.useState("");

    // Load the curated verse list once.
    React.useEffect(() => {
        let cancelled = false;
        fetch("/data/verse-of-the-day.json", { cache: "force-cache" })
            .then((r) => r.json())
            .then((j) => { if (!cancelled) setList(j.verses || []); })
            .catch(() => {
                if (!cancelled) {
                    setError("list");
                }
            });
        return () => { cancelled = true; };
    }, []);

    // Load the Bible for the current language (reuses IDB cache).
    React.useEffect(() => {
        let cancelled = false;
        loadBible(lang)
            .then((d) => { if (!cancelled) setData(d); })
            .catch(() => {
                if (!cancelled) {
                    setError("bible");
                }
            });
        return () => { cancelled = true; };
    }, [lang]);

    // Pick today's index, skipping entries that can't resolve in this
    // translation. We iterate at most list.length times so a fully broken
    // list settles into an error state instead of spinning.
    React.useEffect(() => {
        if (!list || list.length === 0 || !data) return;
        const base = dayOfYear() % list.length;
        for (let step = 0; step < list.length; step += 1) {
            const tryIdx = (base + step) % list.length;
            if (resolveVerse(list[tryIdx], data, lang)) {
                setIdx(tryIdx);
                return;
            }
        }
        setError("resolve");
    }, [list, data, lang]);

    const current = idx != null && list ? list[idx] : null;
    const resolved = React.useMemo(
        () => resolveVerse(current, data, lang),
        [current, data, lang],
    );

    const { savedId, toggle: toggleFavorite } = useVotdFavorite({ resolved });

    if (!resolved) {
        // Hide on hard errors; subtle skeleton while loading so the
        // Dashboard layout doesn't jump.
        return error ? null : <VerseOfTheDaySkeleton />;
    }

    const reference = `${resolved.bookDisplay} ${resolved.chapter}:${resolved.verse}`;
    const formatted = `"${resolved.text}" — ${reference}`;

    const doCopy = async () => {
        try {
            await navigator.clipboard.writeText(formatted);
            toast.success(t("bible.verse_copied"));
        } catch {
            toast.error(t("common.error"));
        }
    };

    const doShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({ title: t("bible.share_title"), text: formatted });
                return;
            } catch {
                // User cancelled or browser blocked it — fall back to copy.
            }
        }
        await doCopy();
    };

    const doFavorite = () => toggleFavorite({
        onUnauthenticated: () => navigate("/login"),
    });

    const goToBible = () => {
        const ref = `${resolved.book}|${resolved.chapter}|${resolved.verse}`;
        navigate(`/bible?ref=${encodeURIComponent(ref)}`);
    };

    return (
        <VerseOfTheDayCard
            reference={reference}
            text={resolved.text}
            saved={!!savedId}
            onFavorite={doFavorite}
            onCopy={doCopy}
            onShare={doShare}
            onOpenBible={goToBible}
        />
    );
}
