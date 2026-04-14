"use strict";
const electron = require("electron");
const api = {
  providers: {
    list: () => electron.ipcRenderer.invoke("providers:list"),
    create: (provider) => electron.ipcRenderer.invoke("providers:create", provider),
    update: (provider) => electron.ipcRenderer.invoke("providers:update", provider),
    delete: (providerId) => electron.ipcRenderer.invoke("providers:delete", providerId),
    resetSession: (providerId) => electron.ipcRenderer.invoke("providers:reset-session", providerId),
    open: (providerId) => electron.ipcRenderer.invoke("provider-view:open", providerId),
    export: () => electron.ipcRenderer.invoke("providers:export"),
    import: () => electron.ipcRenderer.invoke("providers:import")
  },
  providerView: {
    reload: () => electron.ipcRenderer.invoke("provider-view:reload"),
    navigateBack: () => electron.ipcRenderer.invoke("provider-view:navigate-back"),
    navigateForward: () => electron.ipcRenderer.invoke("provider-view:navigate-forward"),
    onStateChanged: (callback) => {
      const handler = (_event, state) => callback(state);
      electron.ipcRenderer.on("provider-view:state-changed", handler);
      return () => {
        electron.ipcRenderer.removeListener("provider-view:state-changed", handler);
      };
    }
  },
  settings: {
    get: () => electron.ipcRenderer.invoke("settings:get"),
    update: (patch) => electron.ipcRenderer.invoke("settings:update", patch)
  }
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("glaia", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.glaia = api;
}
