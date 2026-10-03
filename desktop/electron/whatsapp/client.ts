import { existsSync, mkdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Client as ClientType } from "whatsapp-web.js";
import { findChromeExecutable } from "./chrome.js";
import type { AccountInfo, ConnectionState, ConnectionStatus } from "./types.js";

export interface ConnectionOptions {
  /** Directory holding the saved WhatsApp Web login. */
  sessionDir: string;
  /** Writable directory for the cached WhatsApp Web build. */
  cacheDir: string;
  onStatus?: (status: ConnectionStatus) => void;
}

/**
 * Chrome refuses to start a second time against a profile dir that still has
 * `SingletonLock`/`SingletonCookie`/`SingletonSocket` in it. Normally that is
 * fine — it means a previous browser is genuinely still running. But if the
 * Electron process that launched it was killed (crash, force-kill, OOM)
 * without a chance to clean up, the headless Chrome child survives as an
 * orphan nobody will ever close, and every future connect attempt dead-ends
 * on "a previous browser is still using this session" with no way out short
 * of hunting down the process by hand.
 *
 * `SingletonLock` is a symlink shaped `<hostname>-<pid>`. Resolve it and
 * check whether that pid is still alive:
 *  - dead (or lock missing): just clean up the leftover files, safe no-op.
 *  - alive: it is this exact kind of orphan — Whamail has already lost track
 *    of it and nothing else holds a reference, so reap it before clearing
 *    the lock. Never do this if the lock resolves to our own pid.
 * LocalAuth puts the Chrome profile at `<sessionDir>/session`.
 */
