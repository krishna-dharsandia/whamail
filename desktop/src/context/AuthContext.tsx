"use client";
import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from "react";
import { createSupabaseClient } from "@/lib/supabase";
import { authApi } from "@/lib/api";
import type { User, Session, SupabaseClient } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!supabaseInstance) supabaseInstance = createSupabaseClient();
  return supabaseInstance;
}

interface AppUser {
    id: string;
    email: string;
    fullName: string;
    role: string;
    emailsSent: number;
    emailLimit: number;
    emailVerified: boolean;
    avatarUrl: string | null;
    authProvider: string;
}

interface AuthContextType {
    user: AppUser | null;
    supabaseUser: User | null;
    session: Session | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AppUser | null>(null);
    const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const sb = getSupabase()!;
        sb.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setSupabaseUser(session?.user ?? null);
            if (session?.user) {
                syncProfile(session.user);
            } else {
                setLoading(false);
            }
        });

        const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setSupabaseUser(session?.user ?? null);
            if (session?.user) {
                syncProfile(session.user);
            } else {
                setUser(null);
                setLoading(false);
            }
        });

        // Listen for deep link auth callback from Electron
        const electronAPI = (window as any).electronAPI;
        let removeAuthListener: (() => void) | undefined;
        if (electronAPI?.onAuthCallback) {
            removeAuthListener = electronAPI.onAuthCallback(async (code: string) => {
                try {
                    const { data, error } = await sb.auth.exchangeCodeForSession(code);
                    if (error) {
                        console.error("Auth callback error:", error.message);
                    }
                } catch (err) {
                    console.error("Failed to exchange code:", err);
                }
            });
        }

        return () => {
            subscription.unsubscribe();
            removeAuthListener?.();
        };
    }, []);

    const syncProfile = useCallback(async (sbUser: User) => {
        try {
            const provider = sbUser.app_metadata?.provider || "email";
            const metadata = sbUser.user_metadata || {};
            const res = await authApi.syncProfile({
                fullName: metadata.full_name || metadata.name || undefined,
                avatarUrl: metadata.avatar_url || undefined,
                authProvider: provider,
            });
            setUser(res.data);
        } catch (err) {
            console.error("Failed to sync profile:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    const signInWithGoogle = useCallback(async () => {
        const sb = getSupabase()!;
        const isDesktop = !!(window as any).electronAPI?.isDesktop;

        if (isDesktop) {
            // Open OAuth in external browser (uses existing Chrome session)
            // Redirect back to app via whamail:// deep link
            const { data, error } = await sb.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: "whamail://auth/callback",
                    skipBrowserRedirect: true,
                },
            });
            if (error) throw error;
            if (data.url) {
                (window as any).electronAPI.openExternalAuth(data.url);
            }
        } else {
            const { error } = await sb.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                },
            });
            if (error) throw error;
        }
    }, []);

    const logout = useCallback(async () => {
        await getSupabase()!.auth.signOut();
        setUser(null);
        setSession(null);
        setSupabaseUser(null);
    }, []);

    const refreshProfile = useCallback(async () => {
        try {
            const res = await authApi.profile();
            setUser(res.data);
        } catch (err) {
            console.error("Failed to refresh profile:", err);
        }
    }, []);

    return (
        <AuthContext.Provider value={{
            user, supabaseUser, session, loading,
            signInWithGoogle,
            logout, refreshProfile,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}
