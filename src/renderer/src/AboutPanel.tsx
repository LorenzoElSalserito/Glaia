import React, { useEffect, useId, useState } from 'react'
import { useT } from './i18n'

interface AboutPanelProps {
  onClose: () => void
}

export function AboutPanel({ onClose }: AboutPanelProps): JSX.Element {
  const titleId = useId()
  const t = useT()
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    let alive = true
    window.glaia.app
      .getVersion()
      .then((v) => {
        if (alive) setVersion(v)
      })
      .catch(() => {
        if (alive) setVersion('')
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="modal">
        <h2 id={titleId}>{t('about.title')}</h2>
        <p>
          <strong>{t('about.version')}:</strong>{' '}
          {version ? t('about.versionLine', { version }) : '—'}
        </p>
        <p>
          <strong>{t('about.license')}:</strong> {t('about.licenseBody')}
        </p>
        <p>{t('about.intro')}</p>
        <p>{t('about.credit')}</p>
        <p>
          <strong>{t('about.principlesTitle')}</strong>
        </p>
        <ul>
          <li>{t('about.principleLocal')}</li>
          <li>{t('about.principleA11y')}</li>
          <li>{t('about.principleSecurity')}</li>
          <li>{t('about.principleTransparency')}</li>
        </ul>
        <div className="modal__actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            {t('about.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
