import { app, BrowserWindow, shell, Menu, Tray, nativeImage, Notification, ipcMain, nativeTheme } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchApi, killApi, ApiProcessResult } from "./api-process.js";
import { ChildProcess } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const isDev = process.env.NODE_ENV === "development";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let apiProcess: ChildProcess | null = null;
let apiUrl = "";
let isQuitting = false;

async function start() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // IPC handlers
  ipcMain.on("show-notification", (_, { title, body }: { title: string; body: string }) => {
    new Notification({ title, body }).show();
  });
  ipcMain.on("window-minimize", () => mainWindow?.minimize());
  ipcMain.on("window-maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on("window-close", () => mainWindow?.close());
  ipcMain.handle("get-api-url", () => apiUrl);

  // Launch the .NET API first
  try {
    const result: ApiProcessResult = await launchApi();
    apiProcess = result.process;
    apiUrl = result.url;
    console.log(`API running at ${apiUrl}`);
  } catch (err) {
    console.error("Failed to start API:", err);
    await app.whenReady();
    const { dialog } = await import("electron");
    dialog.showErrorBox(
      "Failed to start API",
      "The backend service could not be started. Please check your installation and try again."
    );
    app.quit();
    return;
  }

  await app.whenReady();
  createMenu();
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Close to tray instead of quitting
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      // Don't quit — just hide to tray
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
    killApi(apiProcess);
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "Whamail",
    icon: join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, "..", "out", "index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Close → hide to tray instead of quitting
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Whamail",
      submenu: [
        {
          label: "About Whamail",
          click: () => {
            const { dialog } = require("electron");
            dialog.showMessageBox({
              type: "info",
              title: "About Whamail",
              message: "Whamail",
              detail: `Version ${app.getVersion()}\nEmail broadcast platform`,
            });
          },
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
        { type: "separator" },
        { role: "window" },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createTray() {
  // Use 32x32 icon for tray
  const iconPath = join(__dirname, "..", "build", "icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  const trayIcon = icon.isEmpty()
    ? nativeImage.createEmpty()
    : icon.resize({ width: 24, height: 24 });

  tray = new Tray(trayIcon);
  tray.setToolTip("Whamail");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Whamail",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: "Hide Whamail",
      click: () => {
        mainWindow?.hide();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  tray.on("click", () => {
    if (mainWindow?.isVisible()) {
      mainWindow?.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

start().catch((err) => {
  console.error("Fatal error:", err);
  app.quit();
});