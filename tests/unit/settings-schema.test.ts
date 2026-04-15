import { describe, expect, it } from 'vitest'
import { AppSettingsSchema } from '../../src/shared/contracts'

describe('AppSettingsSchema', () => {
  it('applies defaults', () => {
    const parsed = AppSettingsSchema.parse({ schemaVersion: '1.0' })
    expect(parsed.theme).toBe('system')
    expect(parsed.locale).toBe('it')
    expect(parsed.compactSidebar).toBe(false)
    expect(parsed.confirmBeforeReset).toBe(true)
    expect(parsed.selectedProviderId).toBeNull()
  })

  it('rejects unknown theme', () => {
    const result = AppSettingsSchema.safeParse({
      schemaVersion: '1.0',
      theme: 'neon',
    })
    expect(result.success).toBe(false)
  })

  it('accepts string for selectedProviderId', () => {
    const parsed = AppSettingsSchema.parse({
      schemaVersion: '1.0',
      selectedProviderId: 'chatgpt',
    })
    expect(parsed.selectedProviderId).toBe('chatgpt')
  })

  it('rejects unknown locale', () => {
    const result = AppSettingsSchema.safeParse({
      schemaVersion: '1.0',
      locale: 'fr',
    })
    expect(result.success).toBe(false)
  })
})
