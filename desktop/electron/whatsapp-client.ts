import { Client, LocalAuth, Message } from "whatsapp-web.js";
import qrcode from "qrcode";
import { BrowserWindow, ipcMain, app } from "electron";
import path from "path";
import fs from "fs";

export type WhatsAppStatus =
  | "disconnected"
  | "qr"
  | "authenticated"
  | "ready"
  | "error";

let client: Client | null = null;
let mainWindow: BrowserWindow | null = null;
let currentStatus: WhatsAppStatus = "disconnected";
let lastQrDataUrl: string | null = null;
let sessionDir: string;

function getSessionDir(): string {
  const userDataPath = app.getPath("userData");
  const dir = path.join(userDataPath, "whatsapp-session");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function emitStatus(status: WhatsAppStatus, detail?: string) {
  currentStatus = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("whatsapp:status", { status, detail });
  }
}

function emitQr(qrDataUrl: string) {
  lastQrDataUrl = qrDataUrl;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("whatsapp:qr", qrDataUrl);
  }
}

function emitProgress(data: { current: number; total: number; phone: string; status: string }) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("whatsapp:send-progress", data);
  }
}

export function initWhatsApp(win: BrowserWindow) {
  mainWindow = win;
  sessionDir = getSessionDir();

  ipcMain.handle("whatsapp:get-status", () => {
    return { status: currentStatus, qr: lastQrDataUrl };
  });

  ipcMain.handle("whatsapp:connect", async () => {
    if (client) {
      try { await client.destroy(); } catch {}
      client = null;
    }
    emitStatus("disconnected");
    lastQrDataUrl = null;

    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: sessionDir,
      }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-gpu",
        ],
      },
    });

    client.on("qr", async (qr) => {
      try {
        const dataUrl = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
        emitQr(dataUrl);
        emitStatus("qr");
      } catch (err) {
        console.error("QR generation failed:", err);
        emitStatus("error", "Failed to generate QR code");
      }
    });

    client.on("authenticated", () => {
      emitStatus("authenticated");
    });

    client.on("auth_failure", (msg) => {
      emitStatus("error", `Authentication failed: ${msg}`);
    });

    client.on("ready", () => {
      emitStatus("ready");
    });

    client.on("disconnected", (reason) => {
      emitStatus("disconnected", String(reason));
      client = null;
    });

    try {
      await client.initialize();
      return { success: true };
    } catch (err: any) {
      emitStatus("error", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("whatsapp:disconnect", async () => {
    if (client) {
      try { await client.destroy(); } catch {}
      client = null;
    }
    lastQrDataUrl = null;
    emitStatus("disconnected");
    return { success: true };
  });

  ipcMain.handle("whatsapp:send-message", async (_event, phone: string, message: string) => {
    if (!client || currentStatus !== "ready") {
      return { success: false, error: "WhatsApp is not connected." };
    }
    try {
      const chatId = phone.replace(/[^0-9]/g, "") + "@c.us";
      const sent: Message = await client.sendMessage(chatId, message);
      return {
        success: true,
        messageId: sent.id._serialized,
        timestamp: sent.timestamp,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("whatsapp:send-batch", async (_event, messages: Array<{ phone: string; message: string }>) => {
    if (!client || currentStatus !== "ready") {
      return { success: false, error: "WhatsApp is not connected.", results: [] };
    }

    const results: Array<{ phone: string; success: boolean; error?: string; messageId?: string }> = [];
    const total = messages.length;

    for (let i = 0; i < messages.length; i++) {
      const { phone, message } = messages[i];
      try {
        const chatId = phone.replace(/[^0-9]/g, "") + "@c.us";
        const sent: Message = await client.sendMessage(chatId, message);
        results.push({ phone, success: true, messageId: sent.id._serialized });
      } catch (err: any) {
        results.push({ phone, success: false, error: err.message });
      }

      emitProgress({ current: i + 1, total, phone, status: results[i].success ? "sent" : "failed" });

      if (i < messages.length - 1) {
        const delay = 2000 + Math.random() * 3000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return { success: true, results };
  });

  ipcMain.handle("whatsapp:check-number", async (_event, phone: string) => {
    if (!client || currentStatus !== "ready") {
      return { registered: false, error: "WhatsApp is not connected." };
    }
    try {
      const chatId = phone.replace(/[^0-9]/g, "") + "@c.us";
      const isRegistered = await client.isRegisteredUser(chatId);
      return { registered: isRegistered };
    } catch (err: any) {
      return { registered: false, error: err.message };
    }
  });

  ipcMain.handle("whatsapp:get-info", async () => {
    if (!client || currentStatus !== "ready") return null;
    try {
      const info = client.info;
      return {
        name: info.pushname,
        phone: info.wid.user,
        platform: info.platform,
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle("whatsapp:get-chats", async () => {
    if (!client || currentStatus !== "ready") return [];
    try {
      const chats = await client.getChats();
      return chats.slice(0, 50).map((c) => ({
        id: c.id._serialized,
        name: c.name,
        isGroup: c.isGroup,
        unreadCount: c.unreadCount,
      }));
    } catch {
      return [];
    }
  });
}

export function isWhatsAppReady(): boolean {
  return client !== null && currentStatus === "ready";
}

export async function destroyWhatsApp() {
  if (client) {
    try { await client.destroy(); } catch {}
    client = null;
  }
}
