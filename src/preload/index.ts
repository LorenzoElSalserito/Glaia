import { contextBridge, ipcRenderer } from 'electron'
import { ProviderManifest, AppSettings, ProviderViewState } from '../shared/contracts'

// Custom APIs for renderer
const api = {
  providers: {
    list: (): Promise<ProviderManifest[]> => ipcRenderer.invoke('providers:list'),
    create: (provider: ProviderManifest): Promise<void> => ipcRenderer.invoke('providers:create', provider),
    update: (provider: ProviderManifest): Promise<void> => ipcRenderer.invoke('providers:update', provider),
    delete: (providerId: string): Promise<void> => ipcRenderer.invoke('providers:delete', providerId),
    resetSession: (providerId: string): Promise<void> => ipcRenderer.invoke('providers:reset-session', providerId),
    open: (providerId: string): Promise<void> => ipcRenderer.invoke('provider-view:open', providerId),
    export: (): Promise<boolean> => ipcRenderer.invoke('providers:export'),
    import: (): Promise<boolean> => ipcRenderer.invoke('providers:import'),
  },
  providerView: {
    reload: (): Promise<void> => ipcRenderer.invoke('provider-view:reload'),
    navigateBack: (): Promise<void> => ipcRenderer.invoke('provider-view:navigate-back'),
    navigateForward: (): Promise<void> => ipcRenderer.invoke('provider-view:navigate-forward'),
    onStateChanged: (callback: (state: ProviderViewState) => void) => {
      const handler = (_event: any, state: ProviderViewState) => callback(state);
      ipcRenderer.on('provider-view:state-changed', handler);
      return () => {
        ipcRenderer.removeListener('provider-view:state-changed', handler);
      };
    }
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:update', patch)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('glaia', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.glaia = api
}