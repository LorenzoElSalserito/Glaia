import React, { useEffect, useId, useRef, useState } from 'react'
import type { ProviderManifest } from '../../shared/contracts'
import { useT } from './i18n'

interface ProviderFormProps {
  initial?: ProviderManifest | null
  onClose: () => void
  onSubmit: (provider: ProviderManifest) => Promise<void>
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function ProviderForm({
  initial,
  onClose,
  onSubmit,
}: ProviderFormProps): JSX.Element {
  const isEdit = Boolean(initial)
  const titleId = useId()
  const t = useT()

  const [name, setName] = useState(initial?.name ?? '')
  const [id, setId] = useState(initial?.id ?? '')
  const [startUrl, setStartUrl] = useState(initial?.startUrl ?? 'https://')
  const [partition, setPartition] = useState(initial?.partition ?? '')
  const [allowPopups, setAllowPopups] = useState(initial?.allowPopups ?? false)
  const [allowNotifications, setAllowNotifications] = useState(
    initial?.allowNotifications ?? false
  )
  const [allowClipboardRead, setAllowClipboardRead] = useState(
    initial?.allowClipboardRead ?? false
  )
  const [allowClipboardWrite, setAllowClipboardWrite] = useState(
    initial?.allowClipboardWrite ?? true
  )
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [])

  useEffect(() => {
    if (isEdit) return
    const slug = slugify(name)
    setId(slug)
    if (slug) setPartition(`persist:provider.${slug}.default`)
  }, [name, isEdit])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const finalId = isEdit ? initial!.id : id || slugify(name)
      const finalPartition =
        partition.trim() || `persist:provider.${finalId}.default`

      if (!finalId) {
        throw new Error(t('form.errIdRequired'))
      }
      if (!startUrl.startsWith('https://')) {
        throw new Error(t('form.errHttps'))
      }
      if (!finalPartition.startsWith('persist:provider.')) {
        throw new Error(t('form.errPartition'))
      }

      const provider: ProviderManifest = {
        schemaVersion: '1.0',
        id: finalId,
        name: name.trim(),
        startUrl: startUrl.trim(),
        partition: finalPartition.trim(),
        allowPopups,
        allowNotifications,
        allowClipboardRead,
        allowClipboardWrite,
        userAgentMode: 'default',
        enabled,
      }

      await onSubmit(provider)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : t('form.errGeneric')
      setError(message)
    } finally {
      setSubmitting(false)
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
        <h2 id={titleId}>
          {isEdit ? t('form.editTitle') : t('form.createTitle')}
        </h2>

        {error && (
          <div className="field__error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="provider-name">{t('form.name')}</label>
            <input
              id="provider-name"
              ref={firstFieldRef}
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('form.namePlaceholder')}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label htmlFor="provider-id">{t('form.id')}</label>
            <input
              id="provider-id"
              type="text"
              required
              value={id}
              onChange={(e) => setId(slugify(e.target.value))}
              disabled={isEdit}
              placeholder={t('form.idPlaceholder')}
              autoComplete="off"
            />
            <span className="field__hint">{t('form.idHint')}</span>
          </div>

          <div className="field">
            <label htmlFor="provider-url">{t('form.url')}</label>
            <input
              id="provider-url"
              type="url"
              required
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              placeholder={t('form.urlPlaceholder')}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label htmlFor="provider-partition">{t('form.partition')}</label>
            <input
              id="provider-partition"
              type="text"
              required
              value={partition}
              onChange={(e) => setPartition(e.target.value)}
              placeholder={t('form.partitionPlaceholder')}
              autoComplete="off"
            />
            <span className="field__hint">{t('form.partitionHint')}</span>
          </div>

          <fieldset className="fieldset">
            <legend>{t('form.permissions')}</legend>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={allowPopups}
                onChange={(e) => setAllowPopups(e.target.checked)}
              />
              {t('form.allowPopups')}
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={allowNotifications}
                onChange={(e) => setAllowNotifications(e.target.checked)}
              />
              {t('form.allowNotifications')}
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={allowClipboardRead}
                onChange={(e) => setAllowClipboardRead(e.target.checked)}
              />
              {t('form.allowClipboardRead')}
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={allowClipboardWrite}
                onChange={(e) => setAllowClipboardWrite(e.target.checked)}
              />
              {t('form.allowClipboardWrite')}
            </label>
          </fieldset>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            {t('form.enabled')}
          </label>

          <div className="modal__actions">
            <button type="button" className="btn" onClick={onClose}>
              {t('form.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={submitting}
            >
              {submitting
                ? t('form.saving')
                : isEdit
                  ? t('form.saveChanges')
                  : t('form.saveProvider')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
