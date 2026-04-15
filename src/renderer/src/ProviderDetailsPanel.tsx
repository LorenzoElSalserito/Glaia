import React, { useEffect, useId } from 'react'
import type { ProviderManifest } from '../../shared/contracts'
import { useT } from './i18n'

interface ProviderDetailsPanelProps {
  provider: ProviderManifest
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onResetSession: () => void
}

export function ProviderDetailsPanel({
  provider,
  onClose,
  onEdit,
  onDelete,
  onResetSession,
}: ProviderDetailsPanelProps): JSX.Element {
  const titleId = useId()
  const t = useT()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const permissions =
    [
      provider.allowPopups && t('details.permPopup'),
      provider.allowNotifications && t('details.permNotifications'),
      provider.allowClipboardRead && t('details.permClipboardRead'),
      provider.allowClipboardWrite && t('details.permClipboardWrite'),
    ]
      .filter(Boolean)
      .join(', ') || t('details.permNone')

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="modal">
        <h2 id={titleId}>{provider.name}</h2>
        <dl className="details-list">
          <dt>{t('details.identifier')}</dt>
          <dd>
            <code>{provider.id}</code>
          </dd>
          <dt>{t('details.startUrl')}</dt>
          <dd>{provider.startUrl}</dd>
          <dt>{t('details.partition')}</dt>
          <dd>
            <code>{provider.partition}</code>
          </dd>
          <dt>{t('details.permissions')}</dt>
          <dd>{permissions}</dd>
          <dt>{t('details.state')}</dt>
          <dd>
            {provider.enabled ? t('details.enabled') : t('details.disabled')}
          </dd>
        </dl>

        <p className="field__hint">{t('details.resetHint')}</p>

        <div className="modal__actions">
          <button type="button" className="btn" onClick={onResetSession}>
            {t('details.resetLocal')}
          </button>
          <button type="button" className="btn btn--danger" onClick={onDelete}>
            {t('details.remove')}
          </button>
          <button type="button" className="btn" onClick={onEdit}>
            {t('details.edit')}
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            {t('details.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
