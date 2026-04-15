import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from 'react'
import type { AppSettings } from '../../shared/contracts'

type Locale = AppSettings['locale']

type Messages = Record<string, string>

type VarMap = Record<string, string | number>

const it: Messages = {
  'app.brand': 'Glaia',
  'app.welcomeTitle': 'Benvenuto in Glaia',
  'app.welcomeBody':
    'Seleziona un provider dalla sidebar per aprirlo qui. Le sessioni restano locali, isolate e persistenti per ciascun provider.',
  'app.providerArea': 'Area provider',
  'app.providerContent': 'Contenuto provider',
  'app.providerCatalog': 'Catalogo provider',
  'app.providersAvailable': 'Provider AI disponibili',
  'app.navCommands': 'Comandi di navigazione provider',

  'sidebar.providers': 'Provider',
  'sidebar.empty': 'Nessun provider configurato.',
  'sidebar.add': '+ Aggiungi provider',
  'sidebar.import': 'Importa',
  'sidebar.importAria': 'Importa catalogo provider',
  'sidebar.export': 'Esporta',
  'sidebar.exportAria': 'Esporta catalogo provider',
  'sidebar.about': 'Informazioni',
  'sidebar.aboutAria': 'Informazioni su Glaia',
  'sidebar.settings': 'Impostazioni',
  'sidebar.settingsAria': 'Apri impostazioni',
  'sidebar.details': 'Dettagli',
  'sidebar.detailsAria': 'Dettagli del provider {name}',

  'toolbar.back': 'Indietro',
  'toolbar.forward': 'Avanti',
  'toolbar.reload': 'Ricarica',
  'toolbar.hardReload': 'Ricarica forzata',
  'toolbar.hardReloadAria': 'Ricarica ignorando la cache',
  'toolbar.home': 'Home',
  'toolbar.homeAria': 'Torna alla pagina iniziale del provider',
  'toolbar.openExternal': 'Apri nel browser',
  'toolbar.openExternalAria': 'Apri nel browser di sistema',
  'toolbar.loading': 'Caricamento…',
  'toolbar.error': 'Errore {code}',

  'settings.title': 'Impostazioni',
  'settings.theme': 'Tema',
  'settings.themeSystem': 'Segui il sistema',
  'settings.themeLight': 'Chiaro',
  'settings.themeDark': 'Scuro',
  'settings.locale': 'Lingua',
  'settings.localeIt': 'Italiano',
  'settings.localeEn': 'English',
  'settings.compactSidebar': 'Sidebar compatta',
  'settings.reducedMotion': 'Riduci animazioni (accessibilità)',
  'settings.confirmReset': 'Chiedi conferma prima di resettare un provider',
  'settings.showLabels': 'Mostra etichette nei provider',
  'settings.localNote':
    'Glaia salva tutti i dati in locale. Nessuna telemetria, nessun backend remoto.',
  'settings.reportBug': 'Segnala un bug',
  'settings.reportBugHint':
    'Apre il programma mail di sistema con i log recenti nel corpo del messaggio.',
  'settings.reportBugFailed': 'Impossibile aprire il programma mail',
  'settings.close': 'Chiudi',
  'settings.updateFailed': 'Aggiornamento fallito',

  'about.title': 'Glaia',
  'about.version': 'Versione',
  'about.license': 'Licenza',
  'about.licenseBody':
    'AGPL-3.0-only. Il codice sorgente è disponibile e ogni modifica deve essere condivisa con la stessa licenza.',
  'about.intro':
    'Glaia è un AI Workspace Desktop open source che consente di usare in un unico ambiente una lista curata di provider AI web, mantenendo le sessioni isolate e persistenti per provider.',
  'about.principlesTitle': 'Principi chiave',
  'about.principleLocal': 'Local-first e privacy by design',
  'about.principleA11y': 'Accessibilità WCAG 2.2 AA come baseline',
  'about.principleSecurity': 'Sicurezza: sandbox + contextIsolation + default deny',
  'about.principleTransparency':
    'Trasparenza: nessun bypass dei provider, nessuna telemetria',
  'about.credit':
    'Glaia è un progetto Open Source sviluppato da © Lorenzo De Marco (Lorenzo DM). Considerate una donazione per gli sforzi effettuati.',
  'about.versionLine': '{version} © Lorenzo DM - 2026',
  'about.close': 'Chiudi',

  'form.editTitle': 'Modifica provider',
  'form.createTitle': 'Aggiungi provider',
  'form.name': 'Nome provider',
  'form.namePlaceholder': 'es. ChatGPT',
  'form.id': 'Identificativo (id)',
  'form.idPlaceholder': 'es. chatgpt',
  'form.idHint':
    'Solo lettere minuscole, numeri e trattini. Immutabile dopo la creazione.',
  'form.url': 'URL iniziale (https)',
  'form.urlPlaceholder': 'https://chatgpt.com/',
  'form.partition': 'Partition di sessione',
  'form.partitionPlaceholder': 'persist:provider.chatgpt.default',
  'form.partitionHint': 'Deve iniziare con persist:provider.',
  'form.permissions': 'Permessi del provider',
  'form.allowPopups': 'Consenti popup',
  'form.allowNotifications': 'Consenti notifiche',
  'form.allowClipboardRead': 'Consenti lettura appunti',
  'form.allowClipboardWrite': 'Consenti scrittura appunti',
  'form.enabled': 'Provider abilitato nel catalogo',
  'form.cancel': 'Annulla',
  'form.saving': 'Salvataggio…',
  'form.saveChanges': 'Salva modifiche',
  'form.saveProvider': 'Salva provider',
  'form.errGeneric': 'Errore durante il salvataggio',
  'form.errIdRequired': 'Identificativo provider obbligatorio',
  'form.errHttps': 'L’URL iniziale deve usare https',
  'form.errPartition': 'La partition deve iniziare con "persist:provider."',

  'details.identifier': 'Identificativo',
  'details.startUrl': 'URL iniziale',
  'details.partition': 'Partition di sessione',
  'details.permissions': 'Permessi attivi',
  'details.state': 'Stato',
  'details.enabled': 'abilitato',
  'details.disabled': 'disabilitato',
  'details.permPopup': 'popup',
  'details.permNotifications': 'notifiche',
  'details.permClipboardRead': 'lettura appunti',
  'details.permClipboardWrite': 'scrittura appunti',
  'details.permNone': 'nessuno',
  'details.resetHint':
    'Reset cancella solo i dati locali (cookie, cache, storage) di questa partition. I dati lato provider restano del provider.',
  'details.resetLocal': 'Reset dati locali',
  'details.remove': 'Rimuovi dal catalogo',
  'details.edit': 'Modifica',
  'details.close': 'Chiudi',

  'confirm.delete':
    'Rimuovere "{name}" dal catalogo? I dati locali della partition non vengono cancellati.',
  'confirm.reset':
    'Resettare i dati locali di "{name}"? Verranno cancellati cookie, cache e storage di questa partition.',

  'status.providerCreated': 'Provider "{name}" creato',
  'status.providerUpdated': 'Provider "{name}" aggiornato',
  'status.providerRemoved': 'Provider "{name}" rimosso',
  'status.sessionReset': 'Sessione di "{name}" resettata',
  'status.catalogExported': 'Catalogo esportato',
  'status.importResult':
    'Importati: {imported}, aggiornati: {updated}, scartati: {skipped}',
  'status.importFailed': 'Importazione fallita',
}

