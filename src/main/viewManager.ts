import {
  BrowserWindow,
  WebContentsView,
  session,
  shell,
  type Session,
} from 'electron'
import type {
  ProviderManifest,
  ProviderViewBounds,
  ProviderViewState,
} from '../shared/contracts'
import { IpcChannels } from '../shared/contracts'
import type { SettingsManager } from './settings'

const TOOLBAR_HEIGHT = 52
const FALLBACK_SIDEBAR_WIDTH = 280
const COMPACT_SIDEBAR_WIDTH = 208
const HIDDEN_BOUNDS = { x: 0, y: 0, width: 0, height: 0 }

export class ViewManager {
  private currentView: WebContentsView | null = null
  private currentProvider: ProviderManifest | null = null
  private hostBounds: ProviderViewBounds | null = null
  private visible = true
  private readonly mainWindow: BrowserWindow
  private readonly settingsManager: SettingsManager

  constructor(mainWindow: BrowserWindow, settingsManager: SettingsManager) {
    this.mainWindow = mainWindow
    this.settingsManager = settingsManager
    this.mainWindow.on('resize', () => this.applyBounds())
    this.mainWindow.on('closed', () => {
      this.currentView = null
      this.currentProvider = null
      this.hostBounds = null
    })
  }

  public openProvider(provider: ProviderManifest): void {
    if (
      this.currentProvider &&
      this.currentProvider.id === provider.id &&
      this.currentView
    ) {
      this.broadcastState()
      return
    }

    this.detachCurrentView()

    this.currentProvider = provider

    const partitionSession = session.fromPartition(provider.partition)
    this.applySessionPolicies(partitionSession, provider)

    const view = new WebContentsView({
      webPreferences: {
        session: partitionSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: true,
      },
    })

    this.attachWebContentsListeners(view, provider)

    if (provider.userAgentMode === 'custom' && provider.customUserAgent) {
      view.webContents.setUserAgent(provider.customUserAgent)
    }

    this.currentView = view
    this.mainWindow.contentView.addChildView(view)
    this.applyBounds()

    void view.webContents.loadURL(provider.startUrl)
  }

