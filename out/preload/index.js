"use strict";
const electron = require("electron");
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
const LOG_IPC_CHANNEL = "glaia:log";
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function forwardLog(level, message, data) {
  const record = {
    level,
    scope: "renderer",
    message,
    ts: nowIso()
  };
  if (data !== void 0) record.data = data;
  try {
    electron.ipcRenderer.send(LOG_IPC_CHANNEL, record);
  } catch {
  }
}
const api = {
  app: {
    getVersion: () => electron.ipcRenderer.invoke(IpcChannels.AppGetVersion),
    reportBug: () => electron.ipcRenderer.invoke(IpcChannels.AppReportBug)
  },
  providers: {
    list: () => electron.ipcRenderer.invoke(IpcChannels.ProvidersList),
    create: (provider) => electron.ipcRenderer.invoke(IpcChannels.ProvidersCreate, provider),
    update: (provider) => electron.ipcRenderer.invoke(IpcChannels.ProvidersUpdate, provider),
    delete: (providerId) => electron.ipcRenderer.invoke(IpcChannels.ProvidersDelete, providerId),
    resetSession: (providerId) => electron.ipcRenderer.invoke(IpcChannels.ProvidersResetSession, providerId),
    export: () => electron.ipcRenderer.invoke(IpcChannels.ProvidersExport),
    import: () => electron.ipcRenderer.invoke(IpcChannels.ProvidersImport)
  },
  providerView: {
    open: (providerId) => electron.ipcRenderer.invoke(IpcChannels.ProviderViewOpen, providerId),
    close: () => electron.ipcRenderer.invoke(IpcChannels.ProviderViewClose),
    reload: () => electron.ipcRenderer.invoke(IpcChannels.ProviderViewReload),
    hardReload: () => electron.ipcRenderer.invoke(IpcChannels.ProviderViewHardReload),
    navigateBack: () => electron.ipcRenderer.invoke(IpcChannels.ProviderViewBack),
    navigateForward: () => electron.ipcRenderer.invoke(IpcChannels.ProviderViewForward),
    goHome: () => electron.ipcRenderer.invoke(IpcChannels.ProviderViewGoHome),
    openExternal: () => electron.ipcRenderer.invoke(IpcChannels.ProviderViewOpenExternal),
    setBounds: (bounds) => electron.ipcRenderer.invoke(IpcChannels.ProviderViewSetBounds, bounds),
    setVisible: (visible) => electron.ipcRenderer.invoke(IpcChannels.ProviderViewSetVisible, visible),
    onStateChanged: (callback) => {
      const handler = (_event, state) => callback(state);
      electron.ipcRenderer.on(IpcChannels.ProviderViewState, handler);
      return () => {
        electron.ipcRenderer.removeListener(IpcChannels.ProviderViewState, handler);
      };
    }
  },
  settings: {
    get: () => electron.ipcRenderer.invoke(IpcChannels.SettingsGet),
    update: (patch) => electron.ipcRenderer.invoke(IpcChannels.SettingsUpdate, patch)
  },
  log: {
    debug: (message, data) => forwardLog("debug", message, data),
    info: (message, data) => forwardLog("info", message, data),
    warn: (message, data) => forwardLog("warn", message, data),
    error: (message, data) => forwardLog("error", message, data)
  }
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("glaia", api);
    forwardLog("info", "preload bridge exposed");
  } catch (error) {
    forwardLog("error", "failed to expose preload bridge", String(error));
  }
} else {
  globalThis.glaia = api;
}