const en: Messages = {
  'app.brand': 'Glaia',
  'app.welcomeTitle': 'Welcome to Glaia',
  'app.welcomeBody':
    'Pick a provider from the sidebar to open it here. Sessions stay local, isolated and persistent per provider.',
  'app.providerArea': 'Provider area',
  'app.providerContent': 'Provider content',
  'app.providerCatalog': 'Provider catalog',
  'app.providersAvailable': 'Available AI providers',
  'app.navCommands': 'Provider navigation commands',

  'sidebar.providers': 'Providers',
  'sidebar.empty': 'No providers configured.',
  'sidebar.add': '+ Add provider',
  'sidebar.import': 'Import',
  'sidebar.importAria': 'Import provider catalog',
  'sidebar.export': 'Export',
  'sidebar.exportAria': 'Export provider catalog',
  'sidebar.about': 'About',
  'sidebar.aboutAria': 'About Glaia',
  'sidebar.settings': 'Settings',
  'sidebar.settingsAria': 'Open settings',
  'sidebar.details': 'Details',
  'sidebar.detailsAria': 'Details for provider {name}',

  'toolbar.back': 'Back',
  'toolbar.forward': 'Forward',
  'toolbar.reload': 'Reload',
  'toolbar.hardReload': 'Hard reload',
  'toolbar.hardReloadAria': 'Reload ignoring cache',
  'toolbar.home': 'Home',
  'toolbar.homeAria': 'Go to provider home page',
  'toolbar.openExternal': 'Open in browser',
  'toolbar.openExternalAria': 'Open in system browser',
  'toolbar.loading': 'Loading…',
  'toolbar.error': 'Error {code}',

  'settings.title': 'Settings',
  'settings.theme': 'Theme',
  'settings.themeSystem': 'Follow system',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.locale': 'Language',
  'settings.localeIt': 'Italiano',
  'settings.localeEn': 'English',
  'settings.compactSidebar': 'Compact sidebar',
  'settings.reducedMotion': 'Reduce motion (accessibility)',
  'settings.confirmReset': 'Ask before resetting a provider',
  'settings.showLabels': 'Show provider labels',
  'settings.localNote':
    'Glaia stores all data locally. No telemetry, no remote backend.',
  'settings.reportBug': 'Report a bug',
  'settings.reportBugHint':
    'Opens the system mail app with recent logs in the message body.',
  'settings.reportBugFailed': 'Unable to open the mail app',
  'settings.close': 'Close',
  'settings.updateFailed': 'Update failed',

  'about.title': 'Glaia',
  'about.version': 'Version',
  'about.license': 'License',
  'about.licenseBody':
    'AGPL-3.0-only. Source code is available and every modification must be shared under the same license.',
  'about.intro':
    'Glaia is an open-source AI Workspace Desktop that lets you use a curated list of web AI providers in one place, keeping sessions isolated and persistent per provider.',
  'about.principlesTitle': 'Core principles',
  'about.principleLocal': 'Local-first and privacy by design',
  'about.principleA11y': 'WCAG 2.2 AA accessibility baseline',
  'about.principleSecurity': 'Security: sandbox + contextIsolation + default deny',
  'about.principleTransparency':
    'Transparency: no provider bypass, no telemetry',
  'about.credit':
    'Glaia is an open-source project developed by © Lorenzo De Marco (Lorenzo DM). Please consider a donation to support the work.',
  'about.versionLine': '{version} © Lorenzo DM - 2026',
  'about.close': 'Close',

  'form.editTitle': 'Edit provider',
  'form.createTitle': 'Add provider',
  'form.name': 'Provider name',
  'form.namePlaceholder': 'e.g. ChatGPT',
  'form.id': 'Identifier (id)',
  'form.idPlaceholder': 'e.g. chatgpt',
  'form.idHint':
    'Lowercase letters, digits and dashes only. Immutable after creation.',
  'form.url': 'Start URL (https)',
  'form.urlPlaceholder': 'https://chatgpt.com/',
  'form.partition': 'Session partition',
  'form.partitionPlaceholder': 'persist:provider.chatgpt.default',
  'form.partitionHint': 'Must start with persist:provider.',
  'form.permissions': 'Provider permissions',
  'form.allowPopups': 'Allow popups',
  'form.allowNotifications': 'Allow notifications',
  'form.allowClipboardRead': 'Allow clipboard read',
  'form.allowClipboardWrite': 'Allow clipboard write',
  'form.enabled': 'Provider enabled in catalog',
  'form.cancel': 'Cancel',
  'form.saving': 'Saving…',
  'form.saveChanges': 'Save changes',
  'form.saveProvider': 'Save provider',
  'form.errGeneric': 'Error while saving',
  'form.errIdRequired': 'Provider identifier is required',
  'form.errHttps': 'Start URL must use https',
  'form.errPartition': 'Partition must start with "persist:provider."',

  'details.identifier': 'Identifier',
  'details.startUrl': 'Start URL',
  'details.partition': 'Session partition',
  'details.permissions': 'Active permissions',
  'details.state': 'State',
  'details.enabled': 'enabled',
  'details.disabled': 'disabled',
  'details.permPopup': 'popup',
  'details.permNotifications': 'notifications',
  'details.permClipboardRead': 'clipboard read',
  'details.permClipboardWrite': 'clipboard write',
  'details.permNone': 'none',
  'details.resetHint':
    'Reset only clears local data (cookies, cache, storage) for this partition. Data on the provider side stays with the provider.',
  'details.resetLocal': 'Reset local data',
  'details.remove': 'Remove from catalog',
  'details.edit': 'Edit',
  'details.close': 'Close',

  'confirm.delete':
    'Remove "{name}" from the catalog? Local partition data will not be wiped.',
  'confirm.reset':
    'Reset local data for "{name}"? Cookies, cache and storage for this partition will be cleared.',

  'status.providerCreated': 'Provider "{name}" created',
  'status.providerUpdated': 'Provider "{name}" updated',
  'status.providerRemoved': 'Provider "{name}" removed',
  'status.sessionReset': 'Session for "{name}" has been reset',
  'status.catalogExported': 'Catalog exported',
  'status.importResult':
    'Imported: {imported}, updated: {updated}, skipped: {skipped}',
  'status.importFailed': 'Import failed',
}

const tables: Record<Locale, Messages> = { it, en }

function format(template: string, vars?: VarMap): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`
  )
}

export function translate(
  locale: Locale,
  key: string,
  vars?: VarMap
): string {
  const table = tables[locale] ?? tables.it
  const template = table[key] ?? tables.it[key] ?? key
  return format(template, vars)
}

interface I18nContextValue {
  locale: Locale
  t: (key: string, vars?: VarMap) => string
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'it',
  t: (key) => key,
})

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}): JSX.Element {
  const t = useCallback(
    (key: string, vars?: VarMap): string => translate(locale, key, vars),
    [locale]
  )

  const value = useMemo(() => ({ locale, t }), [locale, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT(): I18nContextValue['t'] {
  return useContext(I18nContext).t
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale
}
