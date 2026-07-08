import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  // Desktop: use createClient with localStorage (cookies don't work with app:// protocol)
  if (typeof window !== "undefined" && (window as any).electronAPI?.isDesktop) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: window.localStorage,
        flowType: "pkce",
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
