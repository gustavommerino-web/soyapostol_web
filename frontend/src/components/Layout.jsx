import React from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { useFavoritesCount } from "@/contexts/FavoritesCountContext";
import {
    SignOut,
    SignIn,
    HouseSimple,
    BookOpen,
    Sun,
    BookBookmark,
    HandsPraying,
    Heart,
    Newspaper,
    BookOpenText,
    Books,
    Cross,
    DotsThreeVertical,
    Gear,
} from "@phosphor-icons/react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { Toaster } from "sonner";
import BiometricEnrollPrompt from "@/components/BiometricEnrollPrompt";

// Navigation ordering (UX rules):
//   Top-left logo → Dashboard (always)
//   Header right: Favorites · Settings · Sign-in/out (icon-only)
//   Mobile bottom-nav primary (visible): readings → prayers → examen → news
//   Mobile bottom-nav "More" sheet:      bible → catechism → liturgy → rosary
//   Desktop sidebar:                     dashboard + primary + secondary (same order)
const PRIMARY_NAV = [
    { to: "/readings",   key: "readings", Icon: BookOpen },
    { to: "/prayers",    key: "prayers",  Icon: HandsPraying },
    { to: "/examen",     key: "examen",   Icon: BookOpenText },
    { to: "/news",       key: "news",     Icon: Newspaper },
];
const SECONDARY_NAV = [
    { to: "/bible",      key: "bible",     Icon: BookBookmark },
    { to: "/catechism",  key: "catechism", Icon: Books },
    { to: "/liturgy",    key: "liturgy",   Icon: Sun },
    { to: "/rosary",     key: "rosary",    Icon: Cross },
];
const DASHBOARD_NAV = { to: "/", key: "dashboard", end: true, Icon: HouseSimple };
const ALL_NAV = [DASHBOARD_NAV, ...PRIMARY_NAV, ...SECONDARY_NAV];

