import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isDesktop: true,
  platform: process.platform,
  getApiUrl: () => ipcRenderer.invoke("get-api-url"),
  openExternalAuth: (url: string) => ipcRenderer.invoke("open-external-auth", url),
  onAuthCallback: (callback: (url: string) => void) => {
    const handler = (_: unknown, url: string) => callback(url);
    ipcRenderer.on("auth-callback", handler);
    return () => ipcRenderer.removeListener("auth-callback", handler);
  },
  showNotification: (title: string, body: string) => {
    ipcRenderer.send("show-notification", { title, body });
  },
  minimizeWindow: () => ipcRenderer.send("window-minimize"),
  maximizeWindow: () => ipcRenderer.send("window-maximize"),
  closeWindow: () => ipcRenderer.send("window-close"),

  // Auto-update APIs
  onUpdateStatus: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on("update-status", handler);
    return () => ipcRenderer.removeListener("update-status", handler);
  },
  updateCheck: () => ipcRenderer.send("update-check"),
  updateDownload: () => ipcRenderer.send("update-download"),
  updateInstall: () => ipcRenderer.send("update-install"),

  // WhatsApp APIs
  whatsapp: {
    getStatus: () => ipcRenderer.invoke("whatsapp:get-status"),
    connect: () => ipcRenderer.invoke("whatsapp:connect"),
    disconnect: () => ipcRenderer.invoke("whatsapp:disconnect"),
    sendMessage: (phone: string, message: string) =>
      ipcRenderer.invoke("whatsapp:send-message", phone, message),
    sendBatch: (messages: Array<{ phone: string; message: string }>) =>
      ipcRenderer.invoke("whatsapp:send-batch", messages),
    checkNumber: (phone: string) =>
      ipcRenderer.invoke("whatsapp:check-number", phone),
    getInfo: () => ipcRenderer.invoke("whatsapp:get-info"),
    getChats: () => ipcRenderer.invoke("whatsapp:get-chats"),
    onQr: (cb: (dataUrl: string) => void) => {
      const handler = (_: unknown, d: string) => cb(d);
      ipcRenderer.on("whatsapp:qr", handler);
      return () => ipcRenderer.removeListener("whatsapp:qr", handler);
    },
    onStatus: (cb: (data: { status: string; detail?: string }) => void) => {
      const handler = (_: unknown, d: { status: string; detail?: string }) => cb(d);
      ipcRenderer.on("whatsapp:status", handler);
      return () => ipcRenderer.removeListener("whatsapp:status", handler);
    },
    onSendProgress: (cb: (data: { current: number; total: number; phone: string; status: string }) => void) => {
      const handler = (_: unknown, d: { current: number; total: number; phone: string; status: string }) => cb(d);
      ipcRenderer.on("whatsapp:send-progress", handler);
      return () => ipcRenderer.removeListener("whatsapp:send-progress", handler);
    },
  },
});
