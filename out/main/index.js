"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const zod = require("zod");
const ProviderManifestSchema = zod.z.object({
  schemaVersion: zod.z.literal("1.0"),
  id: zod.z.string().min(1),
  name: zod.z.string().min(1),
  startUrl: zod.z.string().url(),
  icon: zod.z.string().optional(),
  category: zod.z.string().optional(),
  description: zod.z.string().optional(),
  partition: zod.z.string(),
  homeUrl: zod.z.string().url().optional(),
  allowPopups: zod.z.boolean().optional().default(false),
  allowNotifications: zod.z.boolean().optional().default(false),
  allowClipboardRead: zod.z.boolean().optional().default(false),
  allowClipboardWrite: zod.z.boolean().optional().default(false),
  externalUrlPatterns: zod.z.array(zod.z.string()).optional(),
  allowedHosts: zod.z.array(zod.z.string()).optional(),
  userAgentMode: zod.z.enum(["default", "custom"]).optional(),
  customUserAgent: zod.z.string().optional(),
  enabled: zod.z.boolean().default(true)
});
zod.z.object({
  schemaVersion: zod.z.literal("1.0"),
  exportedAt: zod.z.string(),
  providers: zod.z.array(ProviderManifestSchema)
});
zod.z.object({
  schemaVersion: zod.z.literal("1.0"),
  locale: zod.z.string().default("en"),
  theme: zod.z.enum(["system", "light", "dark"]).default("system"),
  compactSidebar: zod.z.boolean().default(false),
  lastSelectedProviderId: zod.z.string().optional(),
  showProviderLabels: zod.z.boolean().default(true),
  reducedMotion: zod.z.boolean().default(false)
});
class ProviderRegistry {
  providers = [];
  catalogPath;
  constructor() {
    this.catalogPath = path.join(electron.app.getPath("userData"), "providers.catalog.json");
  }
  async load() {
    try {
      const data = await fs.promises.readFile(this.catalogPath, "utf8");
      const parsed = JSON.parse(data);
      const validProviders = [];
      if (parsed && Array.isArray(parsed.providers)) {
        for (const providerData of parsed.providers) {
          const result = ProviderManifestSchema.safeParse(providerData);
          if (result.success) {
            validProviders.push(result.data);
          } else {
            console.warn(`Invalid provider manifest skipped: ${providerData.id}`, result.error);
          }
        }
      }
      this.providers = validProviders;
    } catch (e) {
      if (e.code !== "ENOENT") {
        console.error("Failed to read provider catalog", e);
      }
      this.providers = [];
      await this.save();
    }
  }
  list() {
    return this.providers;
  }
  async create(provider) {
    const validProvider = ProviderManifestSchema.parse(provider);
    if (this.providers.some((p) => p.id === validProvider.id)) {
      throw new Error(`Provider with id ${validProvider.id} already exists`);
    }
    this.providers.push(validProvider);
    await this.save();
  }
  async update(provider) {
    const validProvider = ProviderManifestSchema.parse(provider);
    const index = this.providers.findIndex((p) => p.id === validProvider.id);
    if (index >= 0) {
      this.providers[index] = validProvider;
      await this.save();
    } else {
      throw new Error(`Provider with id ${validProvider.id} not found`);
    }
  }
  async delete(providerId) {
    const initialLength = this.providers.length;
    this.providers = this.providers.filter((p) => p.id !== providerId);
    if (this.providers.length !== initialLength) {
      await this.save();
    }
  }
  async save() {
    const catalog = {
      schemaVersion: "1.0",
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      providers: this.providers
    };
    await fs.promises.writeFile(this.catalogPath, JSON.stringify(catalog, null, 2), "utf8");
  }
}
class ViewManager {
  constructor(mainWindow2) {
    this.mainWindow = mainWindow2;
    this.mainWindow.on("resize", () => this.resizeView());
    this.setupIpc();
  }
  currentView = null;
  currentProvider = null;
  setupIpc() {
    electron.ipcMain.handle("provider-view:reload", () => {
      if (this.currentView) {
        this.currentView.webContents.reload();
      }
    });
    electron.ipcMain.handle("provider-view:navigate-back", () => {
      if (this.currentView && this.currentView.webContents.canGoBack()) {
        this.currentView.webContents.goBack();
      }
    });
    electron.ipcMain.handle("provider-view:navigate-forward", () => {
      if (this.currentView && this.currentView.webContents.canGoForward()) {
        this.currentView.webContents.goForward();
      }
    });
  }
  openProvider(provider) {
    if (this.currentView) {
      this.mainWindow.contentView.removeChild(this.currentView);
    }
    this.currentProvider = provider;
    const partitionSession = electron.session.fromPartition(provider.partition);
    partitionSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === "clipboard-sanitized-write" && provider.allowClipboardWrite) {
        return callback(true);
      }
      if (permission === "clipboard-read" && provider.allowClipboardRead) {
        return callback(true);
      }
      if (permission === "notifications" && provider.allowNotifications) {
        return callback(true);
      }
      console.log(`Permission ${permission} denied for provider ${provider.id}`);
      callback(false);
    });
    this.currentView = new electron.WebContentsView({
      webPreferences: {
        session: partitionSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    this.currentView.webContents.setWindowOpenHandler((details) => {
      if (provider.allowPopups) {
        return { action: "allow" };
      }
      import("electron").then(({ shell }) => shell.openExternal(details.url));
      return { action: "deny" };
    });
    this.currentView.webContents.on("did-start-loading", () => this.broadcastState());
    this.currentView.webContents.on("did-stop-loading", () => this.broadcastState());
    this.currentView.webContents.on("did-navigate", () => this.broadcastState());
    this.currentView.webContents.on("did-navigate-in-page", () => this.broadcastState());
    this.currentView.webContents.on("did-fail-load", (_, errorCode, errorDescription) => {
      this.broadcastState(errorCode.toString(), errorDescription);
    });
    if (provider.userAgentMode === "custom" && provider.customUserAgent) {
      this.currentView.webContents.setUserAgent(provider.customUserAgent);
    }
    this.mainWindow.contentView.addChild(this.currentView);
    this.resizeView();
    this.currentView.webContents.loadURL(provider.startUrl);
  }
  closeCurrentProvider() {
    if (this.currentView) {
      this.mainWindow.contentView.removeChild(this.currentView);
      this.currentView = null;
      this.currentProvider = null;
    }
  }
  resizeView() {
    if (!this.currentView || !this.mainWindow) return;
    const bounds = this.mainWindow.getContentBounds();
    this.currentView.setBounds({
      x: 260,
      y: 48,
      width: bounds.width - 260,
      height: bounds.height - 48
    });
  }
  broadcastState(errorCode, errorMessage) {
    if (!this.currentView || !this.currentProvider) return;
    const state = {
      providerId: this.currentProvider.id,
      canGoBack: this.currentView.webContents.canGoBack(),
      canGoForward: this.currentView.webContents.canGoForward(),
      isLoading: this.currentView.webContents.isLoading(),
      currentUrl: this.currentView.webContents.getURL(),
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage
    };
    this.mainWindow.webContents.send("provider-view:state-changed", state);
  }
  async resetSession(provider) {
    const partitionSession = electron.session.fromPartition(provider.partition);
    await partitionSession.clearStorageData();
    await partitionSession.clearCache();
  }
}
const registry = new ProviderRegistry();
let mainWindow = null;
let viewManager = null;
async function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  viewManager = new ViewManager(mainWindow);
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (!electron.app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(async () => {
  await registry.load();
  electron.ipcMain.handle("providers:list", () => registry.list());
  electron.ipcMain.handle("providers:create", async (_event, provider) => {
    await registry.create(provider);
  });
  electron.ipcMain.handle("providers:update", async (_event, provider) => {
    await registry.update(provider);
  });
  electron.ipcMain.handle("providers:delete", async (_event, providerId) => {
    await registry.delete(providerId);
    if (viewManager) {
      viewManager.closeCurrentProvider();
    }
  });
  electron.ipcMain.handle("provider-view:open", (_event, providerId) => {
    const provider = registry.list().find((p) => p.id === providerId);
    if (provider && viewManager) {
      viewManager.openProvider(provider);
    }
  });
  electron.ipcMain.handle("providers:reset-session", async (_event, providerId) => {
    const provider = registry.list().find((p) => p.id === providerId);
    if (provider && viewManager) {
      await viewManager.resetSession(provider);
    }
  });
  electron.ipcMain.handle("providers:export", async () => {
    if (!mainWindow) return false;
    const { filePath } = await electron.dialog.showSaveDialog(mainWindow, {
      title: "Esporta Catalogo Provider",
      defaultPath: "glaia-providers.json",
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (filePath) {
      const catalog = {
        schemaVersion: "1.0",
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        providers: registry.list()
      };
      await fs.promises.writeFile(filePath, JSON.stringify(catalog, null, 2), "utf-8");
      return true;
    }
    return false;
  });
  electron.ipcMain.handle("providers:import", async () => {
    if (!mainWindow) return false;
    const { filePaths } = await electron.dialog.showOpenDialog(mainWindow, {
      title: "Importa Catalogo Provider",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"]
    });
    if (filePaths && filePaths.length > 0) {
      try {
        const content = await fs.promises.readFile(filePaths[0], "utf-8");
        const parsed = JSON.parse(content);
        if (parsed.providers && Array.isArray(parsed.providers)) {
          for (const p of parsed.providers) {
            try {
              if (registry.list().some((existing) => existing.id === p.id)) {
                await registry.update(p);
              } else {
                await registry.create(p);
              }
            } catch (e) {
              console.warn(`Failed to import provider ${p.id}`, e);
            }
          }
        }
        return true;
      } catch (e) {
        console.error("Import failed", e);
        return false;
      }
    }
    return false;
  });
  electron.session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(false);
  });
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
