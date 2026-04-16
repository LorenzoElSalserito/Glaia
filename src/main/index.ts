import {
  app,
  shell,
  BrowserWindow,
  session,
  ipcMain,
  dialog,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron'
import { join } from 'path'
import { promises as fs, readFileSync } from 'fs'
import packageJson from '../../package.json'
import { ProviderRegistry } from './registry'
import { ViewManager } from './viewManager'
import { SettingsManager } from './settings'
import { getLogPath } from './appPaths'
import {
  configureFileLogging,
  createLogger,
  getLogFilePath,
  readLogSnapshot,
  rootLogger,
} from './logger'
import {
  AppSettingsSchema,
  IpcChannels,
  ProviderManifestSchema,
  type AppSettings,
} from '../shared/contracts'
import { LOG_IPC_CHANNEL, type LogRecord, type LogLevel } from '../shared/logger'

const log = rootLogger.child('main')
const registry = new ProviderRegistry()
const settingsManager = new SettingsManager()
let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let viewManager: ViewManager | null = null

const isDev = !app.isPackaged
const appVersion = packageJson.version

type Locale = AppSettings['locale']

const mainMessages: Record<Locale, Record<string, string>> = {
  it: {
    exportTitle: 'Esporta catalogo provider',
    importTitle: 'Importa catalogo provider',
    invalidCatalog: 'File catalogo non valido',
    bugMailBody:
      'Descrivi qui il problema riscontrato, i passaggi per riprodurlo e cosa ti aspettavi succedesse.',
    bugMailLogUnavailable: 'Log non disponibile.',
  },
  en: {
    exportTitle: 'Export provider catalog',
    importTitle: 'Import provider catalog',
    invalidCatalog: 'Invalid catalog file',
    bugMailBody:
      'Describe the issue, the steps to reproduce it, and what you expected to happen.',
    bugMailLogUnavailable: 'Log unavailable.',
  },
}

function mainT(key: keyof (typeof mainMessages)['it']): string {
  const locale = settingsManager.get().locale
  return mainMessages[locale]?.[key] ?? mainMessages.it[key]!
}

function getWindowIcon(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'assets', 'icon.png')
  }
  return join(__dirname, '../../build/icon.png')
}

function getSplashIconDataUrl(): string {
  const iconBuffer = readFileSync(getWindowIcon())
  return `data:image/png;base64,${iconBuffer.toString('base64')}`
}

