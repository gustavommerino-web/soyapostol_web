import React from "react";
import { useLang } from "@/contexts/LangContext";
import api from "@/lib/api";
import BackToTopButton from "@/components/BackToTopButton";
import { ArrowSquareOut, ArrowsClockwise, NewspaperClipping } from "@phosphor-icons/react";

const CACHE_PREFIX = "soyapostol:news:";          // soyapostol:news:{lang}:{source}
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;          // 12h hard cap
const CACHED_PREVIEW = 5;                          // items persisted per source

const SOURCES = ["all", "vatican", "aci"]; // tab order
const SOURCE_META = {
    vatican: {
        esLabel: "Vatican News",
        enLabel: "Vatican News",
        pillColor: "bg-sangre text-sand-50",
        pillSoft: "bg-sangre/10 text-sangre",
    },
    aci: {
        // Spanish shows "ACI Prensa"; English shows the sister agency "EWTN News".
        esLabel: "ACI Prensa",
        enLabel: "EWTN News",
        pillColor: "bg-stone900 text-sand-50",
        pillSoft: "bg-stone900/10 text-stone900",
    },
};

function cacheKey(lang, source) {
    return `${CACHE_PREFIX}${lang}:${source}`;
}

function readCache(lang, source) {
    try {
        const raw = localStorage.getItem(cacheKey(lang, source));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.items)) return null;
        if (parsed.savedAt && Date.now() - parsed.savedAt > CACHE_TTL_MS) {
            localStorage.removeItem(cacheKey(lang, source));
            return null;
        }
        return parsed;
    } catch { return null; }
}

function writeCache(lang, source, items) {
    try {
        // "all" is cached in full so tab switching stays instantaneous; single
        // sources slim to 5 items per the product brief.
        const slice = source === "all" ? items : items.slice(0, CACHED_PREVIEW);
        localStorage.setItem(
            cacheKey(lang, source),
            JSON.stringify({ savedAt: Date.now(), items: slice }),
        );
    } catch { /* storage full */ }
}

