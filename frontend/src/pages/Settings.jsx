import React from "react";
import { useNavigate } from "react-router-dom";
import { useLang } from "@/contexts/LangContext";
import { useAuth } from "@/contexts/AuthContext";
import {
    Info,
    Shield,
    EnvelopeSimple,
    ArrowSquareOut,
    HandsPraying,
    WarningOctagon,
    Trash,
    X,
    SpinnerGap,
    Translate,
    FingerprintSimple,
} from "@phosphor-icons/react";
import {
    registerPasskey,
    listPasskeys,
    deletePasskey,
    platformAuthenticatorAvailable,
    passkeyHint,
} from "@/lib/webauthn";
import { toast } from "sonner";

const PRIVACY_POLICY_URL = "/privacy-policy.html";
const SUPPORT_EMAIL     = "gustavommerino@gmail.com";
const APP_VERSION       = "1.0.0";
const APP_DOMAIN        = "soyapostol.org";
const APP_LOCATION      = "Houston, TX, US";

// Domains that appear in the Credits / Fair-Use blocks and must be rendered
// as clickable external links. Every match (case-insensitive) is wrapped in
// an <a target="_blank">.
const SOURCE_LINKS = [
    { domain: "evangelizo.org",   url: "https://evangelizo.org" },
    { domain: "evangeli.net",     url: "https://evangeli.net" },
    { domain: "divineoffice.org", url: "https://divineoffice.org" },
    { domain: "ibreviary.com",    url: "https://www.ibreviary.com" },
    { domain: "vaticannews.va",   url: "https://www.vaticannews.va" },
    { domain: "aciprensa.com",    url: "https://www.aciprensa.com" },
    { domain: "ewtnnews.com",     url: "https://www.ewtnnews.com" },
];

// Words that must render in bold liturgical purple inside the "Quiénes Somos"
// body. Order matters only in that longer matches should be tried first so a
// substring doesn't steal a larger token.
const ES_EMPHASIS = [
    "Corazones A La Obra",
    "Señor Jesucristo",
    "Virgen María",
    "¡Soy Apóstol!",
    "tiempo",
    "talento",
    "tesoro",
];
const EN_EMPHASIS = [
    "Corazones A La Obra",
    "Lord Jesus Christ",
    "Virgin Mary",
    "I Am an Apostle!",
    "time",
    "talent",
    "treasure",
];