function createSplashWindow(): void {
  const splash = new BrowserWindow({
    width: 420,
    height: 260,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    backgroundColor: '#0c0d10',
    icon: getWindowIcon(),
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  splashWindow = splash
  splash.on('closed', () => {
    if (splashWindow === splash) splashWindow = null
  })

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
html,body{margin:0;width:100%;height:100%;background:#0c0d10;color:#f4f4f5;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
body{display:grid;place-items:center}
.splash{display:flex;flex-direction:column;align-items:center;gap:18px}
.mark{width:76px;height:76px;border-radius:18px;display:block;object-fit:cover;box-shadow:0 18px 48px rgba(37,99,235,.32)}
.title{font-size:28px;font-weight:750}
.bar{width:180px;height:4px;border-radius:999px;background:#26272e;overflow:hidden}
.bar::before{content:"";display:block;width:40%;height:100%;background:#60a5fa;border-radius:inherit;animation:load 1.1s ease-in-out infinite}
@keyframes load{0%{transform:translateX(-100%)}100%{transform:translateX(280%)}}
</style>
</head>
<body><main class="splash" aria-label="Glaia"><img class="mark" src="${getSplashIconDataUrl()}" alt="Glaia icon" /><div class="title">Glaia</div><div class="bar"></div></main></body>
</html>`

  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    .then(() => {
      if (!splash.isDestroyed()) splash.show()
    })
    .catch((err) => log.warn('splash load failed', { error: String(err) }))
}

function closeSplashWindow(): void {
  if (!splashWindow || splashWindow.isDestroyed()) return
  splashWindow.close()
  splashWindow = null
}

function buildBugReportMailto(): string {
  const logPath = getLogFilePath()
  const logText = readLogSnapshot()
  const logSection = logText || mainT('bugMailLogUnavailable')
  const body = [
    mainT('bugMailBody'),
    '',
    '---',
    `Glaia version: ${appVersion}`,
    `Platform: ${process.platform} ${process.arch}`,
    `Electron: ${process.versions.electron}`,
    logPath ? `Log file: ${logPath}` : 'Log file: unavailable',
    '---',
    '',
    logSection,
  ].join('\n')
  const params = new URLSearchParams({
    subject: '[GLAIA BUG]',
    body,
  })
  return `mailto:commercial.lorenzodm@gmail.com?${params.toString()}`
}

function attachWebContentsLogging(wc: WebContents, scope: string): void {
  const wcLog = createLogger(scope)

  wc.on('console-message', (_event, level, message, line, sourceId) => {
    const mapping: Record<number, LogLevel> = {
      0: 'debug',
      1: 'info',
      2: 'warn',
      3: 'error',
    }
    const lvl: LogLevel = mapping[level] ?? 'info'
    wcLog[lvl](`console: ${message}`, { line, source: sourceId })
  })

  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return
    wcLog.error(`load failed (${errorCode})`, { errorDescription, url: validatedURL })
  })

  wc.on('render-process-gone', (_event, details) => {
    wcLog.error('render process gone', details)
  })

  wc.on('unresponsive', () => wcLog.warn('renderer unresponsive'))
  wc.on('responsive', () => wcLog.info('renderer responsive again'))
  wc.on('preload-error', (_event, preloadPath, error) => {
    wcLog.error('preload error', { preloadPath, error: String(error) })
  })
  wc.on('did-finish-load', () => wcLog.debug('did-finish-load'))
}

async function createWindow(): Promise<void> {
  log.info('creating main window', {
    dev: isDev,
    rendererUrl: process.env['ELECTRON_RENDERER_URL'] ?? '(file)',
  })

  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e1e',
    icon: getWindowIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  })

  mainWindow = window
  viewManager = new ViewManager(window, settingsManager)

  attachWebContentsLogging(window.webContents, 'shell')

  window.on('closed', () => {
    log.info('main window closed')
    if (mainWindow === window) {
      mainWindow = null
      viewManager = null
    }
  })

  window.webContents.setWindowOpenHandler((details) => {
    log.info('shell window-open denied', { url: details.url })
    if (details.url.startsWith('https://')) {
      void shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const allowedDev = process.env['ELECTRON_RENDERER_URL']
    if (allowedDev && url.startsWith(allowedDev)) return
    if (url.startsWith('file://')) return
    log.warn('shell navigation blocked', { url })
    event.preventDefault()
  })

  window.on('ready-to-show', () => {
    log.info('shell ready-to-show')
    window.show()
    closeSplashWindow()
    if (isDev) {
      window.webContents.openDevTools({ mode: 'detach' })
    }
    const settings = settingsManager.get()
    if (settings.selectedProviderId) {
      const provider = registry.get(settings.selectedProviderId)
      if (provider && viewManager) {
        log.info('restoring last selected provider', { id: provider.id })
        viewManager.openProvider(provider)
      }
    }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    log.info('loading dev renderer', { url: process.env['ELECTRON_RENDERER_URL'] })
    await window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const file = join(__dirname, '../renderer/index.html')
    log.info('loading file renderer', { file })
    await window.loadFile(file)
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.AppGetVersion, () => appVersion)
  ipcMain.handle(IpcChannels.AppReportBug, async () => {
    const mailto = buildBugReportMailto()
    log.info('opening bug report mail')
    await shell.openExternal(mailto)
    return true
  })

  ipcMain.handle(IpcChannels.SettingsGet, () => settingsManager.get())
  ipcMain.handle(
    IpcChannels.SettingsUpdate,
    async (_event: IpcMainInvokeEvent, patch: unknown) => {
      const partial = AppSettingsSchema.partial().parse(patch ?? {})
      const updated = await settingsManager.update(partial as Partial<AppSettings>)
      if (
        viewManager &&
        mainWindow &&
        Object.prototype.hasOwnProperty.call(partial, 'compactSidebar')
      ) {
        viewManager.refreshLayout()
      }
      log.debug('settings updated', partial)
      return updated
    }
  )

  ipcMain.handle(IpcChannels.ProvidersList, () => registry.list())

  ipcMain.handle(
    IpcChannels.ProvidersCreate,
    async (_event, provider: unknown) => {
      const created = await registry.create(provider)
      log.info('provider created', { id: created.id })
      return created
    }
  )

  ipcMain.handle(
    IpcChannels.ProvidersUpdate,
    async (_event, provider: unknown) => {
      const updated = await registry.update(provider)
      log.info('provider updated', { id: updated.id })
      return updated
    }
  )

  ipcMain.handle(
    IpcChannels.ProvidersDelete,
    async (_event, providerId: unknown) => {
      if (typeof providerId !== 'string') {
        throw new Error('providerId must be a string')
      }
      const removed = await registry.delete(providerId)
      const settings = settingsManager.get()
      if (removed && settings.selectedProviderId === providerId) {
        await settingsManager.update({ selectedProviderId: null })
        viewManager?.closeCurrentProvider()
      }
      log.info('provider delete', { id: providerId, removed })
      return removed
    }
  )

  ipcMain.handle(
    IpcChannels.ProvidersResetSession,
    async (_event, providerId: unknown) => {
      if (typeof providerId !== 'string') {
        throw new Error('providerId must be a string')
      }
      const provider = registry.get(providerId)
      if (!provider || !viewManager) return false
      log.info('reset session', { id: providerId })
      await viewManager.resetSession(provider)
      return true
    }
  )

  ipcMain.handle(IpcChannels.ProvidersExport, async () => {
    if (!mainWindow) return false
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: mainT('exportTitle'),
      defaultPath: 'glaia-providers.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) return false
    const catalog = registry.exportCatalog()
    await fs.writeFile(filePath, JSON.stringify(catalog, null, 2), 'utf8')
    log.info('catalog exported', { filePath })
    return true
  })

  ipcMain.handle(IpcChannels.ProvidersImport, async () => {
    if (!mainWindow) return null
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: mainT('importTitle'),
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    const first = filePaths[0]
    if (canceled || !first) return null
    try {
      const content = await fs.readFile(first, 'utf8')
      const parsed = JSON.parse(content)
      const result = await registry.importCatalog(parsed)
      log.info('catalog imported', { filePath: first, ...result })
      return result
    } catch (e) {
      log.error('catalog import failed', { error: String(e) })
      throw new Error(mainT('invalidCatalog'))
    }
  })

  ipcMain.handle(
    IpcChannels.ProviderViewOpen,
    async (_event, providerId: unknown) => {
      if (typeof providerId !== 'string') {
        throw new Error('providerId must be a string')
      }
      const provider = registry.get(providerId)
      if (!provider || !viewManager) return false
      log.info('open provider view', { id: providerId })
      viewManager.openProvider(provider)
      await settingsManager.update({ selectedProviderId: providerId })
      return true
    }
  )

  ipcMain.handle(IpcChannels.ProviderViewClose, async () => {
    log.info('close provider view')
    viewManager?.closeCurrentProvider()
    await settingsManager.update({ selectedProviderId: null })
    return true
  })

  ipcMain.handle(IpcChannels.ProviderViewReload, () => viewManager?.reload())
  ipcMain.handle(IpcChannels.ProviderViewHardReload, () =>
    viewManager?.hardReload()
  )
  ipcMain.handle(IpcChannels.ProviderViewBack, () => viewManager?.navigateBack())
  ipcMain.handle(IpcChannels.ProviderViewForward, () =>
    viewManager?.navigateForward()
  )
  ipcMain.handle(IpcChannels.ProviderViewGoHome, () => viewManager?.goHome())
  ipcMain.handle(IpcChannels.ProviderViewOpenExternal, () =>
    viewManager?.openExternal()
  )

  ipcMain.handle(
    IpcChannels.ProviderViewSetBounds,
    (_event, bounds: unknown) => {
      if (!viewManager || !bounds || typeof bounds !== 'object') return
      const b = bounds as Record<string, unknown>
      if (
        typeof b.x !== 'number' ||
        typeof b.y !== 'number' ||
        typeof b.width !== 'number' ||
        typeof b.height !== 'number'
      ) {
        return
      }
      viewManager.setHostBounds({
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
      })
    }
  )

  ipcMain.handle(
    IpcChannels.ProviderViewSetVisible,
    (_event, visible: unknown) => {
      if (!viewManager) return
      viewManager.setVisible(Boolean(visible))
    }
  )

  // Renderer/preload log forwarding
  ipcMain.on(LOG_IPC_CHANNEL, (_event, raw: unknown) => {
    if (!raw || typeof raw !== 'object') return
    const r = raw as Partial<LogRecord>
    if (
      typeof r.level !== 'string' ||
      typeof r.scope !== 'string' ||
      typeof r.message !== 'string' ||
      typeof r.ts !== 'string'
    ) {
      return
    }
    rootLogger.ingest(r as LogRecord)
  })
}

function applyGlobalSecurity(): void {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false)
    }
  )
  session.defaultSession.setPermissionCheckHandler(() => false)

  app.on(
    'certificate-error',
    (event, _webContents, url, error, _certificate, callback) => {
      log.error('certificate error', { url, error })
      event.preventDefault()
      callback(false)
    }
  )

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (e) => {
      log.warn('will-attach-webview blocked')
      e.preventDefault()
    })
  })
}

process.on('uncaughtException', (err) => {
  log.error('uncaughtException', { error: String(err), stack: err.stack })
})
process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', { reason: String(reason) })
})

app.whenReady().then(async () => {
  configureFileLogging(getLogPath())
  log.info('app ready', { electron: process.versions.electron })
  createSplashWindow()
  applyGlobalSecurity()
  await registry.load()
  log.info('registry loaded', { count: registry.list().length })
  await settingsManager.load()
  log.info('settings loaded', settingsManager.get())
  registerIpcHandlers()

  void ProviderManifestSchema

  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  log.info('all windows closed')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
