import type {
  AppSettings,
  ProviderManifest,
  ProviderViewBounds,
  ProviderViewState,
} from '../shared/contracts'

export interface ImportResult {
  imported: number
  updated: number
  skipped: number
}

export interface GlaiaApi {
  app: {
    getVersion: () => Promise<string>
    reportBug: () => Promise<boolean>
  }
  providers: {
    list: () => Promise<ProviderManifest[]>
    create: (provider: ProviderManifest) => Promise<ProviderManifest>
    update: (provider: ProviderManifest) => Promise<ProviderManifest>
    delete: (providerId: string) => Promise<boolean>
    resetSession: (providerId: string) => Promise<boolean>
    export: () => Promise<boolean>
    import: () => Promise<ImportResult | null>
  }
  providerView: {
    open: (providerId: string) => Promise<boolean>
    close: () => Promise<boolean>
    reload: () => Promise<void>
    hardReload: () => Promise<void>
    navigateBack: () => Promise<void>
    navigateForward: () => Promise<void>
    goHome: () => Promise<void>
    openExternal: () => Promise<void>
    setBounds: (bounds: ProviderViewBounds) => Promise<void>
    setVisible: (visible: boolean) => Promise<void>
    onStateChanged: (
      callback: (state: ProviderViewState | null) => void
    ) => () => void
  }
  settings: {
    get: () => Promise<AppSettings>
    update: (patch: Partial<AppSettings>) => Promise<AppSettings>
  }
  log: {
    debug: (message: string, data?: unknown) => void
    info: (message: string, data?: unknown) => void
    warn: (message: string, data?: unknown) => void
    error: (message: string, data?: unknown) => void
  }
}

declare global {
  interface Window {
    glaia: GlaiaApi
  }
}
