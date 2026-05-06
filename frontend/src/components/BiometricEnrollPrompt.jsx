import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { toast } from "sonner";
import {
    registerPasskey,
    platformAuthenticatorAvailable,
    passkeyHint,
} from "@/lib/webauthn";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { FingerprintSimple } from "@phosphor-icons/react";

/**
 * Soft post-login prompt that invites the user to enable biometric
 * authentication ("¿Quieres usar Face ID en próximas visitas?").
 *
 * Trigger conditions (ALL must be true):
 *   1. The user just signed in with email/password (one-shot flag set
 *      by AuthContext.login / register).
 *   2. The browser exposes a platform authenticator (Face ID / Touch ID
 *      / Windows Hello). On unsupported devices we silently skip.
 *   3. The user does not already have a passkey on this device
 *      (`passkeyHint` not set).
 *   4. The user hasn't permanently dismissed the prompt before
 *      ("soyapostol_passkey_prompt_dismissed_at" is unset OR older than
 *      the cooldown window — currently we treat any prior dismissal as
 *      permanent so the app doesn't nag).
 *
 * We mount this once at the Layout level so it appears regardless of
 * which page the user lands on after login.
 */
const FLAG_JUST_LOGGED_IN = "soyapostol_just_logged_in_pw";
const FLAG_DISMISSED      = "soyapostol_passkey_prompt_dismissed_at";

export default function BiometricEnrollPrompt() {
    const { user } = useAuth();
    const { lang } = useLang();
    const [open, setOpen] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        // Wait until /auth/me resolves a real user object (not null/false).
        if (!user || !user.email) return undefined;

        let cancelled = false;
        const check = async () => {
            // Pre-flight: were they just authenticated via password?
            const justLoggedIn = (() => {
                try { return localStorage.getItem(FLAG_JUST_LOGGED_IN) === "1"; }
                catch { return false; }
            })();
            if (!justLoggedIn) return;

            // Already dismissed or already enrolled? Skip.
            if (passkeyHint.has()) {
                try { localStorage.removeItem(FLAG_JUST_LOGGED_IN); } catch { /* ignore */ }
                return;
            }
            const dismissed = (() => {
                try { return !!localStorage.getItem(FLAG_DISMISSED); }
                catch { return false; }
            })();
            if (dismissed) {
                try { localStorage.removeItem(FLAG_JUST_LOGGED_IN); } catch { /* ignore */ }
                return;
            }

            // Platform authenticator available?
            const ok = await platformAuthenticatorAvailable();
            if (cancelled) return;
            if (!ok) {
                try { localStorage.removeItem(FLAG_JUST_LOGGED_IN); } catch { /* ignore */ }
                return;
            }

            // Consume the one-shot flag and open the prompt.
            try { localStorage.removeItem(FLAG_JUST_LOGGED_IN); } catch { /* ignore */ }
            setOpen(true);
        };
        check();
        return () => { cancelled = true; };
    }, [user]);

    const onEnable = async () => {
        setBusy(true);
        try {
            await registerPasskey();
            toast.success(lang === "es" ? "Biometría activada" : "Biometric enabled");
            setOpen(false);
        } catch (e) {
            const name = e?.name || "";
            if (name === "NotAllowedError" || name === "AbortError") {
                // user cancelled the OS prompt — leave the dialog open so
                // they can decide to dismiss or retry.
            } else {
                toast.error(lang === "es" ? "No se pudo activar biometría" : "Could not enable biometric");
                setOpen(false);
            }
        } finally {
            setBusy(false);
        }
    };

    const onDismiss = (permanent) => {
        if (permanent) {
            try { localStorage.setItem(FLAG_DISMISSED, new Date().toISOString()); }
            catch { /* ignore */ }
        }
        setOpen(false);
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => { if (!o) onDismiss(true); else setOpen(true); }}
        >
            <DialogContent
                className="max-w-md"
                data-testid="biometric-enroll-prompt"
            >
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <span className="shrink-0 w-12 h-12 rounded-full bg-sangre/10 text-sangre flex items-center justify-center">
                            <FingerprintSimple size={28} weight="duotone" />
                        </span>
                        <DialogTitle className="heading-serif text-2xl tracking-tight m-0">
                            {lang === "es"
                                ? "¿Iniciar sesión con Face ID / Touch ID?"
                                : "Sign in with Face ID / Touch ID?"}
                        </DialogTitle>
                    </div>
                    <DialogDescription className="text-sm leading-relaxed text-stoneMuted">
                        {lang === "es"
                            ? "Ahorra tiempo en próximas visitas. Tu huella o reconocimiento facial se guarda solo en este dispositivo — nunca sale de aquí."
                            : "Save time on future visits. Your fingerprint or face data stays on this device only — it never leaves."}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-3 pt-3">
                    <button
                        type="button"
                        onClick={() => onDismiss(true)}
                        data-testid="biometric-prompt-later"
                        className="ui-sans text-sm text-stoneMuted hover:text-stone900 px-4 py-2.5 rounded-md hover:bg-sand-100 transition-colors"
                    >
                        {lang === "es" ? "Más tarde" : "Later"}
                    </button>
                    <button
                        type="button"
                        onClick={onEnable}
                        disabled={busy}
                        data-testid="biometric-prompt-enable"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-sangre text-sand-50 ui-sans text-sm font-semibold hover:bg-sangre/90 transition-colors disabled:opacity-60"
                    >
                        <FingerprintSimple size={16} weight="duotone" />
                        {busy
                            ? (lang === "es" ? "Activando…" : "Enabling…")
                            : (lang === "es" ? "Sí, activar" : "Yes, enable")}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
