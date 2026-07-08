import { app, BrowserWindow, shell, Menu, Tray, nativeImage, Notification, ipcMain, nativeTheme, protocol, net } from "electron";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { launchApi, killApi, ApiProcessResult } from "./api-process.js";
import { ChildProcess } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const isDev = process.env.NODE_ENV === "development";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let apiProcess: ChildProcess | null = null;
let apiUrl = "";
let isQuitting = false;

const PROTOCOL = "app";
const OUT_DIR = join(__dirname, "..", "out");

function registerAppProtocol() {
  protocol.handle(PROTOCOL, (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);

    // Remove leading slash on Windows
    if (pathname.startsWith("/")) pathname = pathname.slice(1);

    // _next assets always resolve from root (fixes relative path issues on subpages)
    const nextIdx = pathname.indexOf("_next/");
    if (nextIdx > 0) {
      pathname = pathname.slice(nextIdx);
    }

    // Default to index.html for directory-like paths
    if (!pathname || pathname.endsWith("/")) {
      pathname = join(pathname, "index.html");
    }

    let filePath = join(OUT_DIR, pathname);

    // If file doesn't exist, try adding /index.html (Next.js trailingSlash)
    if (!existsSync(filePath)) {
      const withIndex = join(OUT_DIR, pathname, "index.html");
      if (existsSync(withIndex)) {
        filePath = withIndex;
      }
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function handleDeepLink(url: string) {
  // whamail://auth/callback?code=xxx
  // URL parses as: hostname=auth, pathname=/callback
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "auth" && parsed.pathname === "/callback") {
      const code = parsed.searchParams.get("code");
      if (code && mainWindow) {
        mainWindow.webContents.send("auth-callback", code);
        mainWindow.show();
        mainWindow.focus();
      }
    }
  } catch {
    console.error("Invalid deep link:", url);
  }
}

protocol.registerSchemesAsPrivileged([
  { scheme: PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

async function start() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  // Register as handler for whamail:// deep links
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient("whamail", process.execPath, [app.getAppPath()]);
  } else {
    app.setAsDefaultProtocolClient("whamail");
  }

  app.on("second-instance", (_event, argv) => {
    // On Windows, deep link URL comes as last argv
    const deepLink = argv.find((arg) => arg.startsWith("whamail://"));
    if (deepLink) {
      handleDeepLink(deepLink);
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // macOS deep link
  app.on("open-url", (_event, url) => {
    handleDeepLink(url);
  });

  // IPC handlers
  ipcMain.handle("open-external-auth", (_event, url: string) => {
    shell.openExternal(url);
  });
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
  registerAppProtocol();
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
  } else {
    mainWindow.loadURL(`${PROTOCOL}://./index.html`);
  }

  mainWindow.webContents.openDevTools();

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