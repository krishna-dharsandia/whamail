"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { authApi } from "@/lib/api";
import type { User, Session } from "@supabase/supabase-js";

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
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setSupabaseUser(session?.user ?? null);
            if (session?.user) {
                syncProfile(session.user);
            } else {
                setLoading(false);
            }
        });

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setSupabaseUser(session?.user ?? null);
            if (session?.user) {
                syncProfile(session.user);
            } else {
                setUser(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const syncProfile = async (sbUser: User) => {
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
            // If backend fails, still allow user to see the app
        } finally {
            setLoading(false);
        }
    };

    const signInWithGoogle = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
        if (error) throw error;
    };

    const logout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setSupabaseUser(null);
    };

    const refreshProfile = async () => {
        try {
            const res = await authApi.profile();
            setUser(res.data);
        } catch (err) {
            console.error("Failed to refresh profile:", err);
        }
    };

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
