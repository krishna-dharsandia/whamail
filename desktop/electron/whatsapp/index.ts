import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { WhatsAppConnection } from "./client.js";
import { normalizePhone } from "./phone.js";
import { QueueApi } from "./queue-api.js";
import { SendRunner } from "./runner.js";
import { SendLog } from "./send-log.js";
import { readableSendError, sendText, type SendTransport } from "./sender.js";
import { SettingsStore } from "./settings.js";
import type { ConnectionStatus } from "./types.js";

export interface WhatsAppInitOptions {
  /** Base URL of the local Whamail API, including `/api`. */
  getApiUrl: () => string;
}

let connection: WhatsAppConnection | null = null;
let runner: SendRunner | null = null;

function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

/** Shape the renderer consumes. `status` keeps the name the UI already used. */
function toRendererStatus(status: ConnectionStatus) {
  return {
    status: status.state,
    detail: status.detail,
    qr: status.qrDataUrl ?? null,
    info: status.info ?? null,
  };
}

export function initWhatsApp(options: WhatsAppInitOptions): void {
  const userData = app.getPath("userData");
  const settings = new SettingsStore(join(userData, "whatsapp-settings.json"));
  const sendLog = new SendLog(join(userData, "whatsapp-send-log.json"));
  const api = new QueueApi({
    getBaseUrl: options.getApiUrl,
    requestToken: () => broadcast("whatsapp:auth-required"),
  });

  // Whether the API currently knows this account as connected. Broadcasts can
  // only be queued while it does, so keep it in step with the real session.
  let sessionSynced = false;
  const syncSession = () => {
    const status = conn.getStatus();
    if (status.state !== "ready" || !status.info || sessionSynced || !api.hasToken()) return;
    sessionSynced = true;
    api.sessionConnected(status.info).catch((error) => {
      sessionSynced = false;
      console.warn("[WhatsApp] Could not record the connected session:", error);
    });
  };
  const clearSession = (force = false) => {
    if (!sessionSynced && !force) return;
    sessionSynced = false;
    if (!api.hasToken()) return;
    api.sessionDisconnected().catch((error) => {
      console.warn("[WhatsApp] Could not record the disconnected session:", error);
    });
  };

  const conn = new WhatsAppConnection({
    sessionDir: join(userData, "whatsapp-session"),
    cacheDir: join(userData, "whatsapp-web-cache"),
    onStatus: (status) => {
      broadcast("whatsapp:status", toRendererStatus(status));
      if (status.qrDataUrl) broadcast("whatsapp:qr", status.qrDataUrl);
      if (status.state === "ready") syncSession();
      else if (status.state === "disconnected" || status.state === "error") clearSession();
    },
  });
  connection = conn;

  const transport: SendTransport = {
    isReady: () => conn.isReady(),
    getNumberId: (digits) => conn.getClient().getNumberId(digits),
    sendMessage: (chatId, text) => conn.getClient().sendMessage(chatId, text),
  };

  const sendRunner = new SendRunner({
    queue: api,
    limits: sendLog,
    isReady: () => conn.isReady(),
    send: (phone, body) => sendText(transport, phone, body, settings.get()),
    getSettings: () => settings.get(),
    onChange: (state) => broadcast("whatsapp:run-state", state),
  });
  runner = sendRunner;

  ipcMain.handle("whatsapp:get-status", () => {
    // Cheap no-op once synced; retries if an earlier attempt failed.
    syncSession();
    return { ...toRendererStatus(conn.getStatus()), hasSavedSession: conn.hasSavedSession() };
  });

  ipcMain.handle("whatsapp:connect", async () => {
    try {
      await conn.initialize();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("whatsapp:disconnect", async () => {
    sendRunner.stop();
    await conn.disconnect();
    clearSession(true);
    return { success: true };
  });

  ipcMain.handle("whatsapp:reset-session", async () => {
    sendRunner.stop();
    try {
      await conn.resetSession();
      clearSession(true);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("whatsapp:get-info", () => conn.getStatus().info ?? null);

  ipcMain.handle("whatsapp:get-contacts", async () => {
    if (!conn.isReady()) return { success: false, error: "WhatsApp is not connected.", contacts: [] };
    try {
      const waContacts = await conn.getClient().getContacts();
      const seen = new Set<string>();
      const contacts: { name: string; phoneNumber: string }[] = [];
      for (const c of waContacts) {
        if (c.isGroup || !c.isWAContact || !c.number) continue;
        const { phone } = normalizePhone(c.number, settings.get().defaultCountryCode);
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);
        contacts.push({ name: c.name || c.pushname || phone, phoneNumber: phone });
      }
      return { success: true, contacts };
    } catch (error) {
      return { success: false, error: readableSendError(error), contacts: [] };
    }
  });

  ipcMain.handle("whatsapp:send-message", async (_event, phone: string, message: string) => {
    if (!conn.isReady()) return { success: false, error: "WhatsApp is not connected." };
    const result = await sendText(transport, String(phone ?? ""), String(message ?? ""), settings.get());
    if (result.status === "SENT") sendLog.record();
    return { success: result.success, error: result.error, messageId: result.providerMessageId };
  });

  ipcMain.handle("whatsapp:check-number", async (_event, rawPhone: string) => {
    if (!conn.isReady()) return { registered: false, error: "WhatsApp is not connected." };
    const { phone, error } = normalizePhone(String(rawPhone ?? ""), settings.get().defaultCountryCode);
    if (!phone) return { registered: false, error };
    try {
      const numberId = await transport.getNumberId(phone.slice(1));
      return { registered: Boolean(numberId), phone };
    } catch (lookupError) {
      return { registered: false, phone, error: readableSendError(lookupError) };
    }
  });

  ipcMain.handle("whatsapp:run-get-state", () => sendRunner.getState());

  ipcMain.handle("whatsapp:run-start", (_event, input?: { broadcastId?: string | null }) => {
    try {
      return { success: true, state: sendRunner.start(input?.broadcastId ?? null) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        state: sendRunner.getState(),
      };
    }
  });

  ipcMain.handle("whatsapp:run-stop", () => ({ success: true, state: sendRunner.stop() }));

  ipcMain.handle("whatsapp:settings-get", () => ({
    settings: settings.get(),
    sentToday: sendLog.sentToday(),
    sentLastHour: sendLog.sentLastHour(),
  }));

  ipcMain.handle("whatsapp:settings-save", (_event, input: unknown) => {
    try {
      return { success: true, settings: settings.save(input) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.on("whatsapp:set-auth-token", (_event, token: string | null) => {
    api.setToken(typeof token === "string" ? token : null);
    if (api.hasToken()) syncSession();
    else sessionSynced = false;
  });

  // A saved login needs no QR scan — bring it back up so WhatsApp is ready
  // without the user having to click Connect after every launch.
  if (conn.hasSavedSession()) {
    conn.initialize().catch((error) => {
      console.warn("[WhatsApp] Could not restore the saved session:", error);
    });
  }
}

export function isWhatsAppReady(): boolean {
  return connection?.isReady() ?? false;
}

export async function destroyWhatsApp(): Promise<void> {
  runner?.stop();
  await connection?.disconnect();
}
