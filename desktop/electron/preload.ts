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
    resetSession: () => ipcRenderer.invoke("whatsapp:reset-session"),
    sendMessage: (phone: string, message: string) =>
      ipcRenderer.invoke("whatsapp:send-message", phone, message),
    checkNumber: (phone: string) =>
      ipcRenderer.invoke("whatsapp:check-number", phone),
    getInfo: () => ipcRenderer.invoke("whatsapp:get-info"),
    getContacts: () => ipcRenderer.invoke("whatsapp:get-contacts"),

    // Paced queue sending
    getRunState: () => ipcRenderer.invoke("whatsapp:run-get-state"),
    startRun: (input?: { broadcastId?: string | null }) =>
      ipcRenderer.invoke("whatsapp:run-start", input),
    stopRun: () => ipcRenderer.invoke("whatsapp:run-stop"),
    getSettings: () => ipcRenderer.invoke("whatsapp:settings-get"),
    saveSettings: (settings: unknown) => ipcRenderer.invoke("whatsapp:settings-save", settings),

    // The main process records send results through the API with this token.
    setAuthToken: (token: string | null) => ipcRenderer.send("whatsapp:set-auth-token", token),
    onAuthRequired: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on("whatsapp:auth-required", handler);
      return () => ipcRenderer.removeListener("whatsapp:auth-required", handler);
    },

    onQr: (cb: (dataUrl: string) => void) => {
      const handler = (_: unknown, d: string) => cb(d);
      ipcRenderer.on("whatsapp:qr", handler);
      return () => ipcRenderer.removeListener("whatsapp:qr", handler);
    },
    onStatus: (cb: (data: unknown) => void) => {
      const handler = (_: unknown, d: unknown) => cb(d);
      ipcRenderer.on("whatsapp:status", handler);
      return () => ipcRenderer.removeListener("whatsapp:status", handler);
    },
    onRunState: (cb: (state: unknown) => void) => {
      const handler = (_: unknown, d: unknown) => cb(d);
      ipcRenderer.on("whatsapp:run-state", handler);
      return () => ipcRenderer.removeListener("whatsapp:run-state", handler);
    },
  },
});
