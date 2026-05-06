import { createContext, useContext, useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);     // null = checking, false = anon, object = user
    const [error, setError] = useState("");

    useEffect(() => {
        let mounted = true;
        api.get("/auth/me")
            .then((res) => mounted && setUser(res.data))
            .catch(() => mounted && setUser(false));
        return () => { mounted = false; };
    }, []);

    const login = async (email, password) => {
        setError("");
        try {
            const res = await api.post("/auth/login", { email, password });
            setUser(res.data);
            // Mark a one-shot flag so the BiometricEnrollPrompt component
            // can ask the user — once per device per session — whether
            // they want to enable Face ID for future visits. Cleared by
            // the prompt itself after it shows.
            try { localStorage.setItem("soyapostol_just_logged_in_pw", "1"); } catch { /* ignore */ }
            return true;
        } catch (e) {
            setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
            return false;
        }
    };

    const register = async (email, password, name) => {
        setError("");
        try {
            const res = await api.post("/auth/register", { email, password, name });
            setUser(res.data);
            try { localStorage.setItem("soyapostol_just_logged_in_pw", "1"); } catch { /* ignore */ }
            return true;
        } catch (e) {
            setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
            return false;
        }
    };

    const logout = async () => {
        try { await api.post("/auth/logout"); } catch (e) { /* ignore */ }
        setUser(false);
    };

    const deleteAccount = async (confirmEmail, lang) => {
        setError("");
        try {
            await api.post("/auth/delete-account",
                { confirm_email: confirmEmail, lang: lang || "es" });
            setUser(false);
            return true;
        } catch (e) {
            setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
            return false;
        }
    };

    return (
        <AuthContext.Provider value={{ user, error, login, register, logout, deleteAccount, setUser, setError }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
