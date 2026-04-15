import { app } from 'electron'
import { dirname, join } from 'path'
import { promises as fs } from 'fs'
import { AppSettingsSchema, type AppSettings } from '../shared/contracts'
import { getSettingsPath } from './appPaths'

const DEFAULT_SETTINGS: AppSettings = AppSettingsSchema.parse({
  schemaVersion: '1.0',
})

export class SettingsManager {
  private readonly settingsPath: string
  private currentSettings: AppSettings = DEFAULT_SETTINGS

  constructor(settingsPath?: string) {
    this.settingsPath = settingsPath ?? getSettingsPath()
  }

  public async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.settingsPath, 'utf8')
      const parsed: unknown = JSON.parse(data)
      const normalized = this.migrate(parsed)
      const result = AppSettingsSchema.safeParse(normalized)
      if (result.success) {
        this.currentSettings = result.data
      } else {
        console.warn(
          '[settings] invalid settings file, using defaults',
          result.error.flatten()
        )
        this.currentSettings = DEFAULT_SETTINGS
        await this.save()
      }
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      if (err.code !== 'ENOENT') {
        console.error('[settings] failed to read settings', err)
      }
      const migrated = await this.tryLoadLegacySettings()
      if (migrated) return
      this.currentSettings = DEFAULT_SETTINGS
      await this.save()
    }
  }

  private async tryLoadLegacySettings(): Promise<boolean> {
    const legacyPath = join(app.getPath('userData'), 'settings.json')
    if (legacyPath === this.settingsPath) return false
    try {
      const data = await fs.readFile(legacyPath, 'utf8')
      const parsed: unknown = JSON.parse(data)
      const normalized = this.migrate(parsed)
      const result = AppSettingsSchema.safeParse(normalized)
      if (!result.success) return false
      this.currentSettings = result.data
      await this.save()
      return true
    } catch {
      return false
    }
  }

  private migrate(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object') return raw
    const obj = { ...(raw as Record<string, unknown>) }
    if ('lastSelectedProviderId' in obj && !('selectedProviderId' in obj)) {
      obj.selectedProviderId = obj.lastSelectedProviderId
      delete obj.lastSelectedProviderId
    }
    obj.schemaVersion = '1.0'
    return obj
  }

  public get(): AppSettings {
    return this.currentSettings
  }

  public async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const merged = { ...this.currentSettings, ...patch }
    const result = AppSettingsSchema.safeParse(merged)
    if (!result.success) {
      throw new Error(`Invalid settings patch: ${result.error.message}`)
    }
    this.currentSettings = result.data
    await this.save()
    return this.currentSettings
  }

  private async save(): Promise<void> {
    const tmp = `${this.settingsPath}.tmp`
    await fs.mkdir(dirname(this.settingsPath), { recursive: true })
    await fs.writeFile(
      tmp,
      JSON.stringify(this.currentSettings, null, 2),
      'utf8'
    )
    await fs.rename(tmp, this.settingsPath)
  }
}
