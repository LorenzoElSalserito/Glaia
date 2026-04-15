import { app } from 'electron'
import { join } from 'path'

export function getGlaiaDocumentsDir(): string {
  return join(app.getPath('documents'), 'Glaia')
}

export function getSettingsPath(): string {
  return join(getGlaiaDocumentsDir(), 'settings.json')
}

export function getProviderCatalogPath(): string {
  return join(getGlaiaDocumentsDir(), 'providers.catalog.json')
}

export function getLogPath(): string {
  return join(getGlaiaDocumentsDir(), 'logs', 'glaia.log')
}
