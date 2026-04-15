import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  AppSettings,
  ProviderManifest,
  ProviderViewState,
} from '../../shared/contracts'
import { SettingsPanel } from './SettingsPanel'
import { ProviderForm } from './ProviderForm'
import { AboutPanel } from './AboutPanel'
import { ProviderDetailsPanel } from './ProviderDetailsPanel'
import { I18nProvider, translate } from './i18n'

type Modal =
  | { kind: 'none' }
  | { kind: 'settings' }
  | { kind: 'about' }
  | { kind: 'create' }
  | { kind: 'edit'; provider: ProviderManifest }
  | { kind: 'details'; provider: ProviderManifest }

function App(): JSX.Element {
  const [providers, setProviders] = useState<ProviderManifest[]>([])
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null)
  const [viewState, setViewState] = useState<ProviderViewState | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [modal, setModal] = useState<Modal>({ kind: 'none' })
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const webviewHostRef = useRef<HTMLDivElement>(null)

  const locale = settings?.locale ?? 'it'
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale]
  )

  const reloadProviders = useCallback(async () => {
    try {
      const list = await window.glaia.providers.list()
      setProviders(list)
    } catch (err) {
      window.glaia?.log.error('failed to load providers', String(err))
    }
  }, [])

  const reloadSettings = useCallback(async () => {
    try {
      const s = await window.glaia.settings.get()
      setSettings(s)
      if (s.selectedProviderId) {
        setActiveProviderId(s.selectedProviderId)
      }
    } catch (err) {
      window.glaia?.log.error('failed to load settings', String(err))
    }
  }, [])

  useEffect(() => {
    void reloadProviders()
    void reloadSettings()
    const unsubscribe = window.glaia.providerView.onStateChanged((state) => {
      setViewState(state)
    })
    return () => unsubscribe()
  }, [reloadProviders, reloadSettings])

  // Keep main process informed of the host element's layout rect so the
  // native WebContentsView sits exactly inside .webview-host.
  useEffect(() => {
    const el = webviewHostRef.current
    if (!el) return
    let frame = 0
    const send = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        void window.glaia.providerView.setBounds({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        })
      })
    }
    send()
    const ro = new ResizeObserver(send)
    ro.observe(el)
    window.addEventListener('resize', send)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('resize', send)
    }
  }, [])

  // Hide the native WebContentsView when a modal is open or no provider is
  // active, so overlays and empty-state can render on top of Glaia's chrome.
  useEffect(() => {
    const shouldShow = activeProviderId !== null && modal.kind === 'none'
    void window.glaia.providerView.setVisible(shouldShow)
  }, [activeProviderId, modal.kind])

  // Auto-dismiss the status toast.
  useEffect(() => {
    if (!statusMessage) return
    const id = window.setTimeout(() => setStatusMessage(null), 4000)
    return () => window.clearTimeout(id)
  }, [statusMessage])

  // Apply theme + a11y attributes to <html>
  useEffect(() => {
    if (!settings) return
    const root = document.documentElement
    const resolveTheme = () => {
      if (settings.theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
      }
      return settings.theme
    }
    root.dataset.theme = resolveTheme()
    root.dataset.compact = settings.compactSidebar ? 'true' : 'false'
    root.dataset.reducedMotion = settings.reducedMotion ? 'true' : 'false'
  }, [settings])

  const handleSelect = async (provider: ProviderManifest) => {
    try {
      setActiveProviderId(provider.id)
      setViewState(null)
      await window.glaia.providerView.open(provider.id)
    } catch (err) {
      window.glaia?.log.error('failed to open provider', String(err))
    }
  }

  const handleCreate = async (provider: ProviderManifest) => {
    await window.glaia.providers.create(provider)
    await reloadProviders()
    setStatusMessage(t('status.providerCreated', { name: provider.name }))
  }

  const handleUpdate = async (provider: ProviderManifest) => {
    await window.glaia.providers.update(provider)
    await reloadProviders()
    setStatusMessage(t('status.providerUpdated', { name: provider.name }))
  }

  const handleDelete = async (provider: ProviderManifest) => {
    if (
      !settings ||
      !settings.confirmBeforeReset ||
      window.confirm(t('confirm.delete', { name: provider.name }))
    ) {
      await window.glaia.providers.delete(provider.id)
      if (activeProviderId === provider.id) setActiveProviderId(null)
      await reloadProviders()
      setStatusMessage(t('status.providerRemoved', { name: provider.name }))
      setModal({ kind: 'none' })
    }
  }

  const handleResetSession = async (provider: ProviderManifest) => {
    if (
      settings?.confirmBeforeReset === false ||
      window.confirm(t('confirm.reset', { name: provider.name }))
    ) {
      await window.glaia.providers.resetSession(provider.id)
      setStatusMessage(t('status.sessionReset', { name: provider.name }))
    }
  }

  const handleExport = async () => {
    const ok = await window.glaia.providers.export()
    if (ok) setStatusMessage(t('status.catalogExported'))
  }

  const handleImport = async () => {
    try {
      const result = await window.glaia.providers.import()
      if (result) {
        await reloadProviders()
        setStatusMessage(
          t('status.importResult', {
            imported: result.imported,
            updated: result.updated,
            skipped: result.skipped,
          })
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('status.importFailed')
      setStatusMessage(msg)
    }
  }

  const activeProvider = useMemo(
    () => providers.find((p) => p.id === activeProviderId) ?? null,
    [providers, activeProviderId]
  )

  const closeModal = () => setModal({ kind: 'none' })

  return (
    <I18nProvider locale={locale}>
      <div className="app">
      <aside className="sidebar" aria-label={t('app.providerCatalog')}>
        <div className="sidebar__header">
          <h1 className="sidebar__brand">{t('app.brand')}</h1>
          <div className="sidebar__actions">
            <button
              type="button"
              className="icon-button"
              onClick={() => setModal({ kind: 'about' })}
              aria-label={t('sidebar.aboutAria')}
              title={t('sidebar.about')}
            >
              i
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setModal({ kind: 'settings' })}
              aria-label={t('sidebar.settingsAria')}
              title={t('sidebar.settings')}
            >
              ⚙
            </button>
          </div>
        </div>

        <div className="sidebar__actions">
          <button
            type="button"
            className="btn"
            onClick={handleImport}
            aria-label={t('sidebar.importAria')}
          >
            {t('sidebar.import')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleExport}
            aria-label={t('sidebar.exportAria')}
          >
            {t('sidebar.export')}
          </button>
        </div>

        <p className="sidebar__section-label">{t('sidebar.providers')}</p>
        <nav className="sidebar__nav" aria-label={t('app.providersAvailable')}>
          {providers.length === 0 ? (
            <p className="sidebar__empty">{t('sidebar.empty')}</p>
          ) : (
            <ul className="sidebar__list">
              {providers.map((p) => (
                <li
                  key={p.id}
                  className="provider-row"
                  aria-current={p.id === activeProviderId ? 'true' : 'false'}
                >
                  <button
                    type="button"
                    className="provider-row__select"
                    onClick={() => handleSelect(p)}
                    aria-pressed={p.id === activeProviderId}
                    title={p.name}
                  >
                    {settings?.showProviderLabels === false ? p.id : p.name}
                  </button>
                  <div className="provider-row__menu">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setModal({ kind: 'details', provider: p })
                      }}
                      aria-label={t('sidebar.detailsAria', { name: p.name })}
                      title={t('sidebar.details')}
                    >
                      ⋯
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setModal({ kind: 'create' })}
        >
          {t('sidebar.add')}
        </button>
      </aside>

      <main className="main" aria-label={t('app.providerArea')}>
        {activeProvider && (
          <div
            className="toolbar"
            role="toolbar"
            aria-label={t('app.navCommands')}
          >
            <div className="toolbar__group">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!viewState?.canGoBack}
                onClick={() => window.glaia.providerView.navigateBack()}
                aria-label={t('toolbar.back')}
                title={t('toolbar.back')}
              >
                ←
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!viewState?.canGoForward}
                onClick={() => window.glaia.providerView.navigateForward()}
                aria-label={t('toolbar.forward')}
                title={t('toolbar.forward')}
              >
                →
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => window.glaia.providerView.reload()}
                aria-label={t('toolbar.reload')}
                title={t('toolbar.reload')}
              >
                ↻
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => window.glaia.providerView.goHome()}
                aria-label={t('toolbar.homeAria')}
                title={t('toolbar.home')}
              >
                ⌂
              </button>
            </div>
            <div className="toolbar__divider" aria-hidden="true" />
            <div
              className="toolbar__url"
              aria-live="polite"
              title={viewState?.currentUrl ?? activeProvider.startUrl}
            >
              {viewState?.currentUrl ?? activeProvider.startUrl}
            </div>
            <div className="toolbar__divider" aria-hidden="true" />
            <div className="toolbar__group">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => window.glaia.providerView.hardReload()}
                aria-label={t('toolbar.hardReloadAria')}
                title={t('toolbar.hardReload')}
              >
                ⟳
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => window.glaia.providerView.openExternal()}
                aria-label={t('toolbar.openExternalAria')}
                title={t('toolbar.openExternal')}
              >
                ↗
              </button>
            </div>
            <span
              className={
                viewState?.lastErrorCode
                  ? 'toolbar__status toolbar__status--error'
                  : 'toolbar__status'
              }
              aria-live="polite"
            >
              {viewState?.lastErrorCode
                ? t('toolbar.error', { code: viewState.lastErrorCode })
                : viewState?.isLoading
                  ? t('toolbar.loading')
                  : ''}
            </span>
            {viewState?.isLoading && (
              <div className="toolbar__progress" aria-hidden="true" />
            )}
          </div>
        )}
        <div
          className="webview-host"
          ref={webviewHostRef}
          aria-label={t('app.providerContent')}
        >
          {!activeProvider && (
            <div className="webview-host__placeholder">
              <div className="empty-state">
                <div className="empty-state__badge" aria-hidden="true">
                  G
                </div>
                <h2>{t('app.welcomeTitle')}</h2>
                <p>{t('app.welcomeBody')}</p>
                <div className="empty-state__cta">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => setModal({ kind: 'create' })}
                  >
                    {t('sidebar.add')}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setModal({ kind: 'about' })}
                  >
                    {t('sidebar.about')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {modal.kind === 'settings' && settings && (
        <SettingsPanel
          settings={settings}
          onClose={closeModal}
          onChange={setSettings}
        />
      )}
      {modal.kind === 'about' && <AboutPanel onClose={closeModal} />}
      {modal.kind === 'create' && (
        <ProviderForm
          onClose={closeModal}
          onSubmit={handleCreate}
        />
      )}
      {modal.kind === 'edit' && (
        <ProviderForm
          initial={modal.provider}
          onClose={closeModal}
          onSubmit={handleUpdate}
        />
      )}
      {modal.kind === 'details' && (
        <ProviderDetailsPanel
          provider={modal.provider}
          onClose={closeModal}
          onEdit={() => setModal({ kind: 'edit', provider: modal.provider })}
          onDelete={() => handleDelete(modal.provider)}
          onResetSession={() => handleResetSession(modal.provider)}
        />
      )}

      {statusMessage && (
        <div role="status" aria-live="polite" className="toast">
          {statusMessage}
        </div>
      )}
      </div>
    </I18nProvider>
  )
}

export default App