export default function Layout() {
    const { user, logout } = useAuth();
    const { t } = useLang();
    const { count: favCount } = useFavoritesCount();
    const navigate = useNavigate();
    const [moreOpen, setMoreOpen] = React.useState(false);

    const onLogout = async () => { await logout(); navigate("/login"); };

    const primaryItems = PRIMARY_NAV;
    const secondaryItems = SECONDARY_NAV;

    return (
        <div className="min-h-screen bg-sand-50 text-stone900">
            {/* Sticky header */}
            <header
                className="sticky top-0 z-30 border-b border-sand-300 bg-sand-50/90 backdrop-blur-md"
                data-testid="app-header"
            >
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-3 sm:py-4 flex items-center justify-between gap-3">
                    <Link to="/" className="flex items-center gap-2.5 min-w-0" data-testid="header-logo">
                        <img src="/logo.png" alt="soyapostol" className="h-8 w-8 sm:h-9 sm:w-9 object-contain shrink-0" />
                        <div className="leading-none truncate">
                            <div className="heading-serif text-xl sm:text-2xl font-semibold tracking-tight">
                                {t("app_name")}
                            </div>
                        </div>
                    </Link>

                    <div className="flex items-center gap-2 sm:gap-3">
                        {/* Favorites */}
                        <NavLink
                            to="/favorites"
                            data-testid="header-favorites-link"
                            aria-label={favCount > 0
                                ? `${t("nav.favorites")} (${favCount})`
                                : t("nav.favorites")}
                            title={t("nav.favorites")}
                            className={({ isActive }) =>
                                `relative ui-sans text-sm flex items-center gap-2 px-2.5 sm:px-3 py-2 border rounded-md transition-colors ${
                                    isActive
                                        ? "border-sangre text-sangre bg-sangre/5"
                                        : "border-sand-300 hover:border-sangre text-stoneMuted hover:text-sangre"
                                }`
                            }
                        >
                            <Heart size={18} weight="duotone" />
                            {user && favCount > 0 && (
                                <span
                                    data-testid="header-favorites-badge"
                                    aria-hidden="true"
                                    className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-sangre text-sand-50 text-[10px] leading-[18px] font-semibold text-center ring-2 ring-sand-50"
                                >
                                    {favCount > 99 ? "99+" : favCount}
                                </span>
                            )}
                        </NavLink>

                        {/* Settings */}
                        <NavLink
                            to="/settings"
                            data-testid="header-settings-link"
                            aria-label={t("nav_more.settings")}
                            title={t("nav_more.settings")}
                            className={({ isActive }) =>
                                `ui-sans text-sm flex items-center gap-2 px-2.5 sm:px-3 py-2 border rounded-md transition-colors ${
                                    isActive
                                        ? "border-purple-400 text-purple-700 bg-purple-50"
                                        : "border-sand-300 hover:border-purple-400 text-stoneMuted hover:text-purple-700"
                                }`
                            }
                        >
                            <Gear size={18} weight="duotone" />
                        </NavLink>

                        {user ? (
                            <button
                                onClick={onLogout}
                                data-testid="logout-btn"
                                aria-label={t("nav.logout")}
                                title={t("nav.logout")}
                                className="ui-sans text-sm flex items-center gap-2 px-2.5 sm:px-3 py-2 border border-sand-300 rounded-md hover:border-sangre transition-colors"
                            >
                                <SignOut size={18} weight="duotone" />
                            </button>
                        ) : (
                            <Link
                                to="/login"
                                data-testid="header-login-link"
                                aria-label={t("nav.login")}
                                title={t("nav.login")}
                                className="ui-sans text-sm flex items-center gap-2 px-2.5 sm:px-3 py-2 border border-sand-300 rounded-md hover:border-sangre transition-colors"
                            >
                                <SignIn size={18} weight="duotone" />
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto flex">
                {/* Desktop sidebar (sticky, hidden on mobile) */}
                <aside
                    className="hidden lg:block w-60 shrink-0 border-r border-sand-300 self-start sticky top-[73px] h-[calc(100vh-73px)] py-8 px-6"
                    data-testid="sidebar-nav"
                >
                    <nav className="flex flex-col gap-1">
                        {ALL_NAV.map(({ to, key, end, Icon }) => (
                            <NavLink
                                key={key}
                                to={to}
                                end={end}
                                data-testid={`nav-${key}`}
                                className={({ isActive }) =>
                                    `ui-sans text-sm px-3 py-2 rounded-md border-l-2 transition-colors flex items-center gap-2.5 ${isActive ? "border-sangre text-sangre bg-sand-100 font-medium" : "border-transparent text-stoneMuted hover:text-stone900 hover:bg-sand-100/50"}`
                                }
                            >
                                <Icon size={18} weight="duotone" />
                                {t(`nav.${key}`)}
                            </NavLink>
                        ))}
                    </nav>
                </aside>

                {/* Main content — fixed reading width 720px, padding for bottom nav on mobile.
                    `min-w-0` is critical: without it, this flex item's default
                    `min-width: auto` would let inner `overflow-x-auto` rows
                    (e.g. /readings tab selector) push the whole page wider
                    than the viewport on mobile. */}
                <main
                    className="flex-1 min-w-0 px-4 sm:px-6 lg:px-12 py-8 lg:py-14 pb-28 lg:pb-14"
                    data-testid="main-content"
                >
                    <div className="max-w-[720px] mx-auto" data-testid="content-container">
                        <Outlet />
                    </div>
                </main>
            </div>

            {/* Footer (desktop only) */}
            <footer className="hidden lg:block border-t border-sand-300 py-6 px-6 lg:px-10 text-center">
                <p className="label-eyebrow">2026 Corazones a la Obra &middot; AD MAIOREM DEI GLORIAM</p>
            </footer>

            {/* Mobile bottom navigation */}
            <nav
                className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-sand-50/95 backdrop-blur-md border-t border-sand-300"
                data-testid="bottom-nav"
            >
                <div className="grid grid-cols-5 max-w-md mx-auto">
                    {primaryItems.map(({ to, key, end, Icon }) => (
                        <NavLink
                            key={key}
                            to={to}
                            end={end}
                            data-testid={`bottom-nav-${key}`}
                            className={({ isActive }) =>
                                `flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] uppercase tracking-wider transition-colors ${isActive ? "text-sangre" : "text-stoneMuted hover:text-stone900"}`
                            }
                        >
                            <Icon size={22} weight="duotone" />
                            <span className="truncate max-w-full px-1">{t(`nav.${key}`)}</span>
                        </NavLink>
                    ))}

                    <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                        <SheetTrigger asChild>
                            <button
                                type="button"
                                data-testid="bottom-nav-more"
                                className="flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] uppercase tracking-wider text-stoneMuted hover:text-stone900 transition-colors"
                            >
                                <DotsThreeVertical size={22} weight="bold" />
                                <span>{t("nav.more")}</span>
                            </button>
                        </SheetTrigger>
                        <SheetContent side="bottom" className="bg-sand-50 border-sand-300 rounded-t-2xl pb-8">
                            <SheetHeader className="text-left mb-4">
                                <SheetTitle className="heading-serif text-2xl">{t("nav.more")}</SheetTitle>
                            </SheetHeader>
                            <nav className="grid grid-cols-2 gap-2">
                                {secondaryItems.map(({ to, key, Icon }) => (
                                    <NavLink
                                        key={key}
                                        to={to}
                                        onClick={() => setMoreOpen(false)}
                                        data-testid={`more-nav-${key}`}
                                        className={({ isActive }) =>
                                            `ui-sans text-sm px-3 py-3 rounded-md border transition-colors flex items-center gap-2.5 ${isActive ? "border-sangre text-sangre bg-sand-100 font-medium" : "border-sand-300 text-stone900 hover:border-sangre"}`
                                        }
                                    >
                                        <Icon size={20} weight="duotone" />
                                        {t(`nav.${key}`)}
                                    </NavLink>
                                ))}
                            </nav>
                        </SheetContent>
                    </Sheet>
                </div>
                {/* Safe-area padding for iOS home indicator */}
                <div className="pb-[env(safe-area-inset-bottom)]" />
            </nav>

            <Toaster position="top-center" richColors closeButton />
            <BiometricEnrollPrompt />
        </div>
    );
}