async function clearStaleChromeLock(sessionDir: string): Promise<void> {
  const profileDir = join(sessionDir, "session");
  const lockPath = join(profileDir, "SingletonLock");

  try {
    const target = readlinkSync(lockPath);
    const pid = Number(target.slice(target.lastIndexOf("-") + 1));
    if (Number.isInteger(pid) && pid > 0 && pid !== process.pid && isProcessAlive(pid)) {
      console.warn(`[WhatsApp] Reaping orphaned Chrome (pid ${pid}) left over from an earlier session.`);
      try {
        process.kill(pid, "SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (isProcessAlive(pid)) process.kill(pid, "SIGKILL");
      } catch {
        // Already gone between the check and the kill — fine.
      }
    }
  } catch {
    // No lock file, not a symlink, or unreadable — nothing to reap.
  }

  for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    try {
      rmSync(join(profileDir, name), { force: true });
    } catch {
      // Best-effort cleanup — a launch failure downstream still surfaces clearly.
    }
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Owns the single WhatsApp Web session.
 *
 * Connecting is single-flight: concurrent `initialize()` calls share one
 * browser launch instead of racing each other onto the same profile directory.
 */
export class WhatsAppConnection {
  private client: ClientType | null = null;
  private initPromise: Promise<void> | null = null;
  /** Bumped whenever the user disconnects, so an in-flight connect can tell it was cancelled. */
  private generation = 0;
  private status: ConnectionStatus = {
    state: "disconnected",
    detail: "Not connected",
    updatedAt: new Date().toISOString(),
  };

  constructor(private readonly options: ConnectionOptions) {}

  getStatus(): ConnectionStatus {
    return { ...this.status };
  }

  isReady(): boolean {
    return this.status.state === "ready" && this.client !== null;
  }

  /** The live client. Throws when WhatsApp is not connected. */
  getClient(): ClientType {
    if (!this.client || this.status.state !== "ready") throw new Error("WhatsApp is not connected");
    return this.client;
  }

  /**
   * True when this device completed a login before, so reconnecting needs no
   * QR scan. The profile directory alone is not proof: it is created on the
   * first connect attempt, linked or not.
   */
  hasSavedSession(): boolean {
    return existsSync(this.linkedMarker());
  }

  private linkedMarker(): string {
    return join(this.options.sessionDir, "linked");
  }

  private setLinked(linked: boolean): void {
    try {
      if (linked) writeFileSync(this.linkedMarker(), new Date().toISOString(), "utf-8");
      else rmSync(this.linkedMarker(), { force: true });
    } catch (error) {
      console.warn("[WhatsApp] Could not update the linked marker:", error);
    }
  }

  async initialize(): Promise<void> {
    if (this.isReady()) return;
    if (this.initPromise) return this.initPromise;

    const generation = this.generation;
    this.setStatus("initializing", "Starting a secure local WhatsApp Web session");
    this.initPromise = this.createAndInitialize();

    try {
      await this.initPromise;
    } catch (error) {
      // Disconnecting mid-connect closes the browser under the launch; that is not an error.
      if (generation !== this.generation) return;
      const readable = readableConnectionError(error instanceof Error ? error.message : String(error));
      await this.destroyClient();
      this.setStatus("error", readable);
      throw new Error(readable);
    } finally {
      this.initPromise = null;
    }
  }

  /** Close the browser but keep the saved login for next time. */
  async disconnect(): Promise<void> {
    this.generation++;
    await this.destroyClient();
    this.setStatus("disconnected", "Not connected");
  }

  /** Unlink this device and delete the saved login. The next connect needs a QR scan. */
  async resetSession(): Promise<void> {
    this.generation++;
    const active = this.client;
    this.client = null;
    if (active) {
      try {
        // logout() tells WhatsApp to drop the linked device before closing.
        if (this.status.state === "ready") await active.logout();
        else await active.destroy();
      } catch (error) {
        console.warn("[WhatsApp] Logout did not complete cleanly:", error);
        try {
          await active.destroy();
        } catch {
          // Browser already gone.
        }
      }
    }
    rmSync(this.options.sessionDir, { recursive: true, force: true });
    this.setStatus("disconnected", "Not connected");
  }

  private async createAndInitialize(): Promise<void> {
    const [whatsappModule, qrModule] = await Promise.all([import("whatsapp-web.js"), import("qrcode")]);
    const { Client, LocalAuth } = whatsappModule.default ?? whatsappModule;
    const QRCode = qrModule.default ?? qrModule;

    const chrome = await findChromeExecutable();
    if (!chrome.path) {
      throw new Error(
        chrome.error ?? "CHROME_NOT_FOUND: Google Chrome or Microsoft Edge is required to connect WhatsApp.",
      );
    }

    mkdirSync(this.options.sessionDir, { recursive: true });
    mkdirSync(this.options.cacheDir, { recursive: true });
    await clearStaleChromeLock(this.options.sessionDir);

    const nextClient: ClientType = new Client({
      authStrategy: new LocalAuth({ dataPath: this.options.sessionDir }),
      puppeteer: {
        headless: process.env.WHATSAPP_HEADLESS !== "false",
        executablePath: chrome.path,
        args: [
          // Chrome's sandbox cannot start as root or in most Linux containers.
          ...(process.platform === "linux" ? ["--no-sandbox", "--disable-setuid-sandbox"] : []),
          "--disable-dev-shm-usage",
          "--no-first-run",
          "--disable-gpu",
        ],
      },
      // The default cache path is relative to the working directory, which is
      // read-only for an installed app.
      webVersionCache: { type: "local", path: this.options.cacheDir },
      authTimeoutMs: 120_000,
      qrMaxRetries: 6,
      takeoverOnConflict: false,
    });
    this.client = nextClient;
    const isCurrent = () => this.client === nextClient;

    nextClient.on("qr", (qr: string) => {
      if (!isCurrent()) return;
      void QRCode.toDataURL(qr, { margin: 2, width: 320, errorCorrectionLevel: "M" })
        .then((qrDataUrl) => {
          if (!isCurrent()) return;
          this.setStatus("qr", "Scan this code from WhatsApp → Linked devices", { qrDataUrl });
        })
        .catch((error) => {
          console.error("[WhatsApp] Unable to render QR code:", error);
          if (isCurrent()) this.setStatus("error", "Could not generate the QR code. Try connecting again.");
        });
    });

    nextClient.on("authenticated", () => {
      if (isCurrent()) this.setStatus("authenticated", "Authenticated. Loading your WhatsApp session…");
    });

    nextClient.on("loading_screen", (percent: unknown, message: unknown) => {
      if (!isCurrent() || this.status.state === "ready") return;
      const parsed = Number.parseInt(String(percent), 10);
      const label = typeof message === "string" && message ? message : "Loading WhatsApp";
      const detail = `${label}${Number.isFinite(parsed) ? ` (${parsed}%)` : ""}`;
      if (this.status.state === "qr") this.setStatus("qr", detail, { qrDataUrl: this.status.qrDataUrl });
      else this.setStatus("authenticated", detail);
    });

    nextClient.on("ready", () => {
      if (!isCurrent()) return;
      this.setLinked(true);
      this.setStatus("ready", "Connected and ready", { info: readInfo(nextClient) });
    });

    nextClient.on("auth_failure", (message: string) => {
      if (!isCurrent()) return;
      this.setLinked(false);
      void this.destroyClient();
      this.setStatus("error", `WhatsApp authentication failed: ${message}. Reset the session and scan a new QR code.`);
    });

    nextClient.on("disconnected", (reason: string) => {
      if (!isCurrent()) return;
      if (/logout/i.test(String(reason))) this.setLinked(false);
      void this.destroyClient();
      this.setStatus("disconnected", readableDisconnectReason(String(reason)));
    });

    await nextClient.initialize();
  }

  private async destroyClient(): Promise<void> {
    const active = this.client;
    this.client = null;
    if (!active) return;
    try {
      await active.destroy();
    } catch (error) {
      console.warn("[WhatsApp] Browser did not close cleanly:", error);
    }
  }

  private setStatus(
    state: ConnectionState,
    detail: string,
    extra: { qrDataUrl?: string; info?: AccountInfo } = {},
  ): void {
    this.status = {
      state,
      detail,
      qrDataUrl: state === "qr" ? extra.qrDataUrl : undefined,
      info: state === "ready" ? extra.info : undefined,
      updatedAt: new Date().toISOString(),
    };
    this.options.onStatus?.(this.getStatus());
  }
}

function readInfo(client: ClientType): AccountInfo {
  const info = client.info;
  return {
    name: info?.pushname || "WhatsApp account",
    phone: info?.wid?.user ?? "",
    platform: info?.platform ?? "",
  };
}

function readableDisconnectReason(reason: string): string {
  if (/max qrcode retries/i.test(reason)) return "The QR code expired. Click Connect to get a new one.";
  if (/logout/i.test(reason)) return "This device was unlinked from WhatsApp. Connect again to scan a new QR code.";
  if (/conflict/i.test(reason)) return "WhatsApp Web was opened somewhere else with this session.";
  return `Disconnected: ${reason}`;
}

export function readableConnectionError(message: string): string {
  if (/CHROME_NOT_FOUND/.test(message)) {
    return "Google Chrome or Microsoft Edge is required to connect WhatsApp. Install one of them and try again.";
  }
  if (/ERR_NETWORK_ACCESS_DENIED/i.test(message)) {
    return "The browser was blocked from reaching web.whatsapp.com. Allow it through your firewall or network security, then retry.";
  }
  if (/browser is already running|userDataDir|SingletonLock/i.test(message)) {
    return "A previous WhatsApp browser is still using this session. Quit Whamail completely, reopen it, and try again.";
  }
  if (/net::ERR_/i.test(message)) {
    return "Could not reach WhatsApp Web. Check your internet connection and try again.";
  }
  if (/failed to launch the browser|could not find (chrome|browser)|ENOENT/i.test(message)) {
    return "The browser for WhatsApp Web could not be started. Reinstall Google Chrome or Microsoft Edge and try again.";
  }
  if (/execution context|detached frame|target closed|session closed/i.test(message)) {
    return "WhatsApp Web changed pages while starting. Click Connect to try again.";
  }
  if (/timeout|timed out/i.test(message)) {
    return "WhatsApp took too long to connect. Try again and scan a fresh QR code.";
  }
  return message.length > 300 ? `${message.slice(0, 297)}…` : message;
}
