import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { toast } from "sonner";
import {
    authenticateWithPasskey,
    passkeyHint,
    platformAuthenticatorAvailable,
} from "@/lib/webauthn";
import { FingerprintSimple } from "@phosphor-icons/react";

const HERO_IMG = "https://images.pexels.com/photos/33527869/pexels-photo-33527869.jpeg";

export default function Login() {
    const { login, error, user, setUser, setError } = useAuth();
    const { t, lang } = useLang();
    const navigate = useNavigate();
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);

    // Whether to expose the "Sign in with Face ID / Touch ID" button.
    // Two conditions must hold: (1) the browser supports a platform
    // authenticator, and (2) we have a localStorage hint that the user
    // has previously registered a passkey on this device. Without the
    // hint the button would always appear and confuse first-time users
    // who never enabled biometric login.
    const [bioReady, setBioReady] = React.useState(false);
    const [bioBusy, setBioBusy] = React.useState(false);

    React.useEffect(() => { if (user) navigate("/"); }, [user, navigate]);
    React.useEffect(() => { setError && setError(""); }, [setError]);

    React.useEffect(() => {
        let cancelled = false;
        if (!passkeyHint.has()) return undefined;
        platformAuthenticatorAvailable().then((ok) => {
            if (!cancelled) setBioReady(ok);
        });
        return () => { cancelled = true; };
    }, []);

    const tryPasskey = React.useCallback(async () => {
        setBioBusy(true);
        try {
            const userPayload = await authenticateWithPasskey();
            setUser(userPayload);
            navigate("/");
        } catch (e) {
            // Cancelled / no credential / user verification failed → silently
            // surface the password form. We only toast for unexpected errors.
            const msg = e?.name || "";
            if (msg === "NotAllowedError" || msg === "AbortError") {
                // user cancelled — no toast, just stay on the page
            } else if (e?.response?.status === 401) {
                toast.error(lang === "es" ? "Pasaporte no reconocido" : "Passkey not recognised");
                passkeyHint.clear();
                setBioReady(false);
            } else {
                toast.error(lang === "es" ? "Face ID falló — usa contraseña" : "Face ID failed — use password");
            }
        } finally {
            setBioBusy(false);
        }
    }, [navigate, setUser, lang]);

    const onSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        const ok = await login(email, password);
        setSubmitting(false);
        if (ok) navigate("/");
    };

    return (
        <div className="min-h-screen bg-sand-50 flex">
            <div className="hidden lg:block w-1/2 relative overflow-hidden">
                <img src={HERO_IMG} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-stone900/55" />
                <div className="relative z-10 h-full flex flex-col justify-end p-16 text-sand-50">
                    <img src="/logo.png" alt="soyapostol" className="h-14 w-14 object-contain mb-6" />
                    <h2 className="heading-serif text-5xl leading-none mb-3">soyapostol</h2>
                    <p className="reading-serif italic text-xl text-sand-100/90 max-w-md">"Permaneced en mi amor."</p>
                    <p className="ui-sans text-sm text-sand-100/70 mt-1">Juan 15, 9</p>
                </div>
            </div>
            <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
                <div className="w-full max-w-sm">
                    <div className="lg:hidden flex items-center gap-3 mb-10">
                        <img src="/logo.png" alt="soyapostol" className="h-9 w-9 object-contain" />
                        <span className="heading-serif text-3xl font-semibold">soyapostol</span>
                    </div>
                    <p className="label-eyebrow mb-3">{t("common.welcome_back")}</p>
                    <h1 className="heading-serif text-4xl sm:text-5xl tracking-tight leading-none mb-10">{t("common.sign_in")}</h1>

                    {bioReady && (
                        <div className="mb-8" data-testid="login-passkey-section">
                            <button
                                type="button"
                                onClick={tryPasskey}
                                disabled={bioBusy}
                                data-testid="login-passkey-btn"
                                className="w-full inline-flex items-center justify-center gap-3 px-4 py-3 rounded-md border-2 border-sangre text-sangre hover:bg-sangre hover:text-sand-50 transition-colors ui-sans text-sm font-semibold disabled:opacity-60"
                            >
                                <FingerprintSimple size={20} weight="duotone" />
                                {bioBusy
                                    ? t("common.loading")
                                    : (lang === "es" ? "Iniciar sesión con Face ID / Touch ID" : "Sign in with Face ID / Touch ID")}
                            </button>
                            <div className="flex items-center gap-3 my-6 text-stoneFaint text-xs uppercase tracking-widest ui-sans">
                                <span className="flex-1 h-px bg-sand-300" />
                                <span>{lang === "es" ? "o usa contraseña" : "or use password"}</span>
                                <span className="flex-1 h-px bg-sand-300" />
                            </div>
                        </div>
                    )}

                    <form onSubmit={onSubmit} className="space-y-5" data-testid="login-form">
                        <div>
                            <label className="label-eyebrow block mb-2">{t("common.email")}</label>
                            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                                data-testid="login-email-input"
                                className="w-full px-3 py-3 bg-sand-100 border border-sand-300 rounded-md focus:outline-none focus:border-sangre transition-colors ui-sans" />
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="label-eyebrow">{t("common.password")}</label>
                                <Link to="/forgot-password"
                                    data-testid="forgot-password-link"
                                    className="text-xs text-sangre hover:underline ui-sans">
                                    {t("auth.forgot_password")}
                                </Link>
                            </div>
                            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                                data-testid="login-password-input"
                                className="w-full px-3 py-3 bg-sand-100 border border-sand-300 rounded-md focus:outline-none focus:border-sangre transition-colors ui-sans" />
                        </div>
                        {error && <p className="text-sangre text-sm" data-testid="login-error">{error}</p>}
                        <button type="submit" disabled={submitting} data-testid="login-submit-btn"
                            className="btn-primary w-full disabled:opacity-60">
                            {submitting ? t("common.loading") : t("common.sign_in")}
                        </button>
                    </form>

                    <p className="mt-8 text-sm text-stoneMuted">
                        {t("common.no_account")} <Link to="/register" className="text-sangre hover:underline" data-testid="goto-register-link">{t("common.create_account")}</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