export default function News() {
    const { t, lang } = useLang();
    const [source, setSource] = React.useState("all");
    const [itemsByKey, setItemsByKey] = React.useState(() => {
        // Hydrate all three sources from localStorage so switching tabs is
        // instant — even before any network call completes.
        const initial = {};
        SOURCES.forEach((s) => {
            initial[`${lang}:${s}`] = readCache(lang, s)?.items || [];
        });
        return initial;
    });
    const [loading, setLoading] = React.useState({});
    const [refreshing, setRefreshing] = React.useState(false);

    const currentKey = `${lang}:${source}`;
    const items = itemsByKey[currentKey] || [];
    const isLoading = loading[currentKey] && items.length === 0;

    const fmtDate = React.useCallback((s) => {
        if (!s) return "";
        try {
            return new Date(s).toLocaleDateString(lang === "es" ? "es-ES" : "en-US",
                { day: "numeric", month: "short", year: "numeric" });
        } catch { return s; }
    }, [lang]);

    const load = React.useCallback(async (src, refresh = false) => {
        const key = `${lang}:${src}`;
        if (refresh) setRefreshing(true);
        else setLoading((m) => ({ ...m, [key]: true }));
        try {
            const r = await api.get(
                `/news?lang=${lang}&source=${src}${refresh ? "&refresh=true" : ""}`,
            );
            const fresh = r.data.items || [];
            setItemsByKey((m) => ({ ...m, [key]: fresh }));
            writeCache(lang, src, fresh);
        } catch { /* keep cache */ }
        finally {
            setLoading((m) => ({ ...m, [key]: false }));
            if (refresh) setRefreshing(false);
        }
    }, [lang]);

    // Prefetch all three sources in parallel whenever language changes so tab
    // switches stay instant. Cache-hydrated entries are already on screen.
    React.useEffect(() => {
        // Rehydrate from cache for the new language
        setItemsByKey((prev) => {
            const next = { ...prev };
            SOURCES.forEach((s) => {
                const k = `${lang}:${s}`;
                if (!next[k] || next[k].length === 0) {
                    next[k] = readCache(lang, s)?.items || [];
                }
            });
            return next;
        });
        SOURCES.forEach((s) => { load(s); });
    }, [lang, load]);

    return (
        <div className="max-w-5xl mx-auto" data-testid="news-page">
            <div className="flex items-center justify-between mb-3">
                <p className="label-eyebrow">{t("nav.news")}</p>
                <button
                    onClick={() => load(source, true)}
                    disabled={refreshing}
                    data-testid="news-refresh-btn"
                    className="ui-sans text-xs uppercase tracking-widest text-stoneMuted hover:text-sangre inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                    <ArrowsClockwise size={14} weight="bold"
                        className={refreshing ? "animate-spin" : ""} />
                    {t("common.refresh")}
                </button>
            </div>
            <h1 className="heading-serif text-4xl sm:text-5xl tracking-tight leading-none mb-3"
                data-testid="news-title">
                {t("nav.news")}
            </h1>
            <p className="text-stoneMuted mb-6 max-w-2xl">{t("sections.news_desc")}</p>

            {/* Source tabs */}
            <div
                role="tablist"
                aria-label={t("news.tabs_label")}
                className="flex flex-wrap gap-2 mb-6 border-b border-sand-300 pb-0"
                data-testid="news-source-tabs"
            >
                {SOURCES.map((s) => {
                    const active = s === source;
                    const label = s === "all"
                        ? t("news.tab_all")
                        : (lang === "es"
                            ? SOURCE_META[s].esLabel
                            : SOURCE_META[s].enLabel);
                    return (
                        <button
                            key={s}
                            role="tab"
                            aria-selected={active}
                            onClick={() => setSource(s)}
                            data-testid={`news-tab-${s}`}
                            className={`ui-sans text-sm font-semibold px-4 py-2 -mb-px border-b-2 transition-colors ${
                                active
                                    ? "border-sangre text-sangre"
                                    : "border-transparent text-stoneMuted hover:text-stone900"
                            }`}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            {/* Source attribution line */}
            <p className="ui-sans text-xs text-stoneMuted mb-8 inline-flex items-center gap-1.5"
               data-testid="news-source-credit">
                <NewspaperClipping size={14} weight="duotone" />
                {source === "all" ? (
                    <>
                        {t("news.source_credit")}{" "}
                        <SourceLink lang={lang} id="vatican" />
                        {" · "}
                        <SourceLink lang={lang} id="aci" />
                    </>
                ) : (
                    <>
                        {t("news.source_credit")}{" "}
                        <SourceLink lang={lang} id={source} />
                    </>
                )}
            </p>

            {isLoading && (
                <p className="text-stoneMuted" data-testid="news-loading">{t("common.loading")}</p>
            )}
            {!isLoading && items.length === 0 && (
                <p className="text-stoneMuted" data-testid="news-empty">{t("news.empty")}</p>
            )}

            <ul className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="news-list">
                {items.map((n, idx) => (
                    <NewsCard
                        key={n.link || `${idx}-${n.title}`}
                        item={n}
                        idx={idx}
                        lang={lang}
                        showBadge={source === "all"}
                        formatDate={fmtDate}
                        viewLabel={t("common.view")}
                    />
                ))}
            </ul>

            <BackToTopButton testId="news-back-to-top" />
        </div>
    );
}

function SourceLink({ lang, id }) {
    const hrefMap = {
        vatican: `https://www.vaticannews.va/${lang === "en" ? "en" : "es"}.html`,
        aci: lang === "es"
            ? "https://www.aciprensa.com/"
            : "https://www.ewtnnews.com/",
    };
    const label = lang === "es"
        ? (id === "vatican" ? "Vatican News" : "ACI Prensa")
        : (id === "vatican" ? "Vatican News" : "EWTN News");
    return (
        <a href={hrefMap[id]} target="_blank" rel="noreferrer"
            className="hover:text-sangre">{label}</a>
    );
}

function NewsCard({ item, idx, lang, showBadge, formatDate, viewLabel }) {
    const [imgError, setImgError] = React.useState(false);
    const showImage = item.image && !imgError;
    const meta = SOURCE_META[item.source_id];
    const badgeLabel = meta
        ? (lang === "es" ? meta.esLabel : meta.enLabel)
        : item.source;
    return (
        <li
            className="surface-card overflow-hidden p-0 flex flex-col"
            data-testid={`news-item-${idx}`}
            data-source-id={item.source_id || ""}
        >
            {showImage && (
                <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="relative block bg-sand-200 aspect-[16/9] overflow-hidden"
                    tabIndex={-1}
                >
                    <img
                        src={item.image}
                        alt=""
                        loading="lazy"
                        onError={() => setImgError(true)}
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-[1.02]"
                        data-testid={`news-item-${idx}-image`}
                    />
                    {showBadge && meta && (
                        <span
                            className={`absolute top-3 left-3 ui-sans text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded-md shadow-sm ${meta.pillColor}`}
                            data-testid={`news-item-${idx}-badge`}
                        >
                            {badgeLabel}
                        </span>
                    )}
                </a>
            )}
            <div className="p-6 flex flex-col flex-1">
                <div className="flex items-center justify-between mb-3 gap-3">
                    {(!showImage && showBadge && meta) ? (
                        <span
                            className={`ui-sans text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-md ${meta.pillSoft}`}
                            data-testid={`news-item-${idx}-badge`}
                        >
                            {badgeLabel}
                        </span>
                    ) : (
                        <span className="label-eyebrow text-sangre">{item.source}</span>
                    )}
                    <span className="text-xs text-stoneFaint">{formatDate(item.published)}</span>
                </div>
                <h3 className="heading-serif text-2xl leading-snug tracking-tight mb-2">
                    {item.title}
                </h3>
                <p className="text-sm text-stoneMuted leading-relaxed flex-1">{item.summary}</p>
                {item.link && (
                    <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 ui-sans text-xs uppercase tracking-widest text-sangre hover:underline inline-flex items-center gap-1.5 self-start"
                        data-testid={`news-item-${idx}-link`}
                    >
                        {viewLabel} <ArrowSquareOut size={12} />
                    </a>
                )}
            </div>
        </li>
    );
}
