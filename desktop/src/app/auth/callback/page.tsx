"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status] = useState("Processing sign in...");

  useEffect(() => {
    const code = searchParams.get("code");
    const next = searchParams.get("next") || "/emails";

    if (!code) {
      router.replace("/login?error=no_code");
      return;
    }

    createSupabaseClient().auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          console.error("Auth callback error:", error.message);
          router.replace("/login?error=auth");
        } else {
          router.replace(next);
        }
      });
  }, []);

  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-muted-foreground">{status}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><p className="text-muted-foreground">Loading...</p></div>}>
      <CallbackHandler />
    </Suspense>
  );
}
