import React from "react";
import { useLang } from "@/contexts/LangContext";
import { useAuth } from "@/contexts/AuthContext";
import { useFavoritesCount } from "@/contexts/FavoritesCountContext";
import api from "@/lib/api";
import { toast } from "sonner";
import BackToTopButton from "@/components/BackToTopButton";
import PrayersAdmin from "@/components/PrayersAdmin";
import { useLongPress, ContextMenu } from "@/components/LongPressMenu";
import { useNavigate } from "react-router-dom";
import {
    CaretLeft, MagnifyingGlass, Heart, Copy, ShareNetwork, DotsThreeVertical,
} from "@phosphor-icons/react";

const PRAYERS_CHANGED = "soyapostol-prayers-changed";

export default function Prayers() {
    const { lang, t } = useLang();
    const { user } = useAuth();
    const isAdmin = user && user.role === "admin";

    const [categories, setCategories] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [query, setQuery] = React.useState("");
    const [selected, setSelected] = React.useState(null);
    const [content, setContent] = React.useState(null);
    const [contentLoading, setContentLoading] = React.useState(false);

    const refresh = React.useCallback(async () => {
        setLoading(true);
        try {
            const r = await api.get(`/prayers?lang=${lang}`);
            setCategories(r.data.categories || []);
        } finally {
            setLoading(false);
        }
    }, [lang]);

    React.useEffect(() => {
        setSelected(null); setContent(null);
        refresh();
    }, [refresh]);

    React.useEffect(() => {
        const handler = () => refresh();
        window.addEventListener(PRAYERS_CHANGED, handler);
        return () => window.removeEventListener(PRAYERS_CHANGED, handler);
    }, [refresh]);

    const open = async (item) => {
        setSelected(item);
        setContent(null);
        setContentLoading(true);
        try {
            const res = await api.get(`/prayers/${item.slug}?lang=${lang}`);
            setContent(res.data);
        } finally { setContentLoading(false); }
    };

    const filteredCategories = React.useMemo(() => {
        if (!query) return categories;
        const q = query.toLowerCase();
        return categories
            .map((c) => ({ ...c, items: c.items.filter((i) => i.title.toLowerCase().includes(q)) }))
            .filter((c) => c.items.length > 0);
    }, [categories, query]);

    if (selected) {
        return (
            <div className="max-w-3xl mx-auto" data-testid="prayer-detail-page">
                <button onClick={() => { setSelected(null); setContent(null); }}
                    data-testid="prayer-back-btn"
                    className="inline-flex items-center gap-1.5 text-sm text-stoneMuted hover:text-sangre mb-8">
                    <CaretLeft size={14} weight="bold" /> {t("nav.prayers")}
                </button>
                {contentLoading && <p className="text-stoneMuted">{t("common.loading")}</p>}
                {content && (
                    <article className="reading-prose">
                        <div className="relative flex items-center justify-between border-b border-sand-300 pb-2 mb-6 gap-4">
                            <h1 className="heading-serif text-3xl sm:text-4xl tracking-tight leading-tight m-0">{content.title}</h1>
                            <PrayerDetailMenuButton content={content} />
                        </div>
                        {content.content.split(/\n+/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
                    </article>
                )}
                <BackToTopButton testId="prayer-detail-back-to-top" />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto" data-testid="prayers-page">
            <p className="label-eyebrow mb-3">{t("nav.prayers")}</p>
            <h1 className="heading-serif text-4xl sm:text-5xl tracking-tight leading-none mb-3">{t("nav.prayers")}</h1>
            <p className="text-stoneMuted mb-2 max-w-2xl">{t("sections.prayers_desc")}</p>
            <p className="text-xs text-stoneFaint italic mb-10">{t("prayers_actions.long_press_hint")}</p>

            {isAdmin && (
                <PrayersAdmin apiCategories={categories} />
            )}

            <div className="relative mb-12 max-w-md">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stoneFaint" />
                <input value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("common.search")}
                    data-testid="prayers-search-input"
                    className="w-full pl-9 pr-3 py-2.5 bg-sand-100 border border-sand-300 rounded-md ui-sans text-sm focus:outline-none focus:border-sangre" />
            </div>

            {loading && <p className="text-stoneMuted" data-testid="prayers-loading">{t("common.loading")}</p>}
            {!loading && categories.length === 0 && (
                <p className="text-stoneMuted" data-testid="prayers-empty">
                    {lang === "en" ? "English prayer catalog coming soon." : "No hay oraciones disponibles."}
                </p>
            )}

            <div className="space-y-12" data-testid="prayers-categories">
                {filteredCategories.map((cat) => (
                    <section key={cat.category} data-testid={`cat-${cat.category}`}>
                        <h2 className="heading-serif text-2xl tracking-tight mb-5 border-b border-sand-300 pb-2">
                            {cat.category}
                        </h2>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {cat.items.map((item) => (
                                <PrayerCard
                                    key={item.slug}
                                    item={item}
                                    category={cat.category}
                                    onOpen={() => open(item)}
                                />
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
            <BackToTopButton testId="prayers-back-to-top" />
        </div>
    );
}

/* ================================================================== */
/* PrayerCard with long-press context menu                            */
/* ================================================================== */

function PrayerCard({ item, category, onOpen }) {
    const [menuOpen, setMenuOpen] = React.useState(false);

    // useLongPress fires on a 500ms hold (or right-click on desktop). The
    // hook's `onPointerUp` swallows the next click event when the timer
    // fires, so the regular onClick→onOpen handler won't run.
    const handlers = useLongPress(() => setMenuOpen(true));

    return (
        <li className="relative">
            <button
                onClick={onOpen}
                data-testid={`prayer-item-${item.slug}`}
                className="surface-card w-full text-left p-4 hover:border-sangre transition-colors select-none"
                style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
                {...handlers}
            >
                <p className="reading-serif text-base leading-snug">{item.title}</p>
            </button>
            {menuOpen && (
                <PrayerContextMenu
                    item={item}
                    category={category}
                    onDismiss={() => setMenuOpen(false)}
                />
            )}
        </li>
    );
}

function PrayerContextMenu({ item, category, onDismiss }) {
    const { t, lang } = useLang();
    const { user } = useAuth();
    const { refresh: refreshCount } = useFavoritesCount();
    const navigate = useNavigate();

    // Lazily fetch the body when an action that needs it is invoked. The
    // promise is cached so repeated taps don't re-hit the API.
    const cached = React.useRef(null);
    const fetchPrayer = React.useCallback(async () => {
        if (cached.current) return cached.current;
        cached.current = (async () => {
            const res = await api.get(`/prayers/${item.slug}?lang=${lang}`);
            return res.data;
        })();
        try {
            return await cached.current;
        } catch (e) {
            cached.current = null;
            throw e;
        }
    }, [item.slug, lang]);

    const formatBody = (data) => {
        // Title + category header + content. Mirrors the user request:
        // "title, category, content" all in one shareable block.
        return `${data.title}\n[${category}]\n\n${data.content}`.trim();
    };

    const doCopy = async () => {
        try {
            const data = await fetchPrayer();
            await navigator.clipboard.writeText(formatBody(data));
            toast.success(t("prayers_actions.copied"));
        } catch {
            toast.error(t("common.error"));
        }
    };

    const doShare = async () => {
        let data;
        try {
            data = await fetchPrayer();
        } catch {
            toast.error(t("common.error"));
            return;
        }
        const text = formatBody(data);
        if (navigator.share) {
            try {
                await navigator.share({
                    title: t("prayers_actions.share_title"),
                    text,
                    url: data.source_url || undefined,
                });
                return;
            } catch { /* user cancelled — silently fall through to copy */ }
        }
        try {
            await navigator.clipboard.writeText(text);
            toast.success(t("prayers_actions.copied"));
        } catch {
            toast.error(t("common.error"));
        }
    };

    const doFavorite = async () => {
        if (!user) { navigate("/login"); return; }
        try {
            const data = await fetchPrayer();
            await api.post("/favorites", {
                section: "prayers",
                title: data.title,
                content: data.content,
                source_url: data.source_url,
                metadata: { category },
                lang,
            });
            refreshCount();
            toast.success(t("common.saved"));
        } catch {
            toast.error(t("common.error"));
        }
    };

    const items = [
        {
            id: "fav",
            label: t("common.save_favorite"),
            icon: <Heart size={16} weight="duotone" />,
            onSelect: doFavorite,
        },
        {
            id: "copy",
            label: t("prayers_actions.copy"),
            icon: <Copy size={16} weight="duotone" />,
            onSelect: doCopy,
        },
        {
            id: "share",
            label: t("prayers_actions.share"),
            icon: <ShareNetwork size={16} weight="duotone" />,
            onSelect: doShare,
        },
    ];

    return (
        <ContextMenu
            items={items}
            onDismiss={onDismiss}
            testId={`prayer-menu-${item.slug}`}
        />
    );
}

/* ================================================================== */
/* PrayerDetailMenuButton — 3-dot context menu rendered in the prayer  */
/* detail header (replaces the old "Add to Favorites" button to keep   */
/* parity with Readings cards). Operates on the already-loaded         */
/* `content` payload to avoid a redundant fetch.                       */
/* ================================================================== */

function PrayerDetailMenuButton({ content }) {
    const { t, lang } = useLang();
    const { user } = useAuth();
    const { refresh: refreshCount } = useFavoritesCount();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = React.useState(false);

    const formatBody = () => {
        const cat = content.category ? `[${content.category}]\n\n` : "";
        return `${content.title}\n${cat}${content.content}`.trim();
    };

    const doFavorite = async () => {
        if (!user) { navigate("/login"); return; }
        try {
            await api.post("/favorites", {
                section: "prayers",
                title: content.title,
                content: content.content,
                source_url: content.source_url,
                metadata: { category: content.category },
                lang,
            });
            refreshCount();
            toast.success(t("common.saved"));
        } catch {
            toast.error(t("common.error"));
        }
    };

    const doCopy = async () => {
        try {
            await navigator.clipboard.writeText(formatBody());
            toast.success(t("prayers_actions.copied"));
        } catch {
            toast.error(t("common.error"));
        }
    };

    const doShare = async () => {
        const text = formatBody();
        if (navigator.share) {
            try {
                await navigator.share({
                    title: t("prayers_actions.share_title"),
                    text,
                    url: content.source_url || undefined,
                });
                return;
            } catch { /* user cancelled — silently fall through to copy */ }
        }
        try {
            await navigator.clipboard.writeText(text);
            toast.success(t("prayers_actions.copied"));
        } catch {
            toast.error(t("common.error"));
        }
    };

    const items = [
        {
            id: "fav",
            label: t("common.save_favorite"),
            icon: <Heart size={16} weight="duotone" />,
            onSelect: doFavorite,
        },
        {
            id: "copy",
            label: t("prayers_actions.copy"),
            icon: <Copy size={16} weight="duotone" />,
            onSelect: doCopy,
        },
        {
            id: "share",
            label: t("prayers_actions.share"),
            icon: <ShareNetwork size={16} weight="duotone" />,
            onSelect: doShare,
        },
    ];

    return (
        <>
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(true); }}
                aria-label={t("common.save_favorite")}
                title={t("prayers_actions.long_press_hint")}
                data-testid="prayer-detail-actions-btn"
                className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md text-stoneMuted hover:text-sangre hover:bg-sangre/5 transition-colors"
            >
                <DotsThreeVertical size={20} weight="bold" />
            </button>
            {menuOpen && (
                <ContextMenu
                    items={items}
                    onDismiss={() => setMenuOpen(false)}
                    testId="prayer-detail-menu"
                />
            )}
        </>
    );
}
