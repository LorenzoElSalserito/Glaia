import React, { useEffect, useId, useState } from 'react'
import type { AppSettings } from '../../shared/contracts'
import { useT } from './i18n'

interface SettingsPanelProps {
  settings: AppSettings
  onClose: () => void
  onChange: (next: AppSettings) => void
}

export function SettingsPanel({
  settings,
  onClose,
  onChange,
}: SettingsPanelProps): JSX.Element {
  const titleId = useId()
  const t = useT()
  const [local, setLocal] = useState<AppSettings>(settings)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setLocal(settings), [settings])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const apply = async (patch: Partial<AppSettings>) => {
    setError(null)
    try {
      const updated = await window.glaia.settings.update(patch)
      setLocal(updated)
      onChange(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.updateFailed'))
    }
  }

  const reportBug = async () => {
    setError(null)
    try {
      await window.glaia.app.reportBug()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.reportBugFailed'))
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="modal">
        <h2 id={titleId}>{t('settings.title')}</h2>

        {error && (
          <div className="field__error" role="alert">
            {error}
          </div>
        )}

        <div className="field">
          <label htmlFor="setting-theme">{t('settings.theme')}</label>
          <select
            id="setting-theme"
            value={local.theme}
            onChange={(e) =>
              apply({ theme: e.target.value as AppSettings['theme'] })
            }
          >
            <option value="system">{t('settings.themeSystem')}</option>
            <option value="light">{t('settings.themeLight')}</option>
            <option value="dark">{t('settings.themeDark')}</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="setting-locale">{t('settings.locale')}</label>
          <select
            id="setting-locale"
            value={local.locale}
            onChange={(e) =>
              apply({ locale: e.target.value as AppSettings['locale'] })
            }
          >
            <option value="it">{t('settings.localeIt')}</option>
            <option value="en">{t('settings.localeEn')}</option>
          </select>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={local.compactSidebar}
            onChange={(e) => apply({ compactSidebar: e.target.checked })}
          />
          {t('settings.compactSidebar')}
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={local.reducedMotion}
            onChange={(e) => apply({ reducedMotion: e.target.checked })}
          />
          {t('settings.reducedMotion')}
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={local.confirmBeforeReset}
            onChange={(e) => apply({ confirmBeforeReset: e.target.checked })}
          />
          {t('settings.confirmReset')}
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={local.showProviderLabels}
            onChange={(e) => apply({ showProviderLabels: e.target.checked })}
          />
          {t('settings.showLabels')}
        </label>

        <p className="field__hint">{t('settings.localNote')}</p>

        <div className="settings-action">
          <button type="button" className="btn" onClick={reportBug}>
            {t('settings.reportBug')}
          </button>
          <span className="field__hint">{t('settings.reportBugHint')}</span>
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            {t('settings.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
