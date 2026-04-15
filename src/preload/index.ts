import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '../shared/contracts/ipc'
import { LOG_IPC_CHANNEL, nowIso, type LogLevel, type LogRecord } from '../shared/logger'
import type { GlaiaApi, ImportResult } from './index.d'
import type {
  AppSettings,
  ProviderManifest,
  ProviderViewBounds,
  ProviderViewState,
} from '../shared/contracts/index'

function forwardLog(level: LogLevel, message: string, data?: unknown): void {
  const record: LogRecord = {
    level,
    scope: 'renderer',
    message,
    ts: nowIso(),
  }
  if (data !== undefined) record.data = data
  try {
    ipcRenderer.send(LOG_IPC_CHANNEL, record)
  } catch {
    // best effort
  }
}

const api: GlaiaApi = {
  app: {
    getVersion: (): Promise<string> =>
      ipcRenderer.invoke(IpcChannels.AppGetVersion),
    reportBug: (): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.AppReportBug),
  },
  providers: {
    list: (): Promise<ProviderManifest[]> =>
      ipcRenderer.invoke(IpcChannels.ProvidersList),
    create: (provider: ProviderManifest): Promise<ProviderManifest> =>
      ipcRenderer.invoke(IpcChannels.ProvidersCreate, provider),
    update: (provider: ProviderManifest): Promise<ProviderManifest> =>
      ipcRenderer.invoke(IpcChannels.ProvidersUpdate, provider),
    delete: (providerId: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.ProvidersDelete, providerId),
    resetSession: (providerId: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.ProvidersResetSession, providerId),
    export: (): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.ProvidersExport),
    import: (): Promise<ImportResult | null> =>
      ipcRenderer.invoke(IpcChannels.ProvidersImport),
  },
  providerView: {
    open: (providerId: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.ProviderViewOpen, providerId),
    close: (): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.ProviderViewClose),
    reload: (): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.ProviderViewReload),
    hardReload: (): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.ProviderViewHardReload),
    navigateBack: (): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.ProviderViewBack),
    navigateForward: (): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.ProviderViewForward),
    goHome: (): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.ProviderViewGoHome),
    openExternal: (): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.ProviderViewOpenExternal),
    setBounds: (bounds: ProviderViewBounds): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.ProviderViewSetBounds, bounds),
    setVisible: (visible: boolean): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.ProviderViewSetVisible, visible),
    onStateChanged: (
      callback: (state: ProviderViewState | null) => void
    ): (() => void) => {
      const handler = (_event: unknown, state: ProviderViewState | null) =>
        callback(state)
      ipcRenderer.on(IpcChannels.ProviderViewState, handler)
      return () => {
        ipcRenderer.removeListener(IpcChannels.ProviderViewState, handler)
      }
    },
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IpcChannels.SettingsGet),
    update: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IpcChannels.SettingsUpdate, patch),
  },
  log: {
    debug: (message: string, data?: unknown) => forwardLog('debug', message, data),
    info: (message: string, data?: unknown) => forwardLog('info', message, data),
    warn: (message: string, data?: unknown) => forwardLog('warn', message, data),
    error: (message: string, data?: unknown) => forwardLog('error', message, data),
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('glaia', api)
    forwardLog('info', 'preload bridge exposed')
  } catch (error) {
    forwardLog('error', 'failed to expose preload bridge', String(error))
  }
} else {
  ;(globalThis as unknown as { glaia: GlaiaApi }).glaia = api
}
