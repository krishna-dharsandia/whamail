import type { AccountInfo, PendingPage, SendResult } from "./types.js";

const REQUEST_TIMEOUT_MS = 20_000;
const TOKEN_WAIT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface QueueApiOptions {
  /** Base URL of the Whamail API including the `/api` suffix. */
  getBaseUrl: () => string;
  /** Asks the renderer (which owns the Supabase session) for a fresh access token. */
  requestToken: () => void;
  fetchImpl?: typeof fetch;
}

/**
 * The main process talks to the local Whamail API directly, so a send run
 * keeps recording results even while the window is hidden in the tray.
 * The renderer owns sign-in and pushes its access token here.
 */
export class QueueApi {
  private token: string | null = null;
  private tokenWaiters = new Set<() => void>();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: QueueApiOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  hasToken(): boolean {
    return this.token !== null;
  }

  setToken(token: string | null): void {
    this.token = token && token.trim() ? token : null;
    if (this.token) {
      for (const wake of this.tokenWaiters) wake();
      this.tokenWaiters.clear();
    }
  }

  /** Pending WhatsApp queue items, oldest first. */
  pending(broadcastId: string | null | undefined, limit: number): Promise<PendingPage> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (broadcastId) query.set("broadcastId", broadcastId);
    return this.request<PendingPage>("GET", `/whatsapp/queue?${query}`);
  }

  /** Claim an item for sending. False when it is no longer pending (cancelled, or already handled). */
  async claim(id: string): Promise<boolean> {
    try {
      await this.request("POST", `/whatsapp/queue/${id}/claim`);
      return true;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 409)) return false;
      throw error;
    }
  }

  async result(id: string, result: SendResult): Promise<void> {
    const status = result.status === "SENT" ? "Sent" : result.status === "SKIPPED" ? "Skipped" : "Failed";
    try {
      await this.request("POST", `/whatsapp/queue/${id}/result`, { status, error: result.error ?? null });
    } catch (error) {
      // The item was deleted meanwhile (e.g. its broadcast was removed) — nothing left to record.
      if (error instanceof ApiError && error.status === 404) return;
      throw error;
    }
  }

  /** Fail items left mid-send by a previous run that was interrupted. */
  async recover(): Promise<void> {
    await this.request("POST", "/whatsapp/queue/recover");
  }

  async sessionConnected(info: AccountInfo): Promise<void> {
    await this.request("POST", "/whatsapp/connected", {
      phoneNumber: info.phone,
      pushName: info.name,
      platform: info.platform,
    });
  }

  async sessionDisconnected(): Promise<void> {
    await this.request("POST", "/whatsapp/disconnect");
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    let response = await this.send(method, path, body);
    if (response.status === 401) {
      // The access token expired — get a fresh one from the renderer and retry once.
      this.token = null;
      await this.waitForToken();
      response = await this.send(method, path, body);
    }

    if (!response.ok) {
      let message = `Whamail API responded with ${response.status}`;
      try {
        const payload = (await response.json()) as { error?: string };
        if (payload?.error) message = payload.error;
      } catch {
        // Not a JSON error body.
      }
      throw new ApiError(response.status, message);
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async send(method: string, path: string, body?: unknown): Promise<Response> {
    if (!this.token) await this.waitForToken();
    const baseUrl = this.options.getBaseUrl();
    if (!baseUrl) throw new ApiError(0, "The Whamail API is not running");
    try {
      return await this.fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new ApiError(0, `Could not reach the Whamail API (${reason})`);
    }
  }

  private waitForToken(): Promise<void> {
    if (this.token) return Promise.resolve();
    this.options.requestToken();
    return new Promise<void>((resolve, reject) => {
      const wake = () => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        this.tokenWaiters.delete(wake);
        reject(new ApiError(401, "You are signed out. Sign in to Whamail to keep sending."));
      }, TOKEN_WAIT_MS);
      this.tokenWaiters.add(wake);
    });
  }
}
