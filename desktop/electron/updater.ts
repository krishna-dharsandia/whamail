import pkg from "electron-updater";
const { autoUpdater } = pkg;
type UpdateInfo = pkg.UpdateInfo;
import { BrowserWindow, ipcMain } from "electron";

let mainWindow: BrowserWindow | null = null;

export function initAutoUpdater(win: BrowserWindow) {
  mainWindow = win;

  // Don't auto-download — let user decide
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendToRenderer("update-status", { status: "checking" });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    sendToRenderer("update-status", {
      status: "available",
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on("update-not-available", () => {
    sendToRenderer("update-status", { status: "up-to-date" });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer("update-status", {
      status: "downloading",
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    sendToRenderer("update-status", {
      status: "ready",
      version: info.version,
    });
  });

  autoUpdater.on("error", (err) => {
    sendToRenderer("update-status", {
      status: "error",
      message: err.message,
    });
  });

  // IPC: renderer requests download
  ipcMain.on("update-download", () => {
    autoUpdater.downloadUpdate();
  });

  // IPC: renderer requests install (quit & install)
  ipcMain.on("update-install", () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // IPC: renderer requests manual check
  ipcMain.on("update-check", () => {
    autoUpdater.checkForUpdates();
  });

  // Check on launch (after short delay so window is visible)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Silently fail — offline or no releases yet
    });
  }, 5000);
}

function sendToRenderer(channel: string, data: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}
