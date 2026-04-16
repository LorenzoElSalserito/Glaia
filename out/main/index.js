"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const zod = require("zod");
const util = require("util");
const version = "0.1.0";
const packageJson = {
  version
};
const providerIdRegex = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const ProviderManifestSchema = zod.z.object({
  schemaVersion: zod.z.literal("1.0"),
  id: zod.z.string().min(1).max(64).regex(providerIdRegex, "id must be lowercase kebab-case"),
  name: zod.z.string().min(1).max(100),
  startUrl: zod.z.string().url().refine((u) => u.startsWith("https://"), "startUrl must use https"),
  partition: zod.z.string().startsWith(
    "persist:provider.",
    'partition must start with "persist:provider."'
  ),
  homeUrl: zod.z.string().url().refine((u) => u.startsWith("https://"), "homeUrl must use https").optional(),
  description: zod.z.string().max(500).optional(),
  allowPopups: zod.z.boolean().default(false),
  allowNotifications: zod.z.boolean().default(false),
  allowClipboardRead: zod.z.boolean().default(false),
  allowClipboardWrite: zod.z.boolean().default(false),
  externalUrlPatterns: zod.z.array(zod.z.string()).optional(),
  allowedHosts: zod.z.array(zod.z.string()).optional(),
  userAgentMode: zod.z.enum(["default", "custom"]).default("default"),
  customUserAgent: zod.z.string().optional(),
  enabled: zod.z.boolean().default(true)
});
const ProviderCatalogSchema = zod.z.object({
  schemaVersion: zod.z.literal("1.0"),
  exportedAt: zod.z.string().datetime(),
  providers: zod.z.array(ProviderManifestSchema)
});
const AppSettingsSchema = zod.z.object({
  schemaVersion: zod.z.literal("1.0"),
  locale: zod.z.enum(["it", "en"]).default("it"),
  theme: zod.z.enum(["system", "light", "dark"]).default("system"),
  selectedProviderId: zod.z.string().nullable().default(null),
  compactSidebar: zod.z.boolean().default(false),
  showProviderLabels: zod.z.boolean().default(true),
  reducedMotion: zod.z.boolean().default(false),
  confirmBeforeReset: zod.z.boolean().default(true)
});
const IpcChannels = {
  ProvidersList: "providers:list",
  ProvidersCreate: "providers:create",
  ProvidersUpdate: "providers:update",
  ProvidersDelete: "providers:delete",
  ProvidersResetSession: "providers:reset-session",
  ProvidersExport: "providers:export",
  ProvidersImport: "providers:import",
  ProviderViewOpen: "provider-view:open",
  ProviderViewClose: "provider-view:close",
  ProviderViewReload: "provider-view:reload",
  ProviderViewHardReload: "provider-view:hard-reload",
  ProviderViewBack: "provider-view:navigate-back",
  ProviderViewForward: "provider-view:navigate-forward",
  ProviderViewGoHome: "provider-view:go-home",
  ProviderViewOpenExternal: "provider-view:open-external",
  ProviderViewState: "provider-view:state-changed",
  ProviderViewSetBounds: "provider-view:set-bounds",
  ProviderViewSetVisible: "provider-view:set-visible",
  SettingsGet: "settings:get",
  SettingsUpdate: "settings:update",
  AppGetVersion: "app:get-version",
  AppReportBug: "app:report-bug"
};
function getGlaiaDocumentsDir() {
  return path.join(electron.app.getPath("documents"), "Glaia");
}
function getSettingsPath() {
  return path.join(getGlaiaDocumentsDir(), "settings.json");
}
function getProviderCatalogPath() {
  return path.join(getGlaiaDocumentsDir(), "providers.catalog.json");
}
function getLogPath() {
  return path.join(getGlaiaDocumentsDir(), "logs", "glaia.log");
}
const DEFAULT_PROVIDERS_INPUT = [
  {
    schemaVersion: "1.0",
    id: "chatgpt",
    name: "ChatGPT",
    startUrl: "https://chatgpt.com/",
    partition: "persist:provider.chatgpt.default"
  },
  {
    schemaVersion: "1.0",
    id: "gemini",
    name: "Gemini",
    startUrl: "https://gemini.google.com/",
    partition: "persist:provider.gemini.default"
  },
  {
    schemaVersion: "1.0",
    id: "microsoft-copilot",
    name: "Microsoft Copilot",
    startUrl: "https://copilot.microsoft.com/",
    partition: "persist:provider.copilot.default"
  },
  {
    schemaVersion: "1.0",
    id: "claude-ai",
    name: "Claude AI",
    startUrl: "https://claude.ai/",
    partition: "persist:provider.claude.default"
  },
  {
    schemaVersion: "1.0",
    id: "grok",
    name: "Grok",
    startUrl: "https://grok.com/",
    partition: "persist:provider.grok.default"
  },
  {
    schemaVersion: "1.0",
    id: "mistral-le-chat",
    name: "Mistral Le Chat",
    startUrl: "https://chat.mistral.ai/",
    partition: "persist:provider.mistral.default"
  },
  {
    schemaVersion: "1.0",
    id: "deepseek",
    name: "DeepSeek",
    startUrl: "https://chat.deepseek.com/",
    partition: "persist:provider.deepseek.default"
  },
  {
    schemaVersion: "1.0",
    id: "meta-ai",
    name: "Meta AI",
    startUrl: "https://www.meta.ai/",
    partition: "persist:provider.meta.default"
  },
  {
    schemaVersion: "1.0",
    id: "alibaba-qwen",
    name: "Alibaba Qwen",
    startUrl: "https://chat.qwen.ai/",
    partition: "persist:provider.qwen.default"
  },
  {
    schemaVersion: "1.0",
    id: "kimi",
    name: "Kimi",
    startUrl: "https://kimi.com/",
    partition: "persist:provider.kimi.default"
  },
  {
    schemaVersion: "1.0",
    id: "01-ai-wanzhi",
    name: "01.ai Wanzhi",
    startUrl: "https://www.01.ai/",
    partition: "persist:provider.wanzhi.default"
  },
  {
    schemaVersion: "1.0",
    id: "perplexity-ai",
    name: "Perplexity AI",
    startUrl: "https://www.perplexity.ai/",
    partition: "persist:provider.perplexity.default"
  },
  {
    schemaVersion: "1.0",
    id: "duck-ai",
    name: "Duck.ai",
    startUrl: "https://duck.ai/",
    partition: "persist:provider.duckai.default"
  },
  {
    schemaVersion: "1.0",
    id: "huggingchat",
    name: "HuggingChat",
    startUrl: "https://huggingface.co/chat",
    partition: "persist:provider.huggingchat.default"
  },
  {
    schemaVersion: "1.0",
    id: "poe",
    name: "Poe",
    startUrl: "https://poe.com/",
    partition: "persist:provider.poe.default"
  },
  {
    schemaVersion: "1.0",
    id: "pi-ai",
    name: "Pi AI",
    startUrl: "https://pi.ai/",
    partition: "persist:provider.pi.default"
  },
  {
    schemaVersion: "1.0",
    id: "groq",
    name: "Groq Console",
    startUrl: "https://console.groq.com/",
    partition: "persist:provider.groq.default"
  },
  {
    schemaVersion: "1.0",
    id: "ninja-ai",
    name: "Ninja AI",
    startUrl: "https://www.ninjatech.ai/",
    partition: "persist:provider.ninjaai.default"
  },
  {
    schemaVersion: "1.0",
    id: "cohere-coral",
    name: "Cohere Coral",
    startUrl: "https://cohere.com/",
    partition: "persist:provider.cohere.default"
  }
];
const DEFAULT_PROVIDERS = DEFAULT_PROVIDERS_INPUT.map(
  (input) => ProviderManifestSchema.parse(input)
);
class ProviderRegistry {
  providers = [];
  catalogPath;
  constructor(catalogPath) {
    this.catalogPath = catalogPath ?? getProviderCatalogPath();
  }
  async load() {
    try {
      const data = await fs.promises.readFile(this.catalogPath, "utf8");
      const parsed = JSON.parse(data);
      this.providers = this.parseProviders(parsed);
      if (this.providers.length === 0) {
        this.providers = [...DEFAULT_PROVIDERS];
        await this.save();
      }
    } catch (e) {
      const err = e;
      if (err.code !== "ENOENT") {
        console.error("[registry] failed to read catalog", err);
      }
      const migrated = await this.tryLoadLegacyCatalog();
      if (migrated) return;
      this.providers = [...DEFAULT_PROVIDERS];
      await this.save();
    }
  }
  async tryLoadLegacyCatalog() {
    const legacyPath = path.join(electron.app.getPath("userData"), "providers.catalog.json");
    if (legacyPath === this.catalogPath) return false;
    try {
      const data = await fs.promises.readFile(legacyPath, "utf8");
      const parsed = JSON.parse(data);
      this.providers = this.parseProviders(parsed);
      if (this.providers.length === 0) return false;
      await this.save();
      return true;
    } catch {
      return false;
    }
  }
  parseProviders(raw) {
    if (!raw || typeof raw !== "object") return [];
    const candidate = raw;
    if (!Array.isArray(candidate.providers)) return [];
    const valid = [];
    for (const entry of candidate.providers) {
      const result = ProviderManifestSchema.safeParse(entry);
      if (result.success) {
        valid.push(result.data);
      } else {
        const id = entry && typeof entry === "object" && "id" in entry ? String(entry.id) : "<unknown>";
        console.warn(
          `[registry] skipping invalid provider "${id}":`,
          result.error.flatten()
        );
      }
    }
    return valid;
  }
  list() {
    return [...this.providers];
  }
  get(providerId) {
    return this.providers.find((p) => p.id === providerId) ?? null;
  }
  async create(input) {
    const provider = ProviderManifestSchema.parse(input);
    if (this.providers.some((p) => p.id === provider.id)) {
      throw new Error(`Provider with id "${provider.id}" already exists`);
    }
    this.providers.push(provider);
    await this.save();
    return provider;
  }
  async update(input) {
    const provider = ProviderManifestSchema.parse(input);
    const index = this.providers.findIndex((p) => p.id === provider.id);
    if (index < 0) {
      throw new Error(`Provider with id "${provider.id}" not found`);
    }
    this.providers[index] = provider;
    await this.save();
    return provider;
  }
  async delete(providerId) {
    const before = this.providers.length;
    this.providers = this.providers.filter((p) => p.id !== providerId);
    const removed = this.providers.length !== before;
    if (removed) await this.save();
    return removed;
  }
  async importCatalog(raw) {
    const valid = this.parseProviders(raw);
    let imported = 0;
    let updated = 0;
    const skipped = Array.isArray(raw.providers) ? raw.providers.length - valid.length : 0;
    for (const provider of valid) {
      const idx = this.providers.findIndex((p) => p.id === provider.id);
      if (idx >= 0) {
        this.providers[idx] = provider;
        updated++;
      } else {
        this.providers.push(provider);
        imported++;
      }
    }
    await this.save();
    return { imported, updated, skipped };
  }
  exportCatalog() {
    return ProviderCatalogSchema.parse({
      schemaVersion: "1.0",
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      providers: this.providers
    });
  }
  async save() {
    const catalog = this.exportCatalog();
    const tmp = `${this.catalogPath}.tmp`;
    await fs.promises.mkdir(path.dirname(this.catalogPath), { recursive: true });
    await fs.promises.writeFile(tmp, JSON.stringify(catalog, null, 2), "utf8");
    await fs.promises.rename(tmp, this.catalogPath);
  }
}
const TOOLBAR_HEIGHT = 52;
const FALLBACK_SIDEBAR_WIDTH = 280;
const COMPACT_SIDEBAR_WIDTH = 208;
const HIDDEN_BOUNDS = { x: 0, y: 0, width: 0, height: 0 };
class ViewManager {
  currentView = null;
  currentProvider = null;
  hostBounds = null;
  visible = true;
  mainWindow;
  settingsManager;
  constructor(mainWindow2, settingsManager2) {
    this.mainWindow = mainWindow2;
    this.settingsManager = settingsManager2;
    this.mainWindow.on("resize", () => this.applyBounds());
    this.mainWindow.on("closed", () => {
      this.currentView = null;
      this.currentProvider = null;
      this.hostBounds = null;
    });
  }
  openProvider(provider) {
    if (this.currentProvider && this.currentProvider.id === provider.id && this.currentView) {
      this.broadcastState();
      return;
    }
    this.detachCurrentView();
    this.currentProvider = provider;
    const partitionSession = electron.session.fromPartition(provider.partition);
    this.applySessionPolicies(partitionSession, provider);
    const view = new electron.WebContentsView({
      webPreferences: {
        session: partitionSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: true
      }
    });
    this.attachWebContentsListeners(view, provider);
    if (provider.userAgentMode === "custom" && provider.customUserAgent) {
      view.webContents.setUserAgent(provider.customUserAgent);
    }
    this.currentView = view;
    this.mainWindow.contentView.addChildView(view);
    this.applyBounds();
    void view.webContents.loadURL(provider.startUrl);
  }
  setHostBounds(bounds) {
    this.hostBounds = {
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height))
    };
    this.applyBounds();
  }
  setVisible(visible) {
    if (this.visible === visible) return;
    this.visible = visible;
    this.applyBounds();
  }
  closeCurrentProvider() {
    this.detachCurrentView();
    this.currentProvider = null;
    this.broadcastState();
  }
  reload() {
    if (!this.currentView) return;
    this.currentView.webContents.reload();
  }
  hardReload() {
    if (!this.currentView) return;
    this.currentView.webContents.reloadIgnoringCache();
  }
  navigateBack() {
    if (!this.currentView) return;
    const wc = this.currentView.webContents;
    if (wc.canGoBack()) wc.goBack();
  }
  navigateForward() {
    if (!this.currentView) return;
    const wc = this.currentView.webContents;
    if (wc.canGoForward()) wc.goForward();
  }
  goHome() {
    if (!this.currentView || !this.currentProvider) return;
    const target = this.currentProvider.homeUrl ?? this.currentProvider.startUrl;
    void this.currentView.webContents.loadURL(target);
  }
  openExternal() {
    if (!this.currentView) return;
    const url = this.currentView.webContents.getURL();
    if (url && url.startsWith("https://")) {
      void electron.shell.openExternal(url);
    }
  }
  async resetSession(provider) {
    const isActive = this.currentProvider !== null && this.currentProvider.id === provider.id;
    if (isActive) {
      this.detachCurrentView();
    }
    const partitionSession = electron.session.fromPartition(provider.partition);
    await partitionSession.clearStorageData({
      storages: [
        "cookies",
        "filesystem",
        "indexdb",
        "localstorage",
        "shadercache",
        "serviceworkers",
        "cachestorage"
      ]
    });
    await partitionSession.clearCache();
    await partitionSession.clearAuthCache();
    if (isActive) {
      this.openProvider(provider);
    }
  }
  getCurrentState() {
    if (!this.currentView || !this.currentProvider) return null;
    return this.computeState();
  }
  detachCurrentView() {
    if (!this.currentView) return;
    try {
      this.mainWindow.contentView.removeChildView(this.currentView);
    } catch {
    }
    try {
      this.currentView.webContents.removeAllListeners();
      if (!this.currentView.webContents.isDestroyed()) {
        this.currentView.webContents.close();
      }
    } catch {
    }
    this.currentView = null;
  }
  attachWebContentsListeners(view, provider) {
    const wc = view.webContents;
    wc.setWindowOpenHandler((details) => {
      const url = details.url;
      const isExternalAllowed = this.matchesExternal(url, provider);
      if (isExternalAllowed || !provider.allowPopups) {
        if (url.startsWith("https://")) {
          void electron.shell.openExternal(url);
        }
        return { action: "deny" };
      }
      return { action: "deny" };
    });
    wc.on("will-navigate", (event, url) => {
      try {
        const parsed = new URL(url);
        if (this.matchesExternal(url, provider)) {
          event.preventDefault();
          if (url.startsWith("https://")) void electron.shell.openExternal(url);
          return;
        }
        if (provider.allowedHosts && provider.allowedHosts.length > 0) {
          const allowed = provider.allowedHosts.some(
            (host) => parsed.hostname === host || parsed.hostname.endsWith("." + host)
          );
          if (!allowed) {
            event.preventDefault();
          }
        }
      } catch {
        event.preventDefault();
      }
    });
    wc.on("did-start-loading", () => this.broadcastState());
    wc.on("did-stop-loading", () => this.broadcastState());
    wc.on("did-navigate", () => this.broadcastState());
    wc.on("did-navigate-in-page", () => this.broadcastState());
    wc.on("did-fail-load", (_event, errorCode, errorDescription, _url, isMainFrame) => {
      if (!isMainFrame) return;
      this.broadcastState(String(errorCode), errorDescription);
    });
  }
  applySessionPolicies(s, provider) {
    s.setPermissionRequestHandler((_webContents, permission, callback) => {
      const granted = this.evaluatePermission(permission, provider);
      callback(granted);
    });
    s.setPermissionCheckHandler((_webContents, permission) => {
      return this.evaluatePermission(permission, provider);
    });
  }
  evaluatePermission(permission, provider) {
    switch (permission) {
      case "clipboard-read":
        return provider.allowClipboardRead;
      case "clipboard-write":
      case "clipboard-sanitized-write":
        return provider.allowClipboardWrite;
      case "notifications":
        return provider.allowNotifications;
      default:
        return false;
    }
  }
  matchesExternal(url, provider) {
    if (!provider.externalUrlPatterns || provider.externalUrlPatterns.length === 0) {
      return false;
    }
    return provider.externalUrlPatterns.some(
      (pattern) => url.startsWith(pattern.replace("*", ""))
    );
  }
  applyBounds() {
    if (!this.currentView) return;
    if (!this.visible) {
      this.currentView.setBounds(HIDDEN_BOUNDS);
      return;
    }
    if (this.hostBounds) {
      this.currentView.setBounds(this.hostBounds);
      return;
    }
    const bounds = this.mainWindow.getContentBounds();
    const settings = this.settingsManager.get();
    const sidebarWidth = settings.compactSidebar ? COMPACT_SIDEBAR_WIDTH : FALLBACK_SIDEBAR_WIDTH;
    this.currentView.setBounds({
      x: sidebarWidth,
      y: TOOLBAR_HEIGHT,
      width: Math.max(0, bounds.width - sidebarWidth),
      height: Math.max(0, bounds.height - TOOLBAR_HEIGHT)
    });
  }
  computeState() {
    const wc = this.currentView.webContents;
    const provider = this.currentProvider;
    return {
      providerId: provider.id,
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
      isLoading: wc.isLoading(),
      currentUrl: wc.getURL() || null,
      lastErrorCode: null,
      lastErrorMessage: null
    };
  }
  broadcastState(errorCode, errorMessage) {
    if (!this.currentView || !this.currentProvider) {
      this.mainWindow.webContents.send(IpcChannels.ProviderViewState, null);
      return;
    }
    const state = this.computeState();
    if (errorCode) state.lastErrorCode = errorCode;
    if (errorMessage) state.lastErrorMessage = errorMessage;
    this.mainWindow.webContents.send(IpcChannels.ProviderViewState, state);
  }
  refreshLayout() {
    this.applyBounds();
  }
}
const DEFAULT_SETTINGS = AppSettingsSchema.parse({
  schemaVersion: "1.0"
});
class SettingsManager {
  settingsPath;
  currentSettings = DEFAULT_SETTINGS;
  constructor(settingsPath) {
    this.settingsPath = settingsPath ?? getSettingsPath();
  }
  async load() {
    try {
      const data = await fs.promises.readFile(this.settingsPath, "utf8");
      const parsed = JSON.parse(data);
      const normalized = this.migrate(parsed);
      const result = AppSettingsSchema.safeParse(normalized);
      if (result.success) {
        this.currentSettings = result.data;
      } else {
        console.warn(
          "[settings] invalid settings file, using defaults",
          result.error.flatten()
        );
        this.currentSettings = DEFAULT_SETTINGS;
        await this.save();
      }
    } catch (e) {
      const err = e;
      if (err.code !== "ENOENT") {
        console.error("[settings] failed to read settings", err);
      }
      const migrated = await this.tryLoadLegacySettings();
      if (migrated) return;
      this.currentSettings = DEFAULT_SETTINGS;
      await this.save();
    }
  }
  async tryLoadLegacySettings() {
    const legacyPath = path.join(electron.app.getPath("userData"), "settings.json");
    if (legacyPath === this.settingsPath) return false;
    try {
      const data = await fs.promises.readFile(legacyPath, "utf8");
      const parsed = JSON.parse(data);
      const normalized = this.migrate(parsed);
      const result = AppSettingsSchema.safeParse(normalized);
      if (!result.success) return false;
      this.currentSettings = result.data;
      await this.save();
      return true;
    } catch {
      return false;
    }
  }
  migrate(raw) {
    if (!raw || typeof raw !== "object") return raw;
    const obj = { ...raw };
    if ("lastSelectedProviderId" in obj && !("selectedProviderId" in obj)) {
      obj.selectedProviderId = obj.lastSelectedProviderId;
      delete obj.lastSelectedProviderId;
    }
    obj.schemaVersion = "1.0";
    return obj;
  }
  get() {
    return this.currentSettings;
  }
  async update(patch) {
    const merged = { ...this.currentSettings, ...patch };
    const result = AppSettingsSchema.safeParse(merged);
    if (!result.success) {
      throw new Error(`Invalid settings patch: ${result.error.message}`);
    }
    this.currentSettings = result.data;
    await this.save();
    return this.currentSettings;
  }
  async save() {
    const tmp = `${this.settingsPath}.tmp`;
    await fs.promises.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.promises.writeFile(
      tmp,
      JSON.stringify(this.currentSettings, null, 2),
      "utf8"
    );
    await fs.promises.rename(tmp, this.settingsPath);
  }
}
const LOG_IPC_CHANNEL = "glaia:log";
const LEVEL_RANK = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};
function colorFor(level) {
  switch (level) {
    case "debug":
      return "\x1B[90m";
    case "info":
      return "\x1B[36m";
    case "warn":
      return "\x1B[33m";
    case "error":
      return "\x1B[31m";
  }
}
const RESET = "\x1B[0m";
const BOLD = "\x1B[1m";
function formatRecord(record, useColor) {
  const time = record.ts.slice(11, 23);
  const lvl = record.level.toUpperCase().padEnd(5);
  const scope = `[${record.scope}]`;
  if (!useColor) {
    return `${time} ${lvl} ${scope} ${record.message}`;
  }
  const color = colorFor(record.level);
  return `${BOLD}${time}${RESET} ${color}${lvl}${RESET} ${BOLD}${scope}${RESET} ${record.message}`;
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function shouldEmit(level, threshold) {
  return LEVEL_RANK[level] >= LEVEL_RANK[threshold];
}
const ENV_LEVEL = process.env["GLAIA_LOG_LEVEL"] ?? "debug";
const USE_COLOR = process.stdout.isTTY === true;
const MAX_SNAPSHOT_BYTES = 12e3;
let logFilePath = null;
function stringify(data, useColor = USE_COLOR) {
  if (data === void 0) return "";
  if (typeof data === "string") return data;
  return util.inspect(data, { depth: 5, colors: useColor, breakLength: 120 });
}
function writeFileLine(line) {
  if (!logFilePath) return;
  try {
    fs.appendFileSync(logFilePath, line + "\n", "utf8");
  } catch {
  }
}
function emit(record) {
  if (!shouldEmit(record.level, ENV_LEVEL)) return;
  const line = formatRecord(record, USE_COLOR);
  const fileLine = formatRecord(record, false);
  const stream = record.level === "error" || record.level === "warn" ? process.stderr : process.stdout;
  stream.write(line + "\n");
  writeFileLine(fileLine);
  if (record.data !== void 0) {
    const data = "  " + stringify(record.data);
    const fileData = "  " + stringify(record.data, false);
    stream.write(data + "\n");
    writeFileLine(fileData);
  }
}
function configureFileLogging(filePath) {
  logFilePath = filePath;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileLine(`--- Glaia log started ${nowIso()} ---`);
  } catch {
    logFilePath = null;
  }
}
function getLogFilePath() {
  return logFilePath;
}
function readLogSnapshot() {
  if (!logFilePath) return "";
  try {
    const content = fs.readFileSync(logFilePath, "utf8");
    if (content.length <= MAX_SNAPSHOT_BYTES) return content;
    return content.slice(content.length - MAX_SNAPSHOT_BYTES);
  } catch {
    return "";
  }
}
function createLogger(scope) {
  const log2 = (level) => (message, data) => {
    const record = { level, scope, message, ts: nowIso() };
    if (data !== void 0) record.data = data;
    emit(record);
  };
  return {
    debug: log2("debug"),
    info: log2("info"),
    warn: log2("warn"),
    error: log2("error"),
    child: (sub) => createLogger(`${scope}:${sub}`),
    ingest: (record) => emit(record)
  };
}
const rootLogger = createLogger("glaia");
const log = rootLogger.child("main");
const registry = new ProviderRegistry();
const settingsManager = new SettingsManager();
let mainWindow = null;
let splashWindow = null;
let viewManager = null;
const isDev = !electron.app.isPackaged;
const appVersion = packageJson.version;
const mainMessages = {
  it: {
    exportTitle: "Esporta catalogo provider",
    importTitle: "Importa catalogo provider",
    invalidCatalog: "File catalogo non valido",
    bugMailBody: "Descrivi qui il problema riscontrato, i passaggi per riprodurlo e cosa ti aspettavi succedesse.",
    bugMailLogUnavailable: "Log non disponibile."
  },
  en: {
    exportTitle: "Export provider catalog",
    importTitle: "Import provider catalog",
    invalidCatalog: "Invalid catalog file",
    bugMailBody: "Describe the issue, the steps to reproduce it, and what you expected to happen.",
    bugMailLogUnavailable: "Log unavailable."
  }
};
function mainT(key) {
  const locale = settingsManager.get().locale;
  return mainMessages[locale]?.[key] ?? mainMessages.it[key];
}
function getWindowIcon() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "assets", "icon.png");
  }
  return path.join(__dirname, "../../build/icon.png");
}
function createSplashWindow() {
  const splash = new electron.BrowserWindow({
    width: 420,
    height: 260,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    backgroundColor: "#0c0d10",
    icon: getWindowIcon(),
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  splashWindow = splash;
  splash.on("closed", () => {
    if (splashWindow === splash) splashWindow = null;
  });
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
html,body{margin:0;width:100%;height:100%;background:#0c0d10;color:#f4f4f5;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
body{display:grid;place-items:center}
.splash{display:flex;flex-direction:column;align-items:center;gap:18px}
.mark{width:76px;height:76px;border-radius:18px;background:#2563eb;color:#fff;display:grid;place-items:center;font-size:34px;font-weight:800;box-shadow:0 18px 48px rgba(37,99,235,.32)}
.title{font-size:28px;font-weight:750}
.bar{width:180px;height:4px;border-radius:999px;background:#26272e;overflow:hidden}
.bar::before{content:"";display:block;width:40%;height:100%;background:#60a5fa;border-radius:inherit;animation:load 1.1s ease-in-out infinite}
@keyframes load{0%{transform:translateX(-100%)}100%{transform:translateX(280%)}}
</style>
</head>
<body><main class="splash" aria-label="Glaia"><div class="mark">G</div><div class="title">Glaia</div><div class="bar"></div></main></body>
</html>`;
  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).then(() => {
    if (!splash.isDestroyed()) splash.show();
  }).catch((err) => log.warn("splash load failed", { error: String(err) }));
}
function closeSplashWindow() {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.close();
  splashWindow = null;
}
function buildBugReportMailto() {
  const logPath = getLogFilePath();
  const logText = readLogSnapshot();
  const logSection = logText || mainT("bugMailLogUnavailable");
  const body = [
    mainT("bugMailBody"),
    "",
    "---",
    `Glaia version: ${appVersion}`,
    `Platform: ${process.platform} ${process.arch}`,
    `Electron: ${process.versions.electron}`,
    logPath ? `Log file: ${logPath}` : "Log file: unavailable",
    "---",
    "",
    logSection
  ].join("\n");
  const params = new URLSearchParams({
    subject: "[GLAIA BUG]",
    body
  });
  return `mailto:commercial.lorenzodm@gmail.com?${params.toString()}`;
}
function attachWebContentsLogging(wc, scope) {
  const wcLog = createLogger(scope);
  wc.on("console-message", (_event, level, message, line, sourceId) => {
    const mapping = {
      0: "debug",
      1: "info",
      2: "warn",
      3: "error"
    };
    const lvl = mapping[level] ?? "info";
    wcLog[lvl](`console: ${message}`, { line, source: sourceId });
  });
  wc.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    wcLog.error(`load failed (${errorCode})`, { errorDescription, url: validatedURL });
  });
  wc.on("render-process-gone", (_event, details) => {
    wcLog.error("render process gone", details);
  });
  wc.on("unresponsive", () => wcLog.warn("renderer unresponsive"));
  wc.on("responsive", () => wcLog.info("renderer responsive again"));
  wc.on("preload-error", (_event, preloadPath, error) => {
    wcLog.error("preload error", { preloadPath, error: String(error) });
  });
  wc.on("did-finish-load", () => wcLog.debug("did-finish-load"));
}
async function createWindow() {
  log.info("creating main window", {
    dev: isDev,
    rendererUrl: process.env["ELECTRON_RENDERER_URL"] ?? "(file)"
  });
  const window = new electron.BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#1e1e1e",
    icon: getWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false
    }
  });
  mainWindow = window;
  viewManager = new ViewManager(window, settingsManager);
  attachWebContentsLogging(window.webContents, "shell");
  window.on("closed", () => {
    log.info("main window closed");
    if (mainWindow === window) {
      mainWindow = null;
      viewManager = null;
    }
  });
  window.webContents.setWindowOpenHandler((details) => {
    log.info("shell window-open denied", { url: details.url });
    if (details.url.startsWith("https://")) {
      void electron.shell.openExternal(details.url);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const allowedDev = process.env["ELECTRON_RENDERER_URL"];
    if (allowedDev && url.startsWith(allowedDev)) return;
    if (url.startsWith("file://")) return;
    log.warn("shell navigation blocked", { url });
    event.preventDefault();
  });
  window.on("ready-to-show", () => {
    log.info("shell ready-to-show");
    window.show();
    closeSplashWindow();
    if (isDev) {
      window.webContents.openDevTools({ mode: "detach" });
    }
    const settings = settingsManager.get();
    if (settings.selectedProviderId) {
      const provider = registry.get(settings.selectedProviderId);
      if (provider && viewManager) {
        log.info("restoring last selected provider", { id: provider.id });
        viewManager.openProvider(provider);
      }
    }
  });
  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    log.info("loading dev renderer", { url: process.env["ELECTRON_RENDERER_URL"] });
    await window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    const file = path.join(__dirname, "../renderer/index.html");
    log.info("loading file renderer", { file });
    await window.loadFile(file);
  }
}
function registerIpcHandlers() {
  electron.ipcMain.handle(IpcChannels.AppGetVersion, () => appVersion);
  electron.ipcMain.handle(IpcChannels.AppReportBug, async () => {
    const mailto = buildBugReportMailto();
    log.info("opening bug report mail");
    await electron.shell.openExternal(mailto);
    return true;
  });
  electron.ipcMain.handle(IpcChannels.SettingsGet, () => settingsManager.get());
  electron.ipcMain.handle(
    IpcChannels.SettingsUpdate,
    async (_event, patch) => {
      const partial = AppSettingsSchema.partial().parse(patch ?? {});
      const updated = await settingsManager.update(partial);
      if (viewManager && mainWindow && Object.prototype.hasOwnProperty.call(partial, "compactSidebar")) {
        viewManager.refreshLayout();
      }
      log.debug("settings updated", partial);
      return updated;
    }
  );
  electron.ipcMain.handle(IpcChannels.ProvidersList, () => registry.list());
  electron.ipcMain.handle(
    IpcChannels.ProvidersCreate,
    async (_event, provider) => {
      const created = await registry.create(provider);
      log.info("provider created", { id: created.id });
      return created;
    }
  );
  electron.ipcMain.handle(
    IpcChannels.ProvidersUpdate,
    async (_event, provider) => {
      const updated = await registry.update(provider);
      log.info("provider updated", { id: updated.id });
      return updated;
    }
  );
  electron.ipcMain.handle(
    IpcChannels.ProvidersDelete,
    async (_event, providerId) => {
      if (typeof providerId !== "string") {
        throw new Error("providerId must be a string");
      }
      const removed = await registry.delete(providerId);
      const settings = settingsManager.get();
      if (removed && settings.selectedProviderId === providerId) {
        await settingsManager.update({ selectedProviderId: null });
        viewManager?.closeCurrentProvider();
      }
      log.info("provider delete", { id: providerId, removed });
      return removed;
    }
  );
  electron.ipcMain.handle(
    IpcChannels.ProvidersResetSession,
    async (_event, providerId) => {
      if (typeof providerId !== "string") {
        throw new Error("providerId must be a string");
      }
      const provider = registry.get(providerId);
      if (!provider || !viewManager) return false;
      log.info("reset session", { id: providerId });
      await viewManager.resetSession(provider);
      return true;
    }
  );
  electron.ipcMain.handle(IpcChannels.ProvidersExport, async () => {
    if (!mainWindow) return false;
    const { filePath, canceled } = await electron.dialog.showSaveDialog(mainWindow, {
      title: mainT("exportTitle"),
      defaultPath: "glaia-providers.json",
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (canceled || !filePath) return false;
    const catalog = registry.exportCatalog();
    await fs.promises.writeFile(filePath, JSON.stringify(catalog, null, 2), "utf8");
    log.info("catalog exported", { filePath });
    return true;
  });
  electron.ipcMain.handle(IpcChannels.ProvidersImport, async () => {
    if (!mainWindow) return null;
    const { filePaths, canceled } = await electron.dialog.showOpenDialog(mainWindow, {
      title: mainT("importTitle"),
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"]
    });
    const first = filePaths[0];
    if (canceled || !first) return null;
    try {
      const content = await fs.promises.readFile(first, "utf8");
      const parsed = JSON.parse(content);
      const result = await registry.importCatalog(parsed);
      log.info("catalog imported", { filePath: first, ...result });
      return result;
    } catch (e) {
      log.error("catalog import failed", { error: String(e) });
      throw new Error(mainT("invalidCatalog"));
    }
  });
  electron.ipcMain.handle(
    IpcChannels.ProviderViewOpen,
    async (_event, providerId) => {
      if (typeof providerId !== "string") {
        throw new Error("providerId must be a string");
      }
      const provider = registry.get(providerId);
      if (!provider || !viewManager) return false;
      log.info("open provider view", { id: providerId });
      viewManager.openProvider(provider);
      await settingsManager.update({ selectedProviderId: providerId });
      return true;
    }
  );
  electron.ipcMain.handle(IpcChannels.ProviderViewClose, async () => {
    log.info("close provider view");
    viewManager?.closeCurrentProvider();
    await settingsManager.update({ selectedProviderId: null });
    return true;
  });
  electron.ipcMain.handle(IpcChannels.ProviderViewReload, () => viewManager?.reload());
  electron.ipcMain.handle(
    IpcChannels.ProviderViewHardReload,
    () => viewManager?.hardReload()
  );
  electron.ipcMain.handle(IpcChannels.ProviderViewBack, () => viewManager?.navigateBack());
  electron.ipcMain.handle(
    IpcChannels.ProviderViewForward,
    () => viewManager?.navigateForward()
  );
  electron.ipcMain.handle(IpcChannels.ProviderViewGoHome, () => viewManager?.goHome());
  electron.ipcMain.handle(
    IpcChannels.ProviderViewOpenExternal,
    () => viewManager?.openExternal()
  );
  electron.ipcMain.handle(
    IpcChannels.ProviderViewSetBounds,
    (_event, bounds) => {
      if (!viewManager || !bounds || typeof bounds !== "object") return;
      const b = bounds;
      if (typeof b.x !== "number" || typeof b.y !== "number" || typeof b.width !== "number" || typeof b.height !== "number") {
        return;
      }
      viewManager.setHostBounds({
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height
      });
    }
  );
  electron.ipcMain.handle(
    IpcChannels.ProviderViewSetVisible,
    (_event, visible) => {
      if (!viewManager) return;
      viewManager.setVisible(Boolean(visible));
    }
  );
  electron.ipcMain.on(LOG_IPC_CHANNEL, (_event, raw) => {
    if (!raw || typeof raw !== "object") return;
    const r = raw;
    if (typeof r.level !== "string" || typeof r.scope !== "string" || typeof r.message !== "string" || typeof r.ts !== "string") {
      return;
    }
    rootLogger.ingest(r);
  });
}
function applyGlobalSecurity() {
  electron.session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    }
  );
  electron.session.defaultSession.setPermissionCheckHandler(() => false);
  electron.app.on(
    "certificate-error",
    (event, _webContents, url, error, _certificate, callback) => {
      log.error("certificate error", { url, error });
      event.preventDefault();
      callback(false);
    }
  );
  electron.app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (e) => {
      log.warn("will-attach-webview blocked");
      e.preventDefault();
    });
  });
}
process.on("uncaughtException", (err) => {
  log.error("uncaughtException", { error: String(err), stack: err.stack });
});
process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection", { reason: String(reason) });
});
electron.app.whenReady().then(async () => {
  configureFileLogging(getLogPath());
  log.info("app ready", { electron: process.versions.electron });
  createSplashWindow();
  applyGlobalSecurity();
  await registry.load();
  log.info("registry loaded", { count: registry.list().length });
  await settingsManager.load();
  log.info("settings loaded", settingsManager.get());
  registerIpcHandlers();
  await createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  log.info("all windows closed");
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
