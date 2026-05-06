import api from "@/lib/api";
import {
    startRegistration,
    startAuthentication,
    browserSupportsWebAuthn,
    platformAuthenticatorIsAvailable,
} from "@simplewebauthn/browser";

/**
 * Local hint that the user has at least one passkey on this device.
 * Stored in localStorage so the Login page can show the "Sign in with
 * Face ID / Touch ID" button without an extra HTTP call. The flag is
 * advisory only — the server is the source of truth and will reject
 * any unknown credential during /auth/verify.
 */
const PASSKEY_HINT_KEY = "soyapostol_passkey_hint";

export const passkeyHint = {
    set: () => { try { localStorage.setItem(PASSKEY_HINT_KEY, "1"); } catch { /* ignore */ } },
    clear: () => { try { localStorage.removeItem(PASSKEY_HINT_KEY); } catch { /* ignore */ } },
    has: () => { try { return localStorage.getItem(PASSKEY_HINT_KEY) === "1"; } catch { return false; } },
};

/** Whether this browser exposes the WebAuthn API at all. */
export function webauthnSupported() {
    return browserSupportsWebAuthn();
}

/**
 * Whether a platform authenticator (Face ID / Touch ID / Windows Hello)
 * is available. Returns false on browsers without the WebAuthn API or
 * devices without a built-in authenticator.
 */
export async function platformAuthenticatorAvailable() {
    if (!browserSupportsWebAuthn()) return false;
    try {
        return await platformAuthenticatorIsAvailable();
    } catch {
        return false;
    }
}

/**
 * Register a new passkey for the currently logged-in user.
 * Returns the new credential metadata on success; throws otherwise.
 */
export async function registerPasskey() {
    const optsRes = await api.post("/auth/webauthn/register/options");
    const options = optsRes.data;
    const challengeKey = options.challengeKey;
    delete options.challengeKey;

    // @simplewebauthn/browser parses the options dict directly and
    // handles base64url ↔ ArrayBuffer conversions internally.
    const credential = await startRegistration({ optionsJSON: options });

    const verifyRes = await api.post("/auth/webauthn/register/verify", {
        challengeKey,
        credential,
    });
    passkeyHint.set();
    return verifyRes.data;
}

/**
 * Trigger a passkey authentication ceremony and complete the login if
 * successful. Resolves with the user payload from /auth/verify (which
 * also sets the JWT cookies). Re-throws errors so the caller can fall
 * back to password.
 */
export async function authenticateWithPasskey() {
    const optsRes = await api.post("/auth/webauthn/auth/options");
    const options = optsRes.data;
    const challengeKey = options.challengeKey;
    delete options.challengeKey;

    const credential = await startAuthentication({ optionsJSON: options });

    const verifyRes = await api.post("/auth/webauthn/auth/verify", {
        challengeKey,
        credential,
    });
    passkeyHint.set();
    return verifyRes.data;
}

/** List the registered passkeys for the current user. */
export async function listPasskeys() {
    const r = await api.get("/auth/webauthn/credentials");
    return r.data || [];
}

/** Remove (revoke) one passkey by credential id. */
export async function deletePasskey(credentialId) {
    // credential_id is a base64url string; encodeURIComponent keeps it safe.
    await api.delete(`/auth/webauthn/credentials/${encodeURIComponent(credentialId)}`);
}
