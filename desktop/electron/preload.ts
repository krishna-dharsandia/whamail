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
});
