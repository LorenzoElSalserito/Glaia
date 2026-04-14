import { app, shell, BrowserWindow, session, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { ProviderRegistry } from './registry'
import { ViewManager } from './viewManager'
import { promises as fs } from 'fs'

const registry = new ProviderRegistry()
let mainWindow: BrowserWindow | null = null
let viewManager: ViewManager | null = null

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  viewManager = new ViewManager(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // PRD: Policy Engine - Gestione navigazioni consentite
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // PRD: 2.1 Gestione catalogo
  await registry.load()

  // IPC Registry mapping
  ipcMain.handle('providers:list', () => registry.list())
  
  ipcMain.handle('providers:create', async (_event, provider) => {
    await registry.create(provider)
  })

  ipcMain.handle('providers:update', async (_event, provider) => {
    await registry.update(provider)
  })

  ipcMain.handle('providers:delete', async (_event, providerId: string) => {
    await registry.delete(providerId)
    if (viewManager) {
      // Potentially close if active, simplified for now
      viewManager.closeCurrentProvider();
    }
  })

  ipcMain.handle('provider-view:open', (_event, providerId: string) => {
    const provider = registry.list().find(p => p.id === providerId)
    if (provider && viewManager) {
      viewManager.openProvider(provider)
    }
  })

  ipcMain.handle('providers:reset-session', async (_event, providerId: string) => {
    const provider = registry.list().find(p => p.id === providerId)
    if (provider && viewManager) {
      await viewManager.resetSession(provider)
    }
  })

  ipcMain.handle('providers:export', async () => {
    if (!mainWindow) return false;
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Esporta Catalogo Provider',
      defaultPath: 'glaia-providers.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    
    if (filePath) {
      const catalog = {
        schemaVersion: "1.0",
        exportedAt: new Date().toISOString(),
        providers: registry.list()
      };
      await fs.writeFile(filePath, JSON.stringify(catalog, null, 2), 'utf-8');
      return true;
    }
    return false;
  });

  ipcMain.handle('providers:import', async () => {
    if (!mainWindow) return false;
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Importa Catalogo Provider',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (filePaths && filePaths.length > 0) {
      try {
        const content = await fs.readFile(filePaths[0], 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed.providers && Array.isArray(parsed.providers)) {
          for (const p of parsed.providers) {
            try {
              // Simple merge: if exists update, else create
              if (registry.list().some(existing => existing.id === p.id)) {
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
        console.error('Import failed', e);
        return false;
      }
    }
    return false;
  });

  // PRD RNF-01 - Sicurezza: Permission Gate baseline
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    // Default deny for everything for now
    callback(false);
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})