  public setHostBounds(bounds: ProviderViewBounds): void {
    this.hostBounds = {
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height)),
    }
    this.applyBounds()
  }

  public setVisible(visible: boolean): void {
    if (this.visible === visible) return
    this.visible = visible
    this.applyBounds()
  }

  public closeCurrentProvider(): void {
    this.detachCurrentView()
    this.currentProvider = null
    this.broadcastState()
  }

  public reload(): void {
    if (!this.currentView) return
    this.currentView.webContents.reload()
  }

  public hardReload(): void {
    if (!this.currentView) return
    this.currentView.webContents.reloadIgnoringCache()
  }

  public navigateBack(): void {
    if (!this.currentView) return
    const wc = this.currentView.webContents
    if (wc.canGoBack()) wc.goBack()
  }

  public navigateForward(): void {
    if (!this.currentView) return
    const wc = this.currentView.webContents
    if (wc.canGoForward()) wc.goForward()
  }

  public goHome(): void {
    if (!this.currentView || !this.currentProvider) return
    const target = this.currentProvider.homeUrl ?? this.currentProvider.startUrl
    void this.currentView.webContents.loadURL(target)
  }

  public openExternal(): void {
    if (!this.currentView) return
    const url = this.currentView.webContents.getURL()
    if (url && url.startsWith('https://')) {
      void shell.openExternal(url)
    }
  }

  public async resetSession(provider: ProviderManifest): Promise<void> {
    const isActive =
      this.currentProvider !== null && this.currentProvider.id === provider.id
    if (isActive) {
      this.detachCurrentView()
    }

    const partitionSession = session.fromPartition(provider.partition)
    await partitionSession.clearStorageData({
      storages: [
        'cookies',
        'filesystem',
        'indexdb',
        'localstorage',
        'shadercache',
        'serviceworkers',
        'cachestorage',
      ],
    })
    await partitionSession.clearCache()
    await partitionSession.clearAuthCache()

    if (isActive) {
      this.openProvider(provider)
    }
  }

  public getCurrentState(): ProviderViewState | null {
    if (!this.currentView || !this.currentProvider) return null
    return this.computeState()
  }

  private detachCurrentView(): void {
    if (!this.currentView) return
    try {
      this.mainWindow.contentView.removeChildView(this.currentView)
    } catch {
      // already removed
    }
    try {
      this.currentView.webContents.removeAllListeners()
      if (!this.currentView.webContents.isDestroyed()) {
        this.currentView.webContents.close()
      }
    } catch {
      // best effort
    }
    this.currentView = null
  }

  private attachWebContentsListeners(
    view: WebContentsView,
    provider: ProviderManifest
  ): void {
    const wc = view.webContents

    wc.setWindowOpenHandler((details) => {
      const url = details.url
      const isExternalAllowed = this.matchesExternal(url, provider)
      if (isExternalAllowed || !provider.allowPopups) {
        if (url.startsWith('https://')) {
          void shell.openExternal(url)
        }
        return { action: 'deny' }
      }
      return { action: 'deny' }
    })

    wc.on('will-navigate', (event, url) => {
      try {
        const parsed = new URL(url)
        if (this.matchesExternal(url, provider)) {
          event.preventDefault()
          if (url.startsWith('https://')) void shell.openExternal(url)
          return
        }
        if (provider.allowedHosts && provider.allowedHosts.length > 0) {
          const allowed = provider.allowedHosts.some(
            (host) =>
              parsed.hostname === host || parsed.hostname.endsWith('.' + host)
          )
          if (!allowed) {
            event.preventDefault()
          }
        }
      } catch {
        event.preventDefault()
      }
    })

    wc.on('did-start-loading', () => this.broadcastState())
    wc.on('did-stop-loading', () => this.broadcastState())
    wc.on('did-navigate', () => this.broadcastState())
    wc.on('did-navigate-in-page', () => this.broadcastState())
    wc.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
      if (!isMainFrame) return
      this.broadcastState(String(errorCode), errorDescription)
    })
  }

  private applySessionPolicies(s: Session, provider: ProviderManifest): void {
    s.setPermissionRequestHandler((_webContents, permission, callback) => {
      const granted = this.evaluatePermission(permission, provider)
      callback(granted)
    })
    s.setPermissionCheckHandler((_webContents, permission) => {
      return this.evaluatePermission(permission, provider)
    })
  }

  private evaluatePermission(permission: string, provider: ProviderManifest): boolean {
    switch (permission) {
      case 'clipboard-read':
        return provider.allowClipboardRead
      case 'clipboard-write':
      case 'clipboard-sanitized-write':
        return provider.allowClipboardWrite
      case 'notifications':
        return provider.allowNotifications
      default:
        return false
    }
  }

  private matchesExternal(url: string, provider: ProviderManifest): boolean {
    if (!provider.externalUrlPatterns || provider.externalUrlPatterns.length === 0) {
      return false
    }
    return provider.externalUrlPatterns.some((pattern) =>
      url.startsWith(pattern.replace('*', ''))
    )
  }

  private applyBounds(): void {
    if (!this.currentView) return
    if (!this.visible) {
      this.currentView.setBounds(HIDDEN_BOUNDS)
      return
    }
    if (this.hostBounds) {
      this.currentView.setBounds(this.hostBounds)
      return
    }
    // Fallback until the renderer reports the host bounds after mount.
    const bounds = this.mainWindow.getContentBounds()
    const settings = this.settingsManager.get()
    const sidebarWidth = settings.compactSidebar
      ? COMPACT_SIDEBAR_WIDTH
      : FALLBACK_SIDEBAR_WIDTH
    this.currentView.setBounds({
      x: sidebarWidth,
      y: TOOLBAR_HEIGHT,
      width: Math.max(0, bounds.width - sidebarWidth),
      height: Math.max(0, bounds.height - TOOLBAR_HEIGHT),
    })
  }

  private computeState(): ProviderViewState {
    const wc = this.currentView!.webContents
    const provider = this.currentProvider!
    return {
      providerId: provider.id,
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
      isLoading: wc.isLoading(),
      currentUrl: wc.getURL() || null,
      lastErrorCode: null,
      lastErrorMessage: null,
    }
  }

  private broadcastState(errorCode?: string, errorMessage?: string): void {
    if (!this.currentView || !this.currentProvider) {
      this.mainWindow.webContents.send(IpcChannels.ProviderViewState, null)
      return
    }
    const state = this.computeState()
    if (errorCode) state.lastErrorCode = errorCode
    if (errorMessage) state.lastErrorMessage = errorMessage
    this.mainWindow.webContents.send(IpcChannels.ProviderViewState, state)
  }

  public refreshLayout(): void {
    this.applyBounds()
  }
}
