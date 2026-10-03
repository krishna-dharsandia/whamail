import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Env = Record<string, string | undefined>;

/**
 * Where Chromium-based browsers usually live. WhatsApp Web is driven through an
 * installed browser: the copy Puppeteer downloads at `npm install` time only
 * exists on the developer's machine, never inside a packaged build.
 */
export function chromeCandidates(platform: NodeJS.Platform, env: Env = process.env, home = homedir()): string[] {
  if (platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(
      (root): root is string => Boolean(root),
    );
    const suffixes = [
      ["Google", "Chrome", "Application", "chrome.exe"],
      ["Microsoft", "Edge", "Application", "msedge.exe"],
      ["BraveSoftware", "Brave-Browser", "Application", "brave.exe"],
      ["Chromium", "Application", "chrome.exe"],
    ];
    return suffixes.flatMap((suffix) => roots.map((root) => join(root, ...suffix)));
  }

  if (platform === "darwin") {
    const apps = [
      "Google Chrome.app/Contents/MacOS/Google Chrome",
      "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "Brave Browser.app/Contents/MacOS/Brave Browser",
      "Chromium.app/Contents/MacOS/Chromium",
    ];
    return apps.flatMap((app) => [join("/Applications", app), join(home, "Applications", app)]);
  }

  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/microsoft-edge",
    "/usr/bin/brave-browser",
  ];
}

export interface ChromeLookup {
  path: string | null;
  /** Set when an explicit override was given but does not exist. */
  error?: string;
}

/**
 * Resolve the browser used for WhatsApp Web, in order: explicit override
 * (WHAMAIL_CHROME_PATH / CHROME_PATH), an installed Chrome/Edge/Brave/Chromium,
 * then Puppeteer's own download if it happens to be present.
 */
export async function findChromeExecutable(
  env: Env = process.env,
  exists: (path: string) => boolean = existsSync,
): Promise<ChromeLookup> {
  const override = (env.WHAMAIL_CHROME_PATH || env.CHROME_PATH)?.trim();
  if (override) {
    return exists(override)
      ? { path: override }
      : { path: null, error: `No browser found at ${override}. Fix or unset CHROME_PATH.` };
  }

  for (const candidate of chromeCandidates(process.platform, env)) {
    if (exists(candidate)) return { path: candidate };
  }

  try {
    const puppeteer = (await import("puppeteer")).default;
    const bundled = puppeteer.executablePath();
    if (bundled && exists(bundled)) return { path: bundled };
  } catch {
    // No bundled browser — fall through.
  }

  return { path: null };
}