// Emphasise whole-word matches + embed the soyapostol.org link. Returns an
// array of React nodes.
function decorateParagraph(text, emphasisWords) {
    // Escape + longest-first so "Corazones A La Obra" wins over sub-tokens.
    const sorted = [...emphasisWords].sort((a, b) => b.length - a.length);
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const emphRe = new RegExp(`(${sorted.map(esc).join("|")})`, "g");
    const linkRe = /(soyapostol\.org)/g;

    // First split by soyapostol.org so the link is independent of emphasis.
    const linkParts = text.split(linkRe);
    const nodes = [];
    linkParts.forEach((chunk, li) => {
        if (chunk === APP_DOMAIN) {
            nodes.push(
                <a
                    key={`link-${li}`}
                    href={`https://${APP_DOMAIN}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="settings-soyapostol-link"
                    className="text-purple-700 font-semibold hover:text-purple-900 underline decoration-purple-300 underline-offset-4 transition-colors"
                >
                    {APP_DOMAIN}
                </a>,
            );
            return;
        }
        // For the non-link chunk, split by emphasis words.
        const parts = chunk.split(emphRe);
        parts.forEach((p, pi) => {
            if (!p) return;
            if (sorted.includes(p)) {
                nodes.push(
                    <strong
                        key={`em-${li}-${pi}`}
                        className="font-semibold text-purple-700"
                    >
                        {p}
                    </strong>,
                );
            } else {
                nodes.push(<React.Fragment key={`t-${li}-${pi}`}>{p}</React.Fragment>);
            }
        });
    });
    return nodes;
}

// Render a paragraph turning every known source-domain occurrence into a
// clickable external link. Used for the Credits + Fair-Use blocks.
function linkifySources(text) {
    if (!text) return null;
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = SOURCE_LINKS.map((s) => escape(s.domain)).join("|");
    if (!pattern) return text;
    const re = new RegExp(`(${pattern})`, "gi");
    const parts = text.split(re);
    return parts.map((p, i) => {
        const match = SOURCE_LINKS.find(
            (s) => s.domain.toLowerCase() === p.toLowerCase(),
        );
        if (!match) return <React.Fragment key={i}>{p}</React.Fragment>;
        return (
            <a
                key={i}
                href={match.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`settings-source-link-${match.domain}`}
                className="inline-flex items-baseline gap-1.5 text-purple-700 hover:text-purple-900 underline decoration-purple-300 underline-offset-4 transition-colors"
            >
                <img
                    src={`https://www.google.com/s2/favicons?domain=${match.domain}&sz=32`}
                    alt=""
                    width="16"
                    height="16"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    aria-hidden="true"
                    className="self-center w-4 h-4 rounded-sm shrink-0"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
                <span>{p}</span>
            </a>
        );
    });
}


// ----------------------------------------------------------------------
// BiometricSection — Face ID / Touch ID enrol + manage registered devices
// ----------------------------------------------------------------------

function BiometricSection({ lang, t }) {
    const [supported, setSupported] = React.useState(null); // null = checking
    const [creds, setCreds] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [busy, setBusy] = React.useState(false);

    const refresh = React.useCallback(async () => {
        setLoading(true);
        try {
            const list = await listPasskeys();
            setCreds(list);
            if (list.length > 0) passkeyHint.set();
            else passkeyHint.clear();
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        let cancelled = false;
        platformAuthenticatorAvailable().then((ok) => {
            if (!cancelled) setSupported(ok);
        });
        refresh();
        return () => { cancelled = true; };
    }, [refresh]);

    const onEnable = async () => {
        setBusy(true);
        try {
            await registerPasskey();
            toast.success(lang === "es" ? "Biometría activada" : "Biometric enabled");
            await refresh();
        } catch (e) {
            const name = e?.name || "";
            if (name === "NotAllowedError" || name === "AbortError") {
                // user cancelled → silent
            } else if (e?.response?.status === 400 || e?.response?.status === 401) {
                toast.error(lang === "es" ? "No se pudo registrar" : "Could not register");
            } else {
                toast.error(lang === "es" ? "Error al activar biometría" : "Failed to enable biometric");
            }
        } finally {
            setBusy(false);
        }
    };

    const onForget = async (cid) => {
        setBusy(true);
        try {
            await deletePasskey(cid);
            toast.success(lang === "es" ? "Dispositivo eliminado" : "Device removed");
            await refresh();
        } catch {
            toast.error(t("common.error"));
        } finally {
            setBusy(false);
        }
    };

    // Don't show the section at all if the device can't do biometrics
    // AND the user has no existing credentials registered elsewhere.
    if (supported === false && creds.length === 0) return null;

    return (
        <section className="mb-12" data-testid="settings-biometric">
            <header className="flex items-center gap-3 mb-5">
                <span
                    className="shrink-0 w-10 h-10 rounded-full bg-sangre/10 text-sangre flex items-center justify-center"
                    aria-hidden="true"
                >
                    <FingerprintSimple size={20} weight="duotone" />
                </span>
                <div>
                    <p className="label-eyebrow">{lang === "es" ? "Seguridad" : "Security"}</p>
                    <h2 className="heading-serif text-2xl sm:text-3xl tracking-tight m-0">
                        {lang === "es" ? "Face ID / Touch ID" : "Face ID / Touch ID"}
                    </h2>
                </div>
            </header>

            <article className="surface-card p-5 sm:p-6" data-testid="settings-biometric-card">
                <p className="ui-sans text-sm leading-relaxed text-stoneMuted mb-4">
                    {lang === "es"
                        ? "Activa el inicio de sesión con biometría para entrar más rápido y de forma segura. La huella o reconocimiento facial se guarda solo en este dispositivo."
                        : "Enable biometric sign-in for faster, more secure access. Your fingerprint or face data stays on this device only."}
                </p>

                {loading && <p className="text-stoneMuted text-sm">{t("common.loading")}</p>}

                {!loading && (
                    <>
                        {supported && (
                            <button
                                type="button"
                                onClick={onEnable}
                                disabled={busy}
                                data-testid="settings-biometric-enable"
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-sangre text-sand-50 ui-sans text-sm font-semibold hover:bg-sangre/90 transition-colors disabled:opacity-60"
                            >
                                <FingerprintSimple size={16} weight="duotone" />
                                {busy
                                    ? t("common.loading")
                                    : (lang === "es" ? "Activar en este dispositivo" : "Enable on this device")}
                            </button>
                        )}
                        {!supported && (
                            <p className="text-sm text-stoneFaint italic" data-testid="settings-biometric-unsupported">
                                {lang === "es"
                                    ? "Este navegador o dispositivo no admite biometría (Face ID / Touch ID)."
                                    : "This browser or device does not support biometric authentication."}
                            </p>
                        )}

                        {creds.length > 0 && (
                            <div className="mt-6" data-testid="settings-biometric-list">
                                <p className="label-eyebrow mb-3">
                                    {lang === "es" ? "Dispositivos registrados" : "Registered devices"}
                                </p>
                                <ul className="space-y-2">
                                    {creds.map((c) => (
                                        <li
                                            key={c.credential_id}
                                            data-testid={`settings-biometric-item-${c.credential_id.slice(0, 8)}`}
                                            className="flex items-center justify-between gap-4 p-3 border border-sand-300 rounded-md"
                                        >
                                            <div className="min-w-0">
                                                <p className="ui-sans text-sm font-semibold text-stone900 truncate">
                                                    {c.device_name || (lang === "es" ? "Dispositivo" : "Device")}
                                                </p>
                                                <p className="text-xs text-stoneFaint">
                                                    {lang === "es" ? "Registrado: " : "Registered: "}
                                                    {c.created_at ? new Date(c.created_at).toLocaleDateString(lang === "es" ? "es-ES" : "en-US") : "—"}
                                                    {c.last_used_at && (
                                                        <>
                                                            {" · "}
                                                            {lang === "es" ? "último uso " : "last used "}
                                                            {new Date(c.last_used_at).toLocaleDateString(lang === "es" ? "es-ES" : "en-US")}
                                                        </>
                                                    )}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => onForget(c.credential_id)}
                                                disabled={busy}
                                                aria-label={lang === "es" ? "Olvidar dispositivo" : "Forget device"}
                                                title={lang === "es" ? "Olvidar dispositivo" : "Forget device"}
                                                data-testid={`settings-biometric-forget-${c.credential_id.slice(0, 8)}`}
                                                className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md text-stoneMuted hover:text-sangre hover:bg-sangre/5 disabled:opacity-50"
                                            >
                                                <Trash size={16} weight="duotone" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}
            </article>
        </section>
    );
}


export default function Settings() {
    const { t, lang, setLang } = useLang();
    const { user, deleteAccount } = useAuth();
    const navigate = useNavigate();

    const emphasis = lang === "es" ? ES_EMPHASIS : EN_EMPHASIS;
    const paragraphs = [
        t("settings.about.p1"),
        t("settings.about.p2"),
        t("settings.about.p3_heading"),   // rendered as subheading below
        t("settings.about.p4"),
    ];

    const [confirmOpen, setConfirmOpen] = React.useState(false);
    const [confirmEmail, setConfirmEmail] = React.useState("");
    const [deleting, setDeleting] = React.useState(false);
    const [deleteError, setDeleteError] = React.useState("");

    const onContactSupport = () => {
        const subject = encodeURIComponent(t("settings.support.subject"));
        const body    = encodeURIComponent(t("settings.support.body"));
        window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    };

    const onOpenPrivacy = () => {
        window.open(PRIVACY_POLICY_URL, "_blank", "noopener,noreferrer");
    };

    const openDeleteModal = () => {
        setConfirmEmail("");
        setDeleteError("");
        setConfirmOpen(true);
    };

    const closeDeleteModal = () => {
        if (deleting) return;
        setConfirmOpen(false);
    };

    const onConfirmDelete = async (e) => {
        e?.preventDefault();
        if (!user || !user.email) return;
        if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
            setDeleteError(t("settings.danger.email_mismatch"));
            return;
        }
        setDeleting(true);
        setDeleteError("");
        const ok = await deleteAccount(confirmEmail.trim().toLowerCase(), lang);
        if (!ok) {
            setDeleting(false);
            setDeleteError(t("settings.danger.error"));
            return;
        }
        // Clear any local state that referenced this user.
        try {
            ["soyapostol:examen:es", "soyapostol:examen:en"].forEach(
                (k) => localStorage.removeItem(k),
            );
        } catch { /* ignore */ }
        navigate("/account-deleted", { replace: true });
    };

    return (
        <div data-testid="settings-page" className="max-w-[720px] mx-auto">
            <p className="label-eyebrow mb-3">{t("settings.eyebrow")}</p>
            <h1 className="heading-serif text-4xl sm:text-5xl tracking-tight leading-none mb-3">
                {t("settings.title")}
            </h1>
            <p className="text-stoneMuted mb-10">{t("settings.subtitle")}</p>

            {/* ============================================================ */}
            {/* Idioma — Preferencia de usuario                              */}
            {/* ============================================================ */}
            <section className="mb-12" data-testid="settings-language">
                <header className="flex items-center gap-3 mb-5">
                    <span
                        className="shrink-0 w-10 h-10 rounded-full bg-sand-200 text-stoneMuted flex items-center justify-center"
                        aria-hidden="true"
                    >
                        <Translate size={20} weight="duotone" />
                    </span>
                    <div>
                        <p className="label-eyebrow">{t("settings.language.eyebrow")}</p>
                        <h2 className="heading-serif text-2xl sm:text-3xl tracking-tight m-0">
                            {t("settings.language.title")}
                        </h2>
                    </div>
                </header>

                <article className="surface-card p-5 sm:p-6" data-testid="settings-language-card">
                    <p className="ui-sans text-sm leading-relaxed text-stoneMuted mb-4">
                        {t("settings.language.subtitle")}
                    </p>
                    <div
                        role="radiogroup"
                        aria-label={t("settings.language.title")}
                        className="grid grid-cols-2 gap-2"
                        data-testid="settings-language-toggle"
                    >
                        <button
                            type="button"
                            role="radio"
                            aria-checked={lang === "es"}
                            onClick={() => setLang("es")}
                            data-testid="settings-language-es"
                            className={`px-4 py-3 rounded-md ui-sans text-sm font-semibold transition-colors border ${
                                lang === "es"
                                    ? "bg-sangre text-sand-50 border-sangre"
                                    : "bg-sand-50 text-stone900 border-sand-300 hover:border-sangre"
                            }`}
                        >
                            <span className="block text-xs uppercase tracking-widest mb-0.5 opacity-80">ES</span>
                            <span className="block">{t("settings.language.spanish")}</span>
                        </button>
                        <button
                            type="button"
                            role="radio"
                            aria-checked={lang === "en"}
                            onClick={() => setLang("en")}
                            data-testid="settings-language-en"
                            className={`px-4 py-3 rounded-md ui-sans text-sm font-semibold transition-colors border ${
                                lang === "en"
                                    ? "bg-sangre text-sand-50 border-sangre"
                                    : "bg-sand-50 text-stone900 border-sand-300 hover:border-sangre"
                            }`}
                        >
                            <span className="block text-xs uppercase tracking-widest mb-0.5 opacity-80">EN</span>
                            <span className="block">{t("settings.language.english")}</span>
                        </button>
                    </div>
                    {!(user && user.email) && (
                        <p
                            className="ui-sans text-xs leading-relaxed text-stoneFaint mt-4 m-0"
                            data-testid="settings-language-anonymous-hint"
                        >
                            {t("settings.language.anonymous_hint")}
                        </p>
                    )}
                </article>
            </section>

            {/* ============================================================ */}
            {/* Biometría — Face ID / Touch ID                               */}
            {/* ============================================================ */}
            {user && user.email && <BiometricSection lang={lang} t={t} />}


            {/* ============================================================ */}
            {/* Sobre la App — Quiénes Somos                                 */}
            {/* ============================================================ */}
            <section className="mb-12" data-testid="settings-about">
                <header className="flex items-center gap-3 mb-5">
                    <span
                        className="shrink-0 w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center"
                        aria-hidden="true"
                    >
                        <Info size={20} weight="duotone" />
                    </span>
                    <div>
                        <p className="label-eyebrow text-purple-700">
                            {t("settings.about.eyebrow")}
                        </p>
                        <h2 className="heading-serif text-2xl sm:text-3xl tracking-tight m-0">
                            {t("settings.about.title")}
                        </h2>
                    </div>
                </header>

                <article className="surface-card p-6 sm:p-8">
                    <p
                        className="reading-serif text-base sm:text-lg leading-[1.85] text-stone900 mb-5"
                        data-testid="settings-about-p1"
                    >
                        {decorateParagraph(paragraphs[0], emphasis)}
                    </p>
                    <p
                        className="reading-serif text-base sm:text-lg leading-[1.85] text-stone900 mb-8"
                        data-testid="settings-about-p2"
                    >
                        {decorateParagraph(paragraphs[1], emphasis)}
                    </p>

                    <h3
                        className="heading-serif text-xl tracking-tight mb-3 flex items-center gap-2"
                        data-testid="settings-about-domain-heading"
                    >
                        <HandsPraying size={18} weight="duotone" className="text-purple-700" />
                        <span>{decorateParagraph(paragraphs[2], emphasis)}</span>
                    </h3>
                    <p
                        className="reading-serif text-base sm:text-lg leading-[1.85] text-stone900 m-0"
                        data-testid="settings-about-p4"
                    >
                        {decorateParagraph(paragraphs[3], emphasis)}
                    </p>
                </article>

                {/* ----- Créditos / Credits ----- */}
                <article
                    className="surface-card p-6 sm:p-8 mt-6"
                    data-testid="settings-credits"
                >
                    <h3 className="heading-serif text-xl tracking-tight mb-3 flex items-center gap-2">
                        <HandsPraying size={18} weight="duotone" className="text-purple-700" />
                        <span>{t("settings.credits.title")}</span>
                    </h3>
                    <p
                        className="reading-serif text-base sm:text-lg leading-[1.85] text-stone900 mb-4"
                        data-testid="settings-credits-intro"
                    >
                        {linkifySources(t("settings.credits.intro"))}
                    </p>
                    <ul
                        className="reading-serif text-base sm:text-lg leading-[1.85] text-stone900 mb-4 list-disc pl-6 space-y-1.5"
                        data-testid="settings-credits-list"
                    >
                        <li>
                            <strong className="font-semibold text-stone900">
                                {t("settings.credits.row_readings_label")}
                            </strong>
                            {" "}
                            {linkifySources(t("settings.credits.row_readings_value"))}
                        </li>
                        <li>
                            <strong className="font-semibold text-stone900">
                                {t("settings.credits.row_liturgy_label")}
                            </strong>
                            {" "}
                            {linkifySources(t("settings.credits.row_liturgy_value"))}
                        </li>
                        <li>
                            <strong className="font-semibold text-stone900">
                                {t("settings.credits.row_news_label")}
                            </strong>
                            {" "}
                            {linkifySources(t("settings.credits.row_news_value"))}
                        </li>
                    </ul>
                    <p
                        className="reading-serif text-base sm:text-lg leading-[1.85] text-stone900 mb-4"
                        data-testid="settings-credits-lev"
                    >
                        {linkifySources(t("settings.credits.lev"))}
                    </p>
                    <p
                        className="reading-serif text-base sm:text-lg leading-[1.85] text-stoneMuted italic m-0"
                        data-testid="settings-credits-disclaimer"
                    >
                        {t("settings.credits.disclaimer")}
                    </p>
                    {user && user.email && (
                        <p
                            className="mt-4 pt-4 border-t border-sand-300 ui-sans text-sm leading-relaxed text-stoneMuted m-0"
                            data-testid="settings-credits-right-to-forget"
                        >
                            <strong className="font-semibold text-stone900">
                                {t("settings.credits.right_to_forget_label")}
                            </strong>
                            {" "}
                            {t("settings.credits.right_to_forget_body")}
                            {" "}
                            <button
                                type="button"
                                onClick={openDeleteModal}
                                data-testid="settings-credits-delete-link"
                                className="text-red-700 hover:text-red-800 underline decoration-red-300 underline-offset-4 transition-colors"
                            >
                                {t("settings.credits.right_to_forget_cta")}
                            </button>
                            .
                        </p>
                    )}
                </article>

                {/* ----- Uso Justo / Fair Use ----- */}
                <article
                    className="surface-card p-6 sm:p-8 mt-6"
                    data-testid="settings-fair-use"
                >
                    <h3 className="heading-serif text-xl tracking-tight mb-3 flex items-center gap-2">
                        <Shield size={18} weight="duotone" className="text-purple-700" />
                        <span>{t("settings.fair_use.title")}</span>
                    </h3>
                    <p
                        className="reading-serif text-base sm:text-lg leading-[1.85] text-stone900 mb-4"
                        data-testid="settings-fair-use-p1"
                    >
                        {linkifySources(t("settings.fair_use.p1"))}
                    </p>
                    <p
                        className="reading-serif text-base sm:text-lg leading-[1.85] text-stone900 m-0"
                        data-testid="settings-fair-use-p2"
                    >
                        {linkifySources(t("settings.fair_use.p2"))}
                    </p>
                </article>
            </section>

            {/* ============================================================ */}
            {/* Legal                                                         */}
            {/* ============================================================ */}
            <section className="mb-12" data-testid="settings-legal">
                <header className="flex items-center gap-3 mb-5">
                    <span
                        className="shrink-0 w-10 h-10 rounded-full bg-sand-200 text-stoneMuted flex items-center justify-center"
                        aria-hidden="true"
                    >
                        <Shield size={20} weight="duotone" />
                    </span>
                    <div>
                        <p className="label-eyebrow">{t("settings.legal.eyebrow")}</p>
                        <h2 className="heading-serif text-2xl sm:text-3xl tracking-tight m-0">
                            {t("settings.legal.title")}
                        </h2>
                    </div>
                </header>

                <button
                    type="button"
                    onClick={onOpenPrivacy}
                    data-testid="settings-privacy-btn"
                    className="w-full surface-card p-5 text-left flex items-center justify-between gap-4 hover:border-purple-400 transition-colors"
                >
                    <div className="min-w-0">
                        <p className="ui-sans font-semibold text-stone900 mb-0.5">
                            {t("settings.legal.privacy_title")}
                        </p>
                        <p className="text-sm text-stoneMuted m-0">
                            {t("settings.legal.privacy_hint")}
                        </p>
                    </div>
                    <ArrowSquareOut
                        size={20}
                        weight="duotone"
                        className="shrink-0 text-stoneFaint"
                        aria-hidden="true"
                    />
                </button>
            </section>

            {/* ============================================================ */}
            {/* Soporte                                                       */}
            {/* ============================================================ */}
            <section className="mb-12" data-testid="settings-support">
                <header className="flex items-center gap-3 mb-5">
                    <span
                        className="shrink-0 w-10 h-10 rounded-full bg-sangre/10 text-sangre flex items-center justify-center"
                        aria-hidden="true"
                    >
                        <EnvelopeSimple size={20} weight="duotone" />
                    </span>
                    <div>
                        <p className="label-eyebrow text-sangre">
                            {t("settings.support.eyebrow")}
                        </p>
                        <h2 className="heading-serif text-2xl sm:text-3xl tracking-tight m-0">
                            {t("settings.support.title")}
                        </h2>
                    </div>
                </header>

                <button
                    type="button"
                    onClick={onContactSupport}
                    data-testid="settings-support-btn"
                    className="w-full surface-card p-5 text-left flex items-center justify-between gap-4 hover:border-sangre transition-colors"
                >
                    <div className="min-w-0">
                        <p className="ui-sans font-semibold text-stone900 mb-0.5">
                            {t("settings.support.cta")}
                        </p>
                        <p className="text-sm text-stoneMuted m-0 truncate">
                            {SUPPORT_EMAIL}
                        </p>
                    </div>
                    <EnvelopeSimple
                        size={20}
                        weight="duotone"
                        className="shrink-0 text-sangre"
                        aria-hidden="true"
                    />
                </button>
            </section>

            {/* ============================================================ */}
            {/* Danger zone — account deletion                               */}
            {/* ============================================================ */}
            {user && user.email && (
                <section className="mb-12" data-testid="settings-danger">
                    <header className="flex items-center gap-3 mb-5">
                        <span
                            className="shrink-0 w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center"
                            aria-hidden="true"
                        >
                            <WarningOctagon size={20} weight="duotone" />
                        </span>
                        <div>
                            <p className="label-eyebrow text-red-700">
                                {t("settings.danger.eyebrow")}
                            </p>
                            <h2 className="heading-serif text-2xl sm:text-3xl tracking-tight m-0">
                                {t("settings.danger.title")}
                            </h2>
                        </div>
                    </header>

                    <article
                        className="border border-red-200 bg-red-50/50 rounded-md p-5 sm:p-6"
                        data-testid="settings-danger-card"
                    >
                        <p className="ui-sans text-sm leading-relaxed text-stone900 mb-4">
                            {t("settings.danger.body")}
                        </p>
                        <ul className="ui-sans text-sm text-stone900 list-disc pl-5 space-y-1 mb-5">
                            <li>{t("settings.danger.list_user")}</li>
                            <li>{t("settings.danger.list_favs")}</li>
                            <li>{t("settings.danger.list_sessions")}</li>
                        </ul>
                        <button
                            type="button"
                            onClick={openDeleteModal}
                            data-testid="settings-delete-account-btn"
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-700 hover:bg-red-800 text-white ui-sans font-semibold rounded-md transition-colors"
                        >
                            <Trash size={16} weight="bold" />
                            {t("settings.danger.cta")}
                        </button>
                    </article>
                </section>
            )}

            {/* Confirmation modal */}
            {confirmOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-stone900/60 backdrop-blur-sm"
                    onClick={closeDeleteModal}
                    data-testid="delete-account-modal-backdrop"
                >
                    <form
                        className="w-full max-w-md bg-white rounded-lg shadow-xl border border-red-200 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={onConfirmDelete}
                        data-testid="delete-account-modal"
                    >
                        <header className="flex items-start gap-3 p-5 border-b border-sand-300">
                            <span
                                className="shrink-0 w-9 h-9 rounded-full bg-red-100 text-red-700 flex items-center justify-center mt-0.5"
                                aria-hidden="true"
                            >
                                <WarningOctagon size={18} weight="duotone" />
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="label-eyebrow text-red-700 mb-1">
                                    {t("settings.danger.modal.eyebrow")}
                                </p>
                                <h3 className="heading-serif text-xl tracking-tight m-0">
                                    {t("settings.danger.modal.title")}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={closeDeleteModal}
                                disabled={deleting}
                                aria-label="Close"
                                data-testid="delete-account-modal-close"
                                className="text-stoneFaint hover:text-stone900 disabled:opacity-50"
                            >
                                <X size={18} weight="bold" />
                            </button>
                        </header>

                        <div className="p-5">
                            <p className="ui-sans text-sm leading-relaxed text-stone900 mb-4">
                                {t("settings.danger.modal.body")}
                            </p>
                            <label className="block ui-sans text-xs font-semibold uppercase tracking-wider text-stoneMuted mb-2">
                                {t("settings.danger.modal.email_label", { email: user.email })}
                            </label>
                            <input
                                type="email"
                                inputMode="email"
                                autoComplete="off"
                                spellCheck={false}
                                value={confirmEmail}
                                onChange={(e) => setConfirmEmail(e.target.value)}
                                placeholder={user.email}
                                data-testid="delete-account-email-input"
                                className="w-full px-3 py-2.5 border border-sand-300 rounded-md focus:outline-none focus:border-red-700 ui-sans text-sm"
                                disabled={deleting}
                                autoFocus
                            />
                            {deleteError && (
                                <p
                                    className="mt-3 ui-sans text-sm text-red-700"
                                    data-testid="delete-account-error"
                                    role="alert"
                                >
                                    {deleteError}
                                </p>
                            )}
                        </div>

                        <footer className="flex items-center justify-end gap-3 p-5 bg-sand-100 border-t border-sand-300">
                            <button
                                type="button"
                                onClick={closeDeleteModal}
                                disabled={deleting}
                                data-testid="delete-account-cancel-btn"
                                className="px-4 py-2 ui-sans font-semibold text-stoneMuted hover:text-stone900 disabled:opacity-50"
                            >
                                {t("settings.danger.modal.cancel")}
                            </button>
                            <button
                                type="submit"
                                disabled={deleting || !confirmEmail.trim()}
                                data-testid="delete-account-confirm-btn"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white ui-sans font-semibold rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {deleting && <SpinnerGap size={14} weight="bold" className="animate-spin" />}
                                {deleting
                                    ? t("settings.danger.modal.deleting")
                                    : t("settings.danger.modal.confirm")}
                            </button>
                        </footer>
                    </form>
                </div>
            )}

            {/* ============================================================ */}
            {/* Footer                                                        */}
            {/* ============================================================ */}
            <footer
                className="mt-16 pt-8 border-t border-sand-300 text-xs text-stoneFaint text-center"
                data-testid="settings-footer"
            >
                {t("settings.footer.version", { v: APP_VERSION })} · {APP_DOMAIN} · {APP_LOCATION}
            </footer>
        </div>
    );
}
