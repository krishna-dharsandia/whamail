"use client";

import { useEffect, useState } from "react";

interface DesktopAPI {
  isDesktop: boolean;
  platform: string;
  getApiUrl: () => Promise<string>;
  showNotification: (title: string, body: string) => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
}

let cachedApiUrl: string | null = null;

async function resolveApiUrl(electron: any): Promise<string> {
  if (cachedApiUrl) return cachedApiUrl;
  if (electron?.getApiUrl) {
    try {
      cachedApiUrl = await electron.getApiUrl();
      return cachedApiUrl!;
    } catch {
      // fall through
    }
  }
  // Fallback to env var
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) {
    cachedApiUrl = envUrl;
    return envUrl;
  }
  return "http://127.0.0.1:5133/api";
}

export function useDesktop(): DesktopAPI {
  const [api] = useState<DesktopAPI>(() => {
    const electron = typeof window !== "undefined" ? (window as any).electronAPI : undefined;
    if (electron) {
      return {
        isDesktop: true,
        platform: electron.platform,
        getApiUrl: () => resolveApiUrl(electron),
        showNotification: electron.showNotification,
        minimizeWindow: electron.minimizeWindow,
        maximizeWindow: electron.maximizeWindow,
        closeWindow: electron.closeWindow,
      };
    }
    return {
      isDesktop: false,
      platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
      getApiUrl: () => resolveApiUrl(null),
      showNotification: () => {},
      minimizeWindow: () => {},
      maximizeWindow: () => {},
      closeWindow: () => {},
    };
  });

  return api;
}

export { resolveApiUrl };
