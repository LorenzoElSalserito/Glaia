import { WebContentsView, BrowserWindow, session, ipcMain } from 'electron';
import { ProviderManifest, ProviderViewState } from '../shared/contracts';

export class ViewManager {
  private currentView: WebContentsView | null = null;
  private currentProvider: ProviderManifest | null = null;

  constructor(private readonly mainWindow: BrowserWindow) {
    this.mainWindow.on('resize', () => this.resizeView());
    this.setupIpc();
  }

  private setupIpc() {
    ipcMain.handle('provider-view:reload', () => {
      if (this.currentView) {
        this.currentView.webContents.reload();
      }
    });

    ipcMain.handle('provider-view:navigate-back', () => {
      if (this.currentView && this.currentView.webContents.canGoBack()) {
        this.currentView.webContents.goBack();
      }
    });

    ipcMain.handle('provider-view:navigate-forward', () => {
      if (this.currentView && this.currentView.webContents.canGoForward()) {
        this.currentView.webContents.goForward();
      }
    });
  }

  public openProvider(provider: ProviderManifest): void {
    if (this.currentView) {
      this.mainWindow.contentView.removeChild(this.currentView);
    }

    this.currentProvider = provider;

    // PRD 4.1.1 - Partition per provider
    const partitionSession = session.fromPartition(provider.partition);

    // PRD 5.1.2 - Permission policy locale per sessione
    partitionSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'clipboard-sanitized-write' && provider.allowClipboardWrite) {
        return callback(true);
      }
      if (permission === 'clipboard-read' && provider.allowClipboardRead) {
        return callback(true);
      }
      if (permission === 'notifications' && provider.allowNotifications) {
        return callback(true);
      }
      
      console.log(`Permission ${permission} denied for provider ${provider.id}`);
      callback(false);
    });

    this.currentView = new WebContentsView({
      webPreferences: {
        session: partitionSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    // PRD 5.1.1 - Policy popup e navigazioni
    this.currentView.webContents.setWindowOpenHandler((details) => {
      if (provider.allowPopups) {
        return { action: 'allow' };
      }
      
      // Apertura link esterni intercettati (fallback)
      import('electron').then(({ shell }) => shell.openExternal(details.url));
      return { action: 'deny' };
    });

    this.currentView.webContents.on('did-start-loading', () => this.broadcastState());
    this.currentView.webContents.on('did-stop-loading', () => this.broadcastState());
    this.currentView.webContents.on('did-navigate', () => this.broadcastState());
    this.currentView.webContents.on('did-navigate-in-page', () => this.broadcastState());
    this.currentView.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
      this.broadcastState(errorCode.toString(), errorDescription);
    });

    if (provider.userAgentMode === 'custom' && provider.customUserAgent) {
      this.currentView.webContents.setUserAgent(provider.customUserAgent);
    }

    this.mainWindow.contentView.addChild(this.currentView);
    this.resizeView();

    this.currentView.webContents.loadURL(provider.startUrl);
  }
  
  public closeCurrentProvider(): void {
    if (this.currentView) {
      this.mainWindow.contentView.removeChild(this.currentView);
      this.currentView = null;
      this.currentProvider = null;
    }
  }

  private resizeView(): void {
    if (!this.currentView || !this.mainWindow) return;
    const bounds = this.mainWindow.getContentBounds();
    // Assuming sidebar is 260px wide
    // Also leaving space for top toolbar (e.g. 48px)
    this.currentView.setBounds({ 
      x: 260, 
      y: 48, 
      width: bounds.width - 260, 
      height: bounds.height - 48 
    });
  }

  private broadcastState(errorCode?: string, errorMessage?: string): void {
    if (!this.currentView || !this.currentProvider) return;
    
    const state: ProviderViewState = {
      providerId: this.currentProvider.id,
      canGoBack: this.currentView.webContents.canGoBack(),
      canGoForward: this.currentView.webContents.canGoForward(),
      isLoading: this.currentView.webContents.isLoading(),
      currentUrl: this.currentView.webContents.getURL(),
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage
    };

    this.mainWindow.webContents.send('provider-view:state-changed', state);
  }

  public async resetSession(provider: ProviderManifest): Promise<void> {
    const partitionSession = session.fromPartition(provider.partition);
    await partitionSession.clearStorageData();
    await partitionSession.clearCache();
  }
